import { requirePage } from "@/lib/auth/current";
import { listTransactions } from "@/lib/finance/data";
import { listShows } from "@/lib/shows";
import { inYear, yearsOf } from "@/lib/finance/calc";
import { countPendingLines } from "@/lib/finance/oen";
import { todayInTaipei } from "@/lib/dates";
import FinanceHead from "@/components/finance-head";
import FinanceYearSelect from "@/components/finance-year-select";
import ShowPnlTable from "@/components/show-pnl-table";

// 演出收支列表（取代 /finance/transactions 的下拉選單）：點列進 /finance/shows/[id]
export default async function FinanceShowsPage({ searchParams }: PageProps<"/finance/shows">) {
  const sp = await searchParams;
  const me = await requirePage("finance", "/finance/shows");
  const actor = `user:${me.id}` as const;
  const [allTxs, shows, pending] = await Promise.all([listTransactions(actor), listShows(actor), countPendingLines(actor).catch(() => 0)]);
  const today = todayInTaipei();
  const years = yearsOf(allTxs, today.slice(0, 4));
  const year = typeof sp.year === "string" && years.includes(sp.year) ? sp.year : today.slice(0, 4);
  const q = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const keep = ["sort", "dir", "series"].filter((k) => q(k)).map((k) => `${k}=${encodeURIComponent(q(k)!)}`).join("&");

  return (
    <main className="page">
      <FinanceHead me={me} active="shows" title="演出收支" sub="點欄位名稱排序，點列看明細" pendingCount={pending} />
      <div className="content">
        <div className="toolbar">
          <FinanceYearSelect years={years} value={year} basePath="/finance/shows" query={keep || undefined} />
        </div>
        <ShowPnlTable txs={inYear(allTxs, year)} shows={shows} year={year} sort={q("sort")} dir={q("dir")} series={q("series")} basePath="/finance/shows" />
      </div>
    </main>
  );
}
