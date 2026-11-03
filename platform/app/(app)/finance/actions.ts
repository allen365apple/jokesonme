"use server";
// 財務寫入（spec: supabase-data-store；規則對照 gas/Code.gs addTransaction / updateTransaction / deleteTransaction / addSettlement / addAdvanceReimbursement）。
// 收支的新增／編輯／刪除都走資料庫函式（0013_finance_rules.sql），寫入與稅務預留重算在同一交易內。
// 待議（本次只記不改，_review/claude_review.md 16、17、20）：
//   - 權限分級：結算、還款、刪除目前所有財務區使用者都能做，是否限 admin
//   - deleted_by 存 LINE userId、recorded_by 可任填：顯示時應對照 users 表、新增時固定用登入者
import { revalidatePath } from "next/cache";
import { requireAction } from "@/lib/auth/current";
import { db } from "@/lib/supabase";
import { INCOME_CATEGORIES, MANUAL_EXPENSE_CATEGORIES, MEMBERS, normalizeExcluded } from "@/lib/finance/calc";
import { importTransactions, listTransactions, saveTransactionRow, setShowParticipants as setShowParticipantsDb, softDeleteTransaction } from "@/lib/finance/data";
import { approveOenLines, listPendingLines, markOenLinesHistorical, reassignOenLines, skipOenLines, unskipOenLines } from "@/lib/finance/oen";
import { inferParticipants } from "@/lib/finance/participants";
import { listShows } from "@/lib/shows";
import { logEvent } from "@/lib/audit";

function s(fd: FormData, k: string): string {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
}
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

export type ActionResult = { ok: true } | { ok: false; error: string };

/** 正式環境會隱藏 server action 丟出的錯誤訊息，所以改成回傳原因讓畫面顯示。 */
async function guarded(fn: () => Promise<void>): Promise<ActionResult> {
  try {
    await fn();
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[finance action]", msg);
    return { ok: false, error: msg.startsWith("forbidden") ? "沒有權限" : msg };
  }
}

function revalidateFinance() {
  revalidatePath("/finance");
  revalidatePath("/finance/shows");
  revalidatePath("/finance/shows/[id]", "page");
  revalidatePath("/finance/inbox");
  revalidatePath("/finance/log");
  revalidatePath("/home");
}

export async function saveTransaction(fd: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const me = await requireAction("finance");
    const actor = `user:${me.id}` as const;
    const id = s(fd, "id");
    const kind = s(fd, "kind") === "income" ? "income" : "expense";
    const category = s(fd, "category");
    // 分類決定正負號；「稅務預留」只能由系統產生，手動不能選
    const allowed: readonly string[] = kind === "income" ? INCOME_CATEGORIES : MANUAL_EXPENSE_CATEGORIES;
    if (!allowed.includes(category)) throw new Error("分類不正確");
    const raw = Number(s(fd, "amount"));
    if (!Number.isFinite(raw) || raw <= 0) throw new Error("金額要大於 0");
    const amount = kind === "income" ? raw : -raw;
    const date = s(fd, "date");
    if (!isDate(date)) throw new Error("日期不正確");
    // 規則：收入不能由共同基金支付、也沒有墊款人；共同基金支付的支出沒有墊款人、也不排除任何人
    const paidByFund = kind === "expense" && s(fd, "paid_by_fund") === "1";
    let advancedBy = s(fd, "advanced_by");
    if (advancedBy === "__other") advancedBy = s(fd, "advanced_by_other");
    if (kind === "income" || paidByFund) advancedBy = "";
    const included = new Set(fd.getAll("included").filter((v): v is string => typeof v === "string"));
    const excluded = paidByFund ? [] : normalizeExcluded(MEMBERS.filter((m) => !included.has(m)));
    const row = {
      category, notes: s(fd, "notes").slice(0, 200), amount, date,
      advanced_by: advancedBy || null,
      excluded_members: excluded,
      paid_by_fund: paidByFund,
      recorded_by: s(fd, "recorded_by") || me.member_name || me.display_name,
    };
    const showId = s(fd, "show_id");
    if (!id && !showId) throw new Error("請選擇專案");
    await saveTransactionRow(actor, id || null, id ? null : showId, row);
    revalidateFinance();
  });
}

