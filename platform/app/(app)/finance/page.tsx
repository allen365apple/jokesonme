import Link from "next/link";
import { requirePage } from "@/lib/auth/current";
import { listLedger, listTransactions } from "@/lib/finance/data";
import { listShows, pickableShows, seriesOf, toPickerData } from "@/lib/shows";
import { commonFund, INCOME_CATEGORIES, MANUAL_EXPENSE_CATEGORIES, incomeComposition, inYear, memberEarnings, MEMBERS, monthlyTrend, taxReserveSummary, yearsOf, yearSummary } from "@/lib/finance/calc";
import { membershipByMonth } from "@/lib/finance/members";
import { countPendingLines, listMembershipLines } from "@/lib/finance/oen";
import { financeSchedule, nextProcessingLabel } from "@/lib/finance/schedule";
import { todayInTaipei } from "@/lib/dates";
import { displayName } from "@/lib/auth/users";
import FinanceHead, { FORECAST_URL } from "@/components/finance-head";
import FinanceSchedule from "@/components/finance-schedule";
import FinanceYearSelect from "@/components/finance-year-select";
import LedgerButtons from "@/components/ledger-sheet";
import { CompositionChart, MembershipChart, MonthlyChart } from "@/components/charts";
import ShowPnlTable from "@/components/show-pnl-table";
import FinanceQuickAdd from "@/components/finance-quick-add";
import { IconChevron } from "@/components/icons";

