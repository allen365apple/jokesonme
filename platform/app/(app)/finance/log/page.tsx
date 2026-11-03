import Link from "next/link";
import { requirePage } from "@/lib/auth/current";
import { listRecentTransactions, type LogRow } from "@/lib/finance/data";
import { countPendingLines } from "@/lib/finance/oen";
import { formatMonthDay, formatTaipeiStamp, todayInTaipei } from "@/lib/dates";
import FinanceHead from "@/components/finance-head";

const money = (n: number) => `${n > 0 ? "+" : n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString()}`;
const STEP = 50;
const MAX = 200; // 加入者要用 id 清單查操作紀錄，太多會讓網址過長

export default async function LogPage({ searchParams }: PageProps<"/finance/log">) {
  const sp = await searchParams;
  const me = await requirePage("finance", "/finance/log");
  const n = Math.min(MAX, Math.max(STEP, Number(sp.n) || STEP));
  const showDeleted = sp.deleted === "1";
  const [rows, pending] = await Promise.all([listRecentTransactions(`user:${me.id}`, n, showDeleted), countPendingLines(`user:${me.id}`).catch(() => 0)]);

  // 依「加入的那一天」分組；10/3 從舊 Google Sheet 搬入的列沒有加入時間（舊表沒記），另成一組
  const groups: { key: string; label: string; rows: LogRow[] }[] = [];
  for (const r of rows) {
    const key = r.legacy ? "legacy" : todayInTaipei(new Date(r.createdAt));
    let g = groups.at(-1);
    if (!g || g.key !== key) {
      g = { key, label: key === "legacy" ? "從舊表搬入（舊表沒有記加入時間）" : `${formatMonthDay(key)} 加入`, rows: [] };
      groups.push(g);
    }
    g.rows.push(r);
  }
  const href = (next: { n?: number; deleted?: boolean }) => {
    const q = new URLSearchParams();
    const nn = next.n ?? n;
    if (nn !== STEP) q.set("n", String(nn));
    if (next.deleted ?? showDeleted) q.set("deleted", "1");
    const s = q.toString();
    return `/finance/log${s ? `?${s}` : ""}`;
  };

  return (
    <main className="page">
      <FinanceHead me={me} active="log" title="紀錄" sub="最近加入的收支，新的在上面。用來對帳：誰、哪天、加了哪一筆。" pendingCount={pending} />
      <div className="content">
        <div className="toolbar">
          <span className="toolbar-note">最近 {rows.length} 筆</span>
          <Link className="btn btn-ghost btn-sm" href={href({ deleted: !showDeleted })}>{showDeleted ? "隱藏已刪除" : "也顯示已刪除"}</Link>
        </div>
        {rows.length === 0 ? <p className="empty">還沒有任何收支</p> : null}
        {groups.map((g) => (
          <section key={g.key + g.rows[0].id}>
            <div className="section"><b>{g.label}</b><span>{g.rows.length} 筆</span></div>
            <ul className="log-list">
              {g.rows.map((r) => (
                <li key={r.id} className={`log-row${r.deletedAt ? " deleted" : ""}`}>
                  <div className="log-who">
                    <b>{r.addedBy ?? r.recordedBy ?? "（沒填）"}</b>
                    <span>{r.legacy ? "舊表登記" : formatTaipeiStamp(r.createdAt).split(" ")[1]}</span>
                  </div>
                  <div className="log-main">
                    <div className="log-title">{r.notes || r.category}</div>
                    <div className="meta">
                      <span className="tag">{r.category}</span>
                      <Link href={`/finance/shows/${r.showId}`}>{r.showName}</Link>
                      <span>收支日 {formatMonthDay(r.date)}</span>
                      {r.advancedBy ? <span>{r.advancedBy} 墊</span> : null}
                      {r.paidByFund ? <span>共同基金付</span> : null}
                      {r.deletedAt ? <span className="badge unsettled">已刪除{r.deletedBy ? `（${r.deletedBy}）` : ""}</span> : null}
                    </div>
                  </div>
                  <span className={`amount ${r.amount >= 0 ? "pos" : "neg"}`}>{money(r.amount)}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {rows.length === n && n < MAX ? (
          <Link className="btn btn-ghost btn-block" href={href({ n: n + STEP })}>再看 {STEP} 筆</Link>
        ) : null}
        {rows.length === n && n >= MAX ? (
          <a className="toggle-done" href="/api/finance/export">更早的資料請下載全部收支（CSV）</a>
        ) : null}
      </div>
    </main>
  );
}
