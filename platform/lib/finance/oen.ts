// Oen 金流明細（oen_charges / oen_charge_lines，0012）的讀取，與待確認佇列的寫入（0015 的 RPC）。
// 平台對這兩張表只有 select；核准／略過／改派全部走 security definer 函式，金額與分類由資料庫從明細列取，呼叫端只給排除成員。
import { db, type Actor } from "../supabase.ts";
import type { MembershipLine } from "./members.ts";

export type BookingStatus = "pending" | "booked" | "skipped" | "historical";

export type OenLine = {
  id: number; lineNo: number; lineType: string; itemText: string | null; qty: number;
  showId: string | null; mapConfidence: string; mapNote: string | null; txCategory: string | null;
  gross: number; fee: number; refund: number; net: number; reconBatch: string | null;
  bookingStatus: BookingStatus; transactionId: string | null; bookedAt: string | null; bookedBy: string | null; bookingNote: string | null;
  charge: { id: number; chargeNo: string; paidAt: string | null; createdAtOen: string; chargeType: string; status: string; payoutStatus: string; eventName: string | null; memberPlan: string | null };
};

type DbLine = {
  id: number; line_no: number; line_type: string; item_text: string | null; qty: number; show_id: string | null; map_confidence: string; map_note: string | null;
  tx_category: string | null; gross: number; fee: number; refund: number; net: number; recon_batch: string | null;
  booking_status: BookingStatus; transaction_id: string | null; booked_at: string | null; booked_by: string | null; booking_note: string | null;
  oen_charges: { id: number; charge_no: string; paid_at: string | null; created_at_oen: string; charge_type: string; status: string; payout_status: string; event_name: string | null; member_plan: string | null };
};
const LINE_SELECT = "id, line_no, line_type, item_text, qty, show_id, map_confidence, map_note, tx_category, gross, fee, refund, net, recon_batch, booking_status, transaction_id, booked_at, booked_by, booking_note, oen_charges!inner(id, charge_no, paid_at, created_at_oen, charge_type, status, payout_status, event_name, member_plan)";

const toLine = (r: DbLine): OenLine => ({
  id: Number(r.id), lineNo: r.line_no, lineType: r.line_type, itemText: r.item_text, qty: r.qty, showId: r.show_id, mapConfidence: r.map_confidence, mapNote: r.map_note,
  txCategory: r.tx_category, gross: Number(r.gross), fee: Number(r.fee), refund: Number(r.refund), net: Number(r.net), reconBatch: r.recon_batch,
  bookingStatus: r.booking_status, transactionId: r.transaction_id, bookedAt: r.booked_at, bookedBy: r.booked_by, bookingNote: r.booking_note,
  charge: {
    id: Number(r.oen_charges.id), chargeNo: r.oen_charges.charge_no, paidAt: r.oen_charges.paid_at, createdAtOen: r.oen_charges.created_at_oen, chargeType: r.oen_charges.charge_type,
    status: r.oen_charges.status, payoutStatus: r.oen_charges.payout_status, eventName: r.oen_charges.event_name, memberPlan: r.oen_charges.member_plan,
  },
});

const PAGE = 1000;
type Filter = Record<string, string | null>; // 值為 null 表示 is null
/** Supabase 預設一次最多 1000 列；明細表有數千列，分頁讀完。 */
async function readAll(actor: Actor, filter: Filter, label: string): Promise<DbLine[]> {
  const out: DbLine[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = db(actor).from("oen_charge_lines").select(LINE_SELECT).order("id").range(from, from + PAGE - 1);
    for (const [k, v] of Object.entries(filter)) q = v === null ? q.is(k, null) : q.eq(k, v);
    const { data, error } = await q.returns<DbLine[]>();
    if (error) throw new Error(`${label}: ${error.message}`);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

/** 待確認：還沒連到 transactions、狀態 pending 的列（含對不到演出的）。 */
export async function listPendingLines(actor: Actor): Promise<OenLine[]> {
  return (await readAll(actor, { booking_status: "pending", transaction_id: null }, "list pending oen lines")).map(toLine);
}

/** 最近略過的列（給佇列頁的「已略過」區，可復原）。 */
export async function listSkippedLines(actor: Actor, limit = 100): Promise<OenLine[]> {
  const { data, error } = await db(actor).from("oen_charge_lines").select(LINE_SELECT).eq("booking_status", "skipped").order("booked_at", { ascending: false }).limit(limit).returns<DbLine[]>();
  if (error) throw new Error(`list skipped oen lines: ${error.message}`);
  return (data ?? []).map(toLine);
}

/** 某演出的全部明細列（演出詳細頁的 Oen 票務摘要）。 */
export async function listLinesForShow(actor: Actor, showId: string): Promise<OenLine[]> {
  return (await readAll(actor, { show_id: showId }, "list oen lines for show")).map(toLine);
}

/** 會員扣款列（付費會員圖）：只要付款時間、狀態、金額。 */
export async function listMembershipLines(actor: Actor): Promise<MembershipLine[]> {
  return (await readAll(actor, { line_type: "membership" }, "list membership lines")).map((r) => ({ paidAt: r.oen_charges.paid_at, status: r.oen_charges.status, amount: Number(r.gross) }));
}

export async function countPendingLines(actor: Actor): Promise<number> {
  const { count, error } = await db(actor).from("oen_charge_lines").select("id", { count: "exact", head: true }).eq("booking_status", "pending").is("transaction_id", null);
  if (error) throw new Error(`count pending oen lines: ${error.message}`);
  return count ?? 0;
}

// ---- 寫入（RPC） ----

async function rpc<T>(actor: Actor, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db(actor).rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export type ApproveItem = { line_id: number; excluded_members: string[] };
export type ApproveResult = { booked: number; inserted: number; linked: number };
/** 核准：建立 transactions（income / fee / refund）、回寫 transaction_id、重算稅務預留。同列重送不會多建。 */
export async function approveOenLines(actor: Actor, items: ApproveItem[], recordedBy: string): Promise<ApproveResult> {
  const r = await rpc<{ booked: number; inserted: number; linked: number }>(actor, "finance_oen_approve", { p_items: items, p_recorded_by: recordedBy });
  return { booked: Number(r?.booked ?? 0), inserted: Number(r?.inserted ?? 0), linked: Number(r?.linked ?? 0) };
}
export async function skipOenLines(actor: Actor, ids: number[], reason: string, actorName: string): Promise<number> {
  return Number(await rpc<number>(actor, "finance_oen_skip", { p_line_ids: ids, p_reason: reason, p_actor_name: actorName }));
}
export async function unskipOenLines(actor: Actor, ids: number[]): Promise<number> {
  return Number(await rpc<number>(actor, "finance_oen_unskip", { p_line_ids: ids }));
}
export async function markOenLinesHistorical(actor: Actor, ids: number[], actorName: string, note: string): Promise<number> {
  return Number(await rpc<number>(actor, "finance_oen_mark_historical", { p_line_ids: ids, p_actor_name: actorName, p_note: note }));
}
export async function reassignOenLines(actor: Actor, ids: number[], showId: string, txCategory: string | null, actorName: string): Promise<number> {
  return Number(await rpc<number>(actor, "finance_oen_reassign", { p_line_ids: ids, p_show_id: showId, p_tx_category: txCategory, p_actor_name: actorName }));
}
