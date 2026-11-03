// 財務時程（2026-11-03 Jesse 決定）：固定規則，全部從「今天」（台北日曆）推算，不存資料庫；要改日期只改這裡。
//   - 每月 7 號：Oen 金流自動進明細並歸類（import_oen_ledger.py → oen_charges / oen_charge_lines → /finance/inbox 待確認）
//   - 每月 10 號：計算分潤、請財務出款（傑哥不在月出款名單，年底一次領）
//   - 看我笑話月號與 After Party 演出隔天：出技術費
// 純函式，node --test 可跑；畫面（首頁、財務總覽、列的狀態標籤）都用這裡的結果。
// TODO(phase 4)：LINE 提醒推播（7 號、10 號、演出隔天）尚未實作，之後由 cron 讀這裡的日期產生草稿。
import { addDays } from "../dates.ts";

export const OEN_LEDGER_DAY = 7;
export const PAYOUT_DAY = 10;
/** 年底結算日：傑哥的分潤一次領。 */
export const YEAR_END = "12-31";

export type ScheduleEvent = {
  key: "oen" | "payout" | "tech";
  /** 短標（chip 開頭），例如「7 號」 */
  lead: string;
  title: string;
  /** 下一次日期（YYYY-MM-DD）；技術費在沒有符合的演出時為 null */
  date: string | null;
  /** 距今天數（今天 = 0）；date 為 null 時為 null */
  days: number | null;
  /** 技術費：對應的演出名稱 */
  showName?: string;
};

export type ScheduleShow = { name: string; type: string; series: string | null; performanceDate: string | null; kind?: string };

const pad = (n: number) => String(n).padStart(2, "0");
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export function daysUntil(today: string, date: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
}

/** 下一個「每月 N 號」（含今天）。N 超過該月天數時取月底（規則裡的 7、10 不會遇到，仍防呆）。 */
export function nextMonthlyDate(today: string, dayOfMonth: number): string {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const build = (yy: number, mm: number) => `${yy}-${pad(mm)}-${pad(Math.min(dayOfMonth, daysInMonth(yy, mm)))}`;
  const thisMonth = build(y, m);
  if (thisMonth >= today) return thisMonth;
  return m === 12 ? build(y + 1, 1) : build(y, m + 1);
}

/** 哪些演出隔天要出技術費：看我笑話系列的月號（type = monthly）與 After Party。多場次演出 performance_date 已是最晚一場。 */
export function hasTechFee(show: Pick<ScheduleShow, "name" | "type" | "series" | "kind">): boolean {
  if (show.kind && show.kind !== "performance") return false;
  if (show.series !== "看我笑話") return false;
  return show.type === "monthly" || /after\s*party/i.test(show.name);
}

/** 技術費出款日 = 演出日 + 1。 */
export const techFeeDate = (performanceDate: string): string => addDays(performanceDate, 1);

/** 下一次技術費：演出日 + 1 ≥ 今天的最早一場。 */
export function nextTechFee(today: string, shows: ScheduleShow[]): { date: string; showName: string } | null {
  const candidates = shows
    .filter((s) => s.performanceDate && hasTechFee(s))
    .map((s) => ({ date: techFeeDate(s.performanceDate!), showName: s.name }))
    .filter((c) => c.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.showName.localeCompare(b.showName, "zh-Hant"));
  return candidates[0] ?? null;
}

/** 首頁與財務總覽的三顆 chip。 */
export function financeSchedule(today: string, shows: ScheduleShow[]): ScheduleEvent[] {
  const oen = nextMonthlyDate(today, OEN_LEDGER_DAY);
  const payout = nextMonthlyDate(today, PAYOUT_DAY);
  const tech = nextTechFee(today, shows);
  return [
    { key: "oen", lead: `${OEN_LEDGER_DAY} 號`, title: "Oen 金流進明細並歸類", date: oen, days: daysUntil(today, oen) },
    { key: "payout", lead: `${PAYOUT_DAY} 號`, title: "計算分潤、請財務出款", date: payout, days: daysUntil(today, payout) },
    { key: "tech", lead: "演出隔天", title: "出技術費", date: tech?.date ?? null, days: tech ? daysUntil(today, tech.date) : null, showName: tech?.showName },
  ];
}

/** 「M/D」短日期（chip 用，不含週幾）。 */
export const shortDate = (iso: string): string => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;

// ---- 列的狀態標籤：顯示下一個處理日 ----

export type RowStatus =
  | { kind: "oen_unpaid" }            // Oen 已售、未撥款
  | { kind: "oen_pending" }           // 已撥款、待確認（inbox）
  | { kind: "booked" }                // 已入帳的收支
  | { kind: "member_unsettled"; member: string } // 成員未領
  | { kind: "tech_fee"; performanceDate: string } // 技術費
  | { kind: "paid"; date: string };   // 已出款

export function nextProcessingLabel(status: RowStatus, today: string): string {
  switch (status.kind) {
    case "oen_unpaid": return `Oen 撥款後 ${shortDate(nextMonthlyDate(today, OEN_LEDGER_DAY))} 入帳`;
    case "oen_pending": return `確認後 ${shortDate(nextMonthlyDate(today, PAYOUT_DAY))} 計入分潤`;
    case "booked": return `${shortDate(nextMonthlyDate(today, PAYOUT_DAY))} 分潤`;
    case "member_unsettled":
      return status.member === "傑哥" ? `${YEAR_END.replace("-", "/").replace(/^0/, "")} 年底一次領` : `${shortDate(nextMonthlyDate(today, PAYOUT_DAY))} 出款`;
    case "tech_fee": return `演出隔天 ${shortDate(techFeeDate(status.performanceDate))} 出款`;
    case "paid": return `${shortDate(status.date)} 已付`;
  }
}
