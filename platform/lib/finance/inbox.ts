// 待確認佇列的純函式：依演出分組、合計、與既有票房列對照（提醒可能重複）、Oen 票務摘要 vs transactions。
import { isBoxOfficeRow } from "./participants.ts";
import type { Tx } from "./calc.ts";

export type InboxLine = {
  id: number; showId: string | null; lineType: string; itemText: string | null; qty: number; txCategory: string | null;
  gross: number; fee: number; refund: number; net: number; reconBatch: string | null; mapConfidence: string;
  charge: { chargeNo: string; paidAt: string | null; status: string; payoutStatus: string; eventName: string | null };
};

export type InboxTotals = { lines: number; qty: number; gross: number; fee: number; refund: number; net: number };
export const sumLines = (lines: ReadonlyArray<Pick<InboxLine, "qty" | "gross" | "fee" | "refund" | "net">>): InboxTotals =>
  lines.reduce<InboxTotals>((s, l) => ({ lines: s.lines + 1, qty: s.qty + l.qty, gross: s.gross + l.gross, fee: s.fee + l.fee, refund: s.refund + l.refund, net: s.net + l.net }),
    { lines: 0, qty: 0, gross: 0, fee: 0, refund: 0, net: 0 });

export type InboxGroup<L extends InboxLine = InboxLine> = {
  showId: string | null;           // null = 對不到演出
  lines: L[];
  totals: InboxTotals;
  unpaid: number;                  // payout_status = 未撥款 的列數
  noCashflow: number;              // payout_status = 無金流 的列數
  guessed: number;                 // map_confidence = 推測 的列數
  nonSuccess: number;              // 金流狀態不是成功的列數（退款／失敗…）
  /** 這個演出既有的票房列合計（排除系統列與基金支付），用來提醒可能重複入帳 */
  existingBoxOffice: number;
  existingBoxOfficeRows: number;
};

export const SUCCESS_STATUSES: readonly string[] = ["已入帳", "付款成功"];

/** 依演出分組；對不到的（showId null）放最後。組內依付款時間由新到舊。 */
export function groupInbox<L extends InboxLine>(lines: L[], txsByShow: Map<string, Tx[]>, showOrder: (showId: string) => number): InboxGroup<L>[] {
  const map = new Map<string | null, L[]>();
  for (const l of lines) map.set(l.showId, [...(map.get(l.showId) ?? []), l]);
  const groups: InboxGroup<L>[] = [];
  for (const [showId, list] of map) {
    list.sort((a, b) => (b.charge.paidAt ?? "").localeCompare(a.charge.paidAt ?? "") || a.id - b.id);
    const existing = showId ? (txsByShow.get(showId) ?? []).filter(isBoxOfficeRow) : [];
    groups.push({
      showId, lines: list, totals: sumLines(list),
      unpaid: list.filter((l) => l.charge.payoutStatus === "未撥款").length,
      noCashflow: list.filter((l) => l.charge.payoutStatus === "無金流").length,
      guessed: list.filter((l) => l.mapConfidence === "推測").length,
      nonSuccess: list.filter((l) => !SUCCESS_STATUSES.includes(l.charge.status)).length,
      existingBoxOffice: existing.reduce((s, t) => s + t.amount, 0),
      existingBoxOfficeRows: existing.length,
    });
  }
  return groups.sort((a, b) => {
    if (a.showId === null) return 1;
    if (b.showId === null) return -1;
    return showOrder(a.showId) - showOrder(b.showId);
  });
}

/** Oen 票務摘要 vs transactions 的票房列（演出詳細頁）。差異 = Oen 淨額（已入帳列）− transactions 的 Oen 來源列合計。 */
export type OenVsBooks = {
  oen: InboxTotals & { booked: number; pending: number; skipped: number; historical: number };
  booksOenNet: number;       // transactions 裡 oen_key 開頭的列（收入＋手續費＋退款）合計
  booksBoxOffice: number;    // transactions 裡的票房列（isBoxOfficeRow）合計，含手動登記
  diff: number;              // oen 已入帳＋歷史列淨額 − booksOenNet
};
export function oenVsBooks(lines: ReadonlyArray<InboxLine & { bookingStatus: string }>, showTxs: ReadonlyArray<Tx & { oenKey: string | null }>): OenVsBooks {
  const counted = lines.filter((l) => l.bookingStatus === "booked" || l.bookingStatus === "historical");
  const totals = sumLines(counted);
  const status = (s: string) => lines.filter((l) => l.bookingStatus === s).length;
  const booksOenNet = showTxs.filter((t) => t.oenKey?.startsWith("oen:")).reduce((s, t) => s + t.amount, 0);
  const booksBoxOffice = showTxs.filter(isBoxOfficeRow).reduce((s, t) => s + t.amount, 0);
  return {
    oen: { ...totals, booked: status("booked"), pending: status("pending"), skipped: status("skipped"), historical: status("historical") },
    booksOenNet, booksBoxOffice, diff: totals.net - booksOenNet,
  };
}
