// 應援匯入的資料出口（取代舊 GAS getShows / batchImportTransactions，回傳格式相同）。
// 每筆都驗證專案、分類、正負號、日期、來源鍵；全部合格才寫入。寫入與受影響專案的稅務預留重算在資料庫同一交易內完成。
// 2026-11 規則（_review/claude_review.md 1、2、3、8）：
//   - 一筆 Oen 金流一列（金流編號＋拆分列號＋部位 = oen_key），同鍵重匯會略過，不會算兩次
//   - 日期用該筆的撥款日，還沒撥款就用付款日；絕不用匯入當天
//   - 票房／周邊／退款列的排除成員依專案推測（設定 → 既有票房列 → 名稱 → 全員並提醒）；平台手續費永遠 8 人分
import { requireAction } from "@/lib/auth/current";
import { listShows, type Show } from "@/lib/shows";
import { importTransactions, listTransactions, type ImportRow } from "@/lib/finance/data";
import { isExpenseCategory, isIncomeCategory, MANUAL_EXPENSE_CATEGORIES, INCOME_CATEGORIES, normalizeExcluded } from "@/lib/finance/calc";
import { inferParticipants, SOURCE_LABEL, type Participants } from "@/lib/finance/participants";
import { logEvent } from "@/lib/audit";

const CATEGORIES = new Set<string>([...INCOME_CATEGORIES, ...MANUAL_EXPENSE_CATEGORIES]);
const FEE_CATEGORY = "平台手續";
const MAX_ROWS = 10000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const KEY_RE = /^[\w#:.\-]{1,120}$/;

const isRealDate = (s: string) => DATE_RE.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

type ShowInfo = { id: string; name: string; type: string; participants: Participants };

/** 每個專案的參與成員推測結果（GET 給畫面預覽；POST 用同一份決定排除成員）。 */
async function showInfos(actor: `user:${string}`): Promise<ShowInfo[]> {
  const [shows, txs] = await Promise.all([listShows(actor), listTransactions(actor)]);
  const byShow = new Map<string, typeof txs>();
  for (const t of txs) byShow.set(t.showId, [...(byShow.get(t.showId) ?? []), t]);
  return shows.map((s: Show) => ({ id: s.id, name: s.name, type: s.type, participants: inferParticipants(s, byShow.get(s.id) ?? []) }));
}
const publicShow = (s: ShowInfo) => ({
  id: s.id, name: s.name, type: s.type,
  participants: s.participants.included, source: s.participants.source, sourceLabel: SOURCE_LABEL[s.participants.source], needsReview: s.participants.needsReview,
});

export async function GET(): Promise<Response> {
  let me;
  try {
    me = await requireAction("finance");
  } catch {
    return Response.json({ success: false, error: "沒有權限" }, { status: 403 });
  }
  const shows = await showInfos(`user:${me.id}`);
  return Response.json({ success: true, data: shows.map(publicShow) });
}

type Incoming = { showName?: string; category?: string; notes?: string; amount?: number; date?: string; oenKey?: string; excludedMembers?: string[] };

export async function POST(request: Request): Promise<Response> {
  let me;
  try {
    me = await requireAction("finance");
  } catch {
    return Response.json({ success: false, error: "沒有權限" }, { status: 403 });
  }
  const actor = `user:${me.id}` as const;
  const body = (await request.json().catch(() => null)) as { transactions?: Incoming[] } | null;
  const list = body?.transactions;
  if (!Array.isArray(list) || list.length === 0) return Response.json({ success: false, error: "沒有要匯入的交易資料" });
  if (list.length > MAX_ROWS) return Response.json({ success: false, error: `一次最多匯入 ${MAX_ROWS} 筆` });

  const shows = new Map((await showInfos(actor)).map((s) => [s.name, s]));
  const used = new Map<string, ShowInfo>();
  const keys = new Set<string>();
  const rows: ImportRow[] = [];
  for (const [i, t] of list.entries()) {
    const n = i + 1;
    const show = shows.get((t.showName ?? "").trim());
    const amount = Number(t.amount);
    const category = (t.category ?? "").trim();
    const date = (t.date ?? "").trim();
    const oenKey = (t.oenKey ?? "").trim();
    if (!show) return Response.json({ success: false, error: `第 ${n} 筆的專案「${t.showName}」不存在` });
    if (!CATEGORIES.has(category)) return Response.json({ success: false, error: `第 ${n} 筆的分類「${category}」不正確` });
    if (!Number.isFinite(amount) || amount === 0) return Response.json({ success: false, error: `第 ${n} 筆的金額不正確` });
    if (isIncomeCategory(category) && amount < 0) return Response.json({ success: false, error: `第 ${n} 筆：收入分類「${category}」的金額必須是正數` });
    if (isExpenseCategory(category) && amount > 0) return Response.json({ success: false, error: `第 ${n} 筆：支出分類「${category}」的金額必須是負數` });
    if (!isRealDate(date)) return Response.json({ success: false, error: `第 ${n} 筆缺少日期（撥款日或付款日），不能用匯入當天` });
    if (!KEY_RE.test(oenKey)) return Response.json({ success: false, error: `第 ${n} 筆缺少來源鍵（Oen 金流編號）` });
    if (keys.has(oenKey)) return Response.json({ success: false, error: `第 ${n} 筆的來源鍵「${oenKey}」在這批裡重複` });
    keys.add(oenKey);

    let excluded: string[];
    try {
      // 平台手續費 8 人分；其他（票房、周邊、會費、退款）依專案；畫面若明確送了排除成員就用它
      excluded = category === FEE_CATEGORY ? [] : Array.isArray(t.excludedMembers) ? normalizeExcluded(t.excludedMembers) : show.participants.excludedMembers;
    } catch (e) {
      return Response.json({ success: false, error: `第 ${n} 筆：${e instanceof Error ? e.message : String(e)}` });
    }
    used.set(show.id, show);
    rows.push({
      show_id: show.id, category, notes: (t.notes ?? "").trim().slice(0, 200), amount, date,
      excluded_members: excluded, recorded_by: "應援匯入", oen_key: oenKey,
    });
  }

  let result;
  try {
    result = await importTransactions(actor, rows);
  } catch (e) {
    return Response.json({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
  const summaryShows = [...used.values()].map(publicShow);
  await logEvent(actor, "finance.import", { rows: rows.length, inserted: result.inserted, skipped: result.skipped, review: summaryShows.filter((s) => s.needsReview).map((s) => s.name) });
  return Response.json({ success: true, data: { count: result.inserted, inserted: result.inserted, skipped: result.skipped, shows: summaryShows } });
}
