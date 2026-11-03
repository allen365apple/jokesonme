import Link from "next/link";
import { showPnlById, type Tx } from "@/lib/finance/calc";
import { seriesOf, SHOW_SERIES, type Show, type ShowSeries } from "@/lib/shows";

// 演出收支列表（取代每場一個下拉選單）：日期、名稱、類別 badge、收入、成本、淨利；可排序、可依類別篩選；點列進詳細頁。
// 伺服器端渲染，排序與篩選用網址參數（和逐筆、分析頁的做法一致，手機也不用等 JS）。
type SortKey = "date" | "name" | "income" | "expense" | "net";
const SORT_KEYS: SortKey[] = ["date", "name", "income", "expense", "net"];
const money = (n: number) => `${n < 0 ? "−" : ""}${Math.abs(Math.round(n)).toLocaleString()}`;
const SERIES_CLASS: Record<ShowSeries, string> = { 看我笑話: "s-main", 現代問題維修中心: "s-mpr", 專場: "s-special" };

export type PnlRow = { showId: string; name: string; date: string | null; series: ShowSeries | null; kind: string; income: number; expense: number; net: number };

export function buildPnlRows(txs: ReadonlyArray<Tx & { showId: string }>, shows: Show[]): PnlRow[] {
  const byId = new Map(shows.map((s) => [s.id, s]));
  return showPnlById(txs).map((p) => {
    const s = byId.get(p.showId);
    return {
      showId: p.showId, name: s?.name ?? p.name, date: s?.performanceDate ?? null, series: s ? seriesOf(s) : null, kind: s?.kind ?? "performance",
      income: p.income, expense: p.expense, net: p.net,
    };
  });
}

export function sortPnlRows(rows: PnlRow[], key: SortKey, dir: "asc" | "desc"): PnlRow[] {
  const mul = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (key === "name") return a.name.localeCompare(b.name, "zh-Hant") * mul;
    if (key === "date") {
      // 沒日期的（ledger 科目）永遠排最後
      if (!a.date && !b.date) return a.name.localeCompare(b.name, "zh-Hant");
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date.localeCompare(b.date) * mul;
    }
    if (key === "expense") return (Math.abs(a.expense) - Math.abs(b.expense)) * mul;
    return (a[key] - b[key]) * mul;
  });
}

export default function ShowPnlTable({ txs, shows, year, sort, dir, series, basePath, anchor = "", compact = false }: {
  txs: ReadonlyArray<Tx & { showId: string }>; shows: Show[]; year: string; sort?: string; dir?: string; series?: string; basePath: string; anchor?: string; compact?: boolean;
}) {
  const sortKey: SortKey = SORT_KEYS.includes(sort as SortKey) ? (sort as SortKey) : "date";
  const d: "asc" | "desc" = dir === "asc" || dir === "desc" ? dir : sortKey === "name" ? "asc" : "desc";
  const filter = (SHOW_SERIES as readonly string[]).includes(series ?? "") ? (series as ShowSeries) : null;
  const all = buildPnlRows(txs, shows);
  const rows = sortPnlRows(filter ? all.filter((r) => r.series === filter) : all, sortKey, d);
  const perf = rows.filter((r) => r.kind === "performance");
  const ledger = rows.filter((r) => r.kind !== "performance");
  const href = (q: Record<string, string | undefined>) => {
    const p = new URLSearchParams({ year });
    const merged = { sort: sortKey, dir: d, series: filter ?? undefined, ...q };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `${basePath}?${p}${anchor}`;
  };
  const sortLink = (key: SortKey, label: string) => {
    const next = sortKey === key ? (d === "asc" ? "desc" : "asc") : key === "name" ? "asc" : "desc";
    return <Link href={href({ sort: key, dir: next })}>{label}{sortKey === key ? (d === "asc" ? " ▲" : " ▼") : ""}</Link>;
  };
  const total = rows.reduce((s, r) => ({ income: s.income + r.income, expense: s.expense + r.expense, net: s.net + r.net }), { income: 0, expense: 0, net: 0 });

  const body = (list: PnlRow[]) => list.map((r) => (
    <tr key={r.showId}>
      <td>{r.date ? r.date.slice(5).replace("-", "/") : "—"}</td>
      <td className="name"><Link href={`/finance/shows/${r.showId}`}>{r.name}</Link></td>
      <td>{r.series ? <span className={`badge ${SERIES_CLASS[r.series]}`}>{r.series}</span> : <span className="tag">科目</span>}</td>
      <td className="pos">{money(r.income)}</td>
      <td className="neg">{money(r.expense)}</td>
      <td className={r.net < 0 ? "neg" : ""} style={{ fontWeight: 700 }}>{money(r.net)}</td>
    </tr>
  ));

  return (
    <>
      <div className="filter-chips" role="group" aria-label="依類別篩選">
        <Link className={!filter ? "on" : ""} href={href({ series: "" })}>全部</Link>
        {SHOW_SERIES.map((s) => <Link key={s} className={filter === s ? "on" : ""} href={href({ series: s })}>{s}</Link>)}
      </div>
      {rows.length === 0 ? <p className="empty">{year} 年沒有符合的收支</p> : (
        <div className={`table-wrap${compact ? " flat" : ""}`}>
          <table className="table pnl">
            <thead>
              <tr><th>{sortLink("date", "日期")}</th><th>{sortLink("name", "名稱")}</th><th>類別</th><th>{sortLink("income", "收入")}</th><th>{sortLink("expense", "成本")}</th><th>{sortLink("net", "淨利")}</th></tr>
            </thead>
            <tbody>
              {body(perf)}
              {ledger.length ? <tr className="group"><td colSpan={6}>非演出科目（會員、頻道、共同基金…）</td></tr> : null}
              {body(ledger)}
              <tr className="total">
                <td colSpan={3}>合計</td>
                <td className="pos">{money(total.income)}</td>
                <td className="neg">{money(total.expense)}</td>
                <td className={total.net < 0 ? "neg" : ""}>{money(total.net)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
