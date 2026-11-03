// 付費會員扣款數（2026-11-03 Jesse）：從 oen_charge_lines 的會員列推算。
//   - 方案只有一種（付費會員｜重度笑ㄟ），以金額分：149 = 月繳、1,699 = 年繳；其他金額歸「其他」不計入兩條線
//   - 月訂閱 = 該月（台北時間付款日）成功的月費扣款數
//   - 年訂閱有效 = 到該月底為止，過去 12 個月內的年費扣款數；另顯示每月新增年訂閱
//   - 這些是「扣款筆數」不是去重人數：Oen 資料沒有付款人識別碼
// 純函式；資料讀取在 oen.ts。
export const MONTHLY_PLAN_AMOUNT = 149;
export const ANNUAL_PLAN_AMOUNT = 1699;
/** Oen 金流狀態裡算「成功」的值（已入帳＋付款成功）。其他狀態（退款、失敗…）不計。 */
export const SUCCESS_STATUSES: readonly string[] = ["已入帳", "付款成功"];

export type MembershipLine = { paidAt: string | null; status: string; amount: number };
export type MembershipMonth = { month: string; monthly: number; annualNew: number; annualActive: number; other: number };

/** 時間戳記（ISO，Oen +08 已轉成 UTC）→ 台北的 YYYY-MM。 */
export function taipeiMonth(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit" }).format(new Date(iso)).slice(0, 7);
}

const shiftMonth = (ym: string, n: number): string => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
};

export function planOf(amount: number): "monthly" | "annual" | "other" {
  return amount === MONTHLY_PLAN_AMOUNT ? "monthly" : amount === ANNUAL_PLAN_AMOUNT ? "annual" : "other";
}

/** 從第一筆成功扣款的月份到 toMonth（YYYY-MM）逐月統計；沒有資料回傳空陣列。 */
export function membershipByMonth(lines: MembershipLine[], toMonth: string): MembershipMonth[] {
  const ok = lines.filter((l) => l.paidAt && SUCCESS_STATUSES.includes(l.status)).map((l) => ({ month: taipeiMonth(l.paidAt!), plan: planOf(l.amount) }));
  if (!ok.length) return [];
  const first = ok.map((l) => l.month).sort()[0];
  if (first > toMonth) return [];
  const out: MembershipMonth[] = [];
  for (let m = first; m <= toMonth; m = shiftMonth(m, 1)) {
    const windowStart = shiftMonth(m, -11); // 含當月共 12 個月
    out.push({
      month: m,
      monthly: ok.filter((l) => l.month === m && l.plan === "monthly").length,
      annualNew: ok.filter((l) => l.month === m && l.plan === "annual").length,
      annualActive: ok.filter((l) => l.plan === "annual" && l.month >= windowStart && l.month <= m).length,
      other: ok.filter((l) => l.month === m && l.plan === "other").length,
    });
  }
  return out;
}