const money = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(Math.round(n)).toLocaleString()}`;
const cls = (n: number) => (n >= 0 ? "pos" : "neg");

// 財務總覽（2026-11-03 改版）：右下角＋新增收支（先選專案）→ 年度選擇 → 年度 KPI → 每月收支圖＋收入組成 → 成員分潤卡 → 付費會員 → 演出收支列表 → 待確認
export default async function FinanceOverview({ searchParams }: PageProps<"/finance">) {
  const sp = await searchParams;
  const me = await requirePage("finance", "/finance");
  const actor = `user:${me.id}` as const;
  const [allTxs, settlements, repayments, shows, memberLines, pending] = await Promise.all([
    listTransactions(actor), listLedger(actor, "settlements"), listLedger(actor, "advance_repayments"), listShows(actor),
    listMembershipLines(actor).catch(() => []), countPendingLines(actor).catch(() => 0),
  ]);
  const today = todayInTaipei();
  const years = yearsOf([...allTxs, ...settlements, ...repayments], today.slice(0, 4));
  const year = typeof sp.year === "string" && years.includes(sp.year) ? sp.year : today.slice(0, 4);
  const txs = inYear(allTxs, year);
  const sum = yearSummary(allTxs, year);
  const fund = commonFund(allTxs, year);
  const tax = taxReserveSummary(allTxs, year);
  const members = memberEarnings(allTxs, settlements, repayments, year);
  const months = monthlyTrend(allTxs, year);
  const parts = incomeComposition(txs);
  const schedule = financeSchedule(today, shows.map((s) => ({ name: s.name, type: s.type, series: seriesOf(s), performanceDate: s.performanceDate, kind: s.kind })));
  const thisMonth = today.slice(0, 7);
  const membership = membershipByMonth(memberLines, year === thisMonth.slice(0, 4) ? thisMonth : `${year}-12`).filter((r) => r.month.startsWith(year));
  const sort = typeof sp.sort === "string" ? sp.sort : undefined;
  const dir = typeof sp.dir === "string" ? sp.dir : undefined;
  const series = typeof sp.series === "string" ? sp.series : undefined;
  const picker = toPickerData(pickableShows(shows, today));
  const ledgers = shows.filter((s) => s.kind === "ledger").map((s) => ({ id: s.id, name: s.name })).sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));

  return (
    <main className="page">
      <FinanceHead me={me} active="overview" title="財務" sub={`${year} 年度（台北日曆年）`} pendingCount={pending} />
      <div className="content">
        <FinanceSchedule events={schedule} />
        <div className="toolbar">
          <FinanceYearSelect years={years} value={year} />
          <span className="toolbar-note">{txs.length} 筆有效收支</span>
        </div>
        <FinanceQuickAdd picker={picker} ledgers={ledgers} members={MEMBERS} incomeCategories={INCOME_CATEGORIES} expenseCategories={MANUAL_EXPENSE_CATEGORIES} me={displayName(me)} today={today} />
        <div className="grid-stats kpi">
          <div className="card"><small>收入</small><span className="amount pos">{money(sum.totalIncome)}</span></div>
          <div className="card"><small>成本</small><span className="amount neg">{money(sum.totalExpense)}</span><em>含稅務預留與退款</em></div>
          <div className="card"><small>淨利</small><span className={`amount ${cls(sum.netProfit)}`}>{money(sum.netProfit)}</span></div>
          <div className="card"><small>稅務預留</small><span className="amount">{money(tax.reserved)}</span><em>3% 自動提列，基礎 {money(tax.base)}</em></div>
          <div className="card"><small>共同基金餘額</small><span className={`amount ${cls(fund.fundBalance)}`}>{money(fund.fundBalance)}</span><em>{fund.fundCarryIn !== 0 ? `上年結轉 ${money(fund.fundCarryIn)} + ` : ""}提撥 {money(fund.fundReserved)} − 動用 {money(fund.fundUsed)}（累計至 {year} 年底）</em></div>
        </div>

        <div className="two-col">
          <section>
            <div className="section"><h2>每月收入與支出</h2><span>淨利為折線</span></div>
            <MonthlyChart rows={months} />
          </section>
          <section>
            <div className="section"><h2>收入組成</h2><span>{year} 年</span></div>
            {parts.length ? <CompositionChart parts={parts} total={sum.totalIncome} /> : <p className="empty">尚無收入</p>}
          </section>
        </div>

        <section>
          <div className="section"><h2>成員分潤</h2><span>年度應得 − 已出款</span></div>
          <div className="member-grid">
            {members.map((m) => (
              <div key={m.name} className="member-tile">
                <header>
                  <b>{m.name}</b>
                  {m.name === "傑哥" ? <span className="tag free">年底一次領</span> : null}
                </header>
                <dl>
                  <dt>已賺</dt><dd className={cls(m.annualNet)}>{money(m.annualNet)}</dd>
                  <dt>已付</dt><dd>{money(m.settled)}</dd>
                  <dt>未付</dt><dd className={m.unsettledNet < 0 ? "neg" : ""}>{money(m.unsettledNet)}</dd>
                  {m.advanceUnsettled !== 0 ? <><dt>代墊未結清</dt><dd className="neg" title={m.advanceUnsettled < 0 ? "超還：代墊已結清大於代墊總額" : undefined}>{money(m.advanceUnsettled)}</dd></> : null}
                </dl>
                <small className="next-date">{m.unsettledNet > 0 ? nextProcessingLabel({ kind: "member_unsettled", member: m.name }, today) : "無未付"}</small>
              </div>
            ))}
          </div>
          <p className="fine">只有 8 人均分的列提撥 20% 共同基金；專場列由參與者分；平台手續費永遠 8 人分。共同淨利 {money(fund.commonNetProfit)}、可分配 {money(fund.distributableCommonNet)}。</p>
          <LedgerButtons members={MEMBERS} today={today} />
        </section>

        <section>
          <div className="section"><h2>付費會員</h2><span>扣款筆數，不是去重人數</span></div>
          {membership.length ? (
            <MembershipChart rows={membership} partialMonth={year === thisMonth.slice(0, 4) ? thisMonth : null} />
          ) : <p className="empty">這一年沒有會員扣款資料（來源：Oen 明細的會員列）</p>}
          <p className="fine">以金額分：149 = 月繳、1,699 = 年繳。月訂閱 = 該月成功的月費扣款數；年訂閱有效 = 過去 12 個月內的年費扣款數。Oen 資料沒有付款人識別碼，真實人數需 Oen 後台會員匯出。{year === thisMonth.slice(0, 4) ? "＊本月尚未扣完。" : ""}</p>
        </section>

        <section id="shows">
          <div className="section"><h2>演出收支</h2><Link href="/finance/shows">全部 <IconChevron className="chev" /></Link></div>
          <ShowPnlTable txs={txs} shows={shows} year={year} sort={sort} dir={dir} series={series} basePath="/finance" anchor="#shows" compact />
        </section>

        <Link className="card link-row" href="/finance/inbox">
          <span className="row-main"><b>待確認</b><span className="meta">{pending ? `${pending} 筆 Oen 明細等待核准` : "沒有待確認的 Oen 明細"}・{nextProcessingLabel({ kind: "oen_pending" }, today)}</span></span>
          <IconChevron className="chev" />
        </Link>
        <a className="toggle-done" href={FORECAST_URL} target="_blank" rel="noreferrer">財務預估（Google Sheet）↗</a>
        <a className="toggle-done" href="/api/finance/export">下載全部收支（CSV）</a>
      </div>
    </main>
  );
}