export async function deleteTransaction(fd: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const me = await requireAction("finance");
    const id = s(fd, "id");
    if (!id) throw new Error("找不到這筆收支（可能已被刪除）");
    await softDeleteTransaction(`user:${me.id}`, id, me.id);
    revalidateFinance();
  });
}

/**
 * 專案參與成員（誰分這個專案的票房與退款）。清除設定 = 回到匯入時推測。
 * apply=1 會把這個專案現有的收支（平台手續費、基金支付、系統列除外）一起改成同樣的排除成員，稅務預留跟著重新分組。
 */
export async function setShowParticipants(fd: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const me = await requireAction("finance");
    const showId = s(fd, "show_id");
    if (!showId) throw new Error("請選擇專案");
    const clear = s(fd, "clear") === "1";
    const included = new Set(fd.getAll("included").filter((v): v is string => typeof v === "string"));
    const excluded = clear ? null : normalizeExcluded(MEMBERS.filter((m) => !included.has(m)));
    await setShowParticipantsDb(`user:${me.id}`, showId, excluded, !clear && s(fd, "apply") === "1");
    revalidateFinance();
  });
}

async function addLedger(table: "settlements" | "advance_repayments", fd: FormData) {
  const me = await requireAction("finance");
  const member = s(fd, "member");
  if (!(MEMBERS as readonly string[]).includes(member)) throw new Error("請選擇成員");
  const amount = Number(s(fd, "amount"));
  const notes = s(fd, "notes").slice(0, 100);
  if (!Number.isFinite(amount) || amount === 0) throw new Error("金額不能是 0");
  // 結算可以登記負數校正列（沖回登記錯的結算），但要寫備註；代墊還款一律正數
  if (table === "advance_repayments" && amount < 0) throw new Error("還款金額要大於 0");
  if (amount < 0 && !notes) throw new Error("負數校正列請填備註說明原因");
  const date = s(fd, "date");
  if (!isDate(date)) throw new Error("日期不正確");
  const { error } = await db(`user:${me.id}`).from(table).insert({ member, amount, date, notes });
  if (error) throw new Error(error.message);
  revalidateFinance();
}

/** 成員結算：只記利潤分配，不夾帶代墊還款。 */
export async function addSettlement(fd: FormData): Promise<ActionResult> {
  return guarded(() => addLedger("settlements", fd));
}

/** 代墊還款：代墊結清狀態由這本帳 FIFO 推導。 */
export async function addRepayment(fd: FormData): Promise<ActionResult> {
  return guarded(() => addLedger("advance_repayments", fd));
}

// ---- 待確認佇列（Oen 明細 → transactions；0015 的 RPC） ----

const ids = (fd: FormData): number[] => fd.getAll("line_id").map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0);
const KEY_RE = /^[\w#:.\-]{1,120}$/;

/**
 * 核准：排除成員依專案推測（設定 → 既有票房列 → 名稱 → 全員），畫面若明確送了 included 就用它；
 * 平台手續費永遠 8 人分（資料庫端固定，這裡不用管）。金額、分類、日期由資料庫從明細列取。
 */
export async function approveInbox(fd: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const me = await requireAction("finance");
    const actor = `user:${me.id}` as const;
    const lineIds = ids(fd);
    if (!lineIds.length) throw new Error("沒有選到任何明細列");
    const [pending, shows, txs] = await Promise.all([listPendingLines(actor), listShows(actor), listTransactions(actor)]);
    const chosen = pending.filter((l) => lineIds.includes(l.id));
    if (!chosen.length) throw new Error("這些明細列已經處理過了");
    const override = fd.has("included") ? new Set(fd.getAll("included").filter((v): v is string => typeof v === "string")) : null;
    const byShow = new Map<string, typeof txs>();
    for (const t of txs) byShow.set(t.showId, [...(byShow.get(t.showId) ?? []), t]);
    const items = chosen.map((l) => {
      if (!l.showId) throw new Error(`Oen ${l.charge.chargeNo} 還沒指定演出，請先改派`);
      const show = shows.find((s) => s.id === l.showId);
      if (!show) throw new Error(`Oen ${l.charge.chargeNo} 指定的演出不存在`);
      const excluded = override ? normalizeExcluded(MEMBERS.filter((m) => !override.has(m))) : inferParticipants(show, byShow.get(show.id) ?? []).excludedMembers;
      return { line_id: l.id, excluded_members: excluded };
    });
    const r = await approveOenLines(actor, items, me.member_name || me.display_name);
    await logEvent(actor, "finance.inbox.approve", { lines: items.length, ...r });
    revalidateFinance();
  });
}

export async function skipInbox(fd: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const me = await requireAction("finance");
    const lineIds = ids(fd);
    if (!lineIds.length) throw new Error("沒有選到任何明細列");
    await skipOenLines(`user:${me.id}`, lineIds, s(fd, "reason").slice(0, 200), me.member_name || me.display_name);
    revalidateFinance();
  });
}

export async function unskipInbox(fd: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const me = await requireAction("finance");
    const lineIds = ids(fd);
    if (!lineIds.length) throw new Error("沒有選到任何明細列");
    await unskipOenLines(`user:${me.id}`, lineIds);
    revalidateFinance();
  });
}

/** Jesse 確認某批未撥款／無金流列其實早就入帳：標為歷史，不建 transactions。 */
export async function markInboxHistorical(fd: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const me = await requireAction("finance");
    const lineIds = ids(fd);
    if (!lineIds.length) throw new Error("沒有選到任何明細列");
    await markOenLinesHistorical(`user:${me.id}`, lineIds, me.member_name || me.display_name, s(fd, "note").slice(0, 200));
    revalidateFinance();
  });
}

export async function reassignInbox(fd: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const me = await requireAction("finance");
    const lineIds = ids(fd);
    if (!lineIds.length) throw new Error("沒有選到任何明細列");
    const showId = s(fd, "show_id");
    if (!showId) throw new Error("請選擇演出");
    const category = s(fd, "category");
    if (category && !(INCOME_CATEGORIES as readonly string[]).includes(category)) throw new Error("分類不正確");
    await reassignOenLines(`user:${me.id}`, lineIds, showId, category || null, me.member_name || me.display_name);
    revalidateFinance();
  });
}

/**
 * 非 Oen 項目的快速輸入（場地、剪輯、工作人員、品牌贊助、ACCUPASS…）：走 finance_save_transaction。
 * ACCUPASS 若填了結算編號，改走 finance_import_transactions，用 accupass:<編號>:<部位> 當來源鍵防重複（票房＋手續費兩列）。
 */
export async function quickEntry(fd: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const me = await requireAction("finance");
    const actor = `user:${me.id}` as const;
    const showId = s(fd, "show_id");
    if (!showId) throw new Error("請選擇專案");
    const date = s(fd, "date");
    if (!isDate(date)) throw new Error("日期不正確");
    const notes = s(fd, "notes").slice(0, 200);
    const recordedBy = s(fd, "recorded_by") || me.member_name || me.display_name;
    const accupassKey = s(fd, "accupass_key");
    if (accupassKey) {
      if (!KEY_RE.test(accupassKey)) throw new Error("ACCUPASS 結算編號只能是英數、-、_、.");
      const gross = Number(s(fd, "amount"));
      const fee = Number(s(fd, "fee") || 0);
      if (!Number.isFinite(gross) || gross <= 0) throw new Error("票房金額要大於 0");
      if (!Number.isFinite(fee) || fee < 0) throw new Error("手續費不能是負數");
      const included = new Set(fd.getAll("included").filter((v): v is string => typeof v === "string"));
      const excluded = normalizeExcluded(MEMBERS.filter((m) => !included.has(m)));
      const rows = [
        { show_id: showId, category: "演出票房", notes: notes || `ACCUPASS ${accupassKey}`, amount: gross, date, excluded_members: excluded, recorded_by: recordedBy, oen_key: `accupass:${accupassKey}:income` },
        ...(fee > 0 ? [{ show_id: showId, category: "平台手續", notes: `ACCUPASS 手續費 ${accupassKey}`, amount: -fee, date, excluded_members: [], recorded_by: recordedBy, oen_key: `accupass:${accupassKey}:fee` }] : []),
      ];
      const r = await importTransactions(actor, rows);
      if (r.inserted === 0) throw new Error(`ACCUPASS ${accupassKey} 已經登記過，沒有重複寫入`);
      revalidateFinance();
      return;
    }
    // 其他快捷：沿用 saveTransaction 的驗證（分類決定正負號、基金支付、墊款人、分配）
    const r = await saveTransaction(fd);
    if (!r.ok) throw new Error(r.error);
  });
}
