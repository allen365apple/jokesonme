import Link from "next/link";
import { requirePage } from "@/lib/auth/current";
import { daysBetween, listPerformances, pickableShows, seriesOf, SHOW_SERIES, SHOW_TYPE_LABEL, type Show } from "@/lib/shows";
import { listTodos } from "@/lib/todos";
import { formatMonthDay, todayInTaipei } from "@/lib/dates";
import TopBar from "@/components/top-bar";
import DateBadge from "@/components/date-badge";
import { IconChevron, IconPlus } from "@/components/icons";
import { listIdeas } from "@/lib/ideas";
import { createShow } from "./actions";

const ERRORS: Record<string, string> = {
  name: "請填寫演出名稱",
  date: "月號一定要填演出日期",
  series: "請選擇類別",
  dup: "已經有同名的演出",
  save: "儲存失敗，請再試一次",
};

// 演出分頁（spec show-planning-page「Monthly planning page」）：只列演出，分「接下來」與「已演出／其他」。
export default async function ShowsPage({ searchParams }: PageProps<"/shows">) {
  const sp = await searchParams;
  const me = await requirePage("planning", "/shows");
  const today = todayInTaipei();
  const [shows, todos, ideas] = await Promise.all([listPerformances(`user:${me.id}`), listTodos(`user:${me.id}`), listIdeas(`user:${me.id}`, {})]);
  const { next, upcoming, more } = pickableShows(shows, today);
  const openCount = (id: string) => todos.filter((t) => t.show?.id === id && !t.doneAt).length;
  const noteCount = (id: string) => ideas.filter((i) => i.showId === id).length;
  const err = typeof sp.err === "string" ? ERRORS[sp.err] : undefined;

  return (
    <main className="page">
      <TopBar me={me} title="演出" />
      <div className="content">
        {next ? (
          <Link href={`/shows/${next.id}`} className="hero">
            <div className="hero-top"><span>下一場・{seriesOf(next)}・{SHOW_TYPE_LABEL[next.type]}</span><IconChevron className="chev" /></div>
            <div className="hero-title">{next.name}</div>
            <div className="hero-stats">
              <div><b>{formatMonthDay(next.performanceDate!)}</b><span>演出日</span></div>
              <div><b>{daysBetween(today, next.performanceDate!)} 天</b><span>倒數</span></div>
              <div><b>{noteCount(next.id)} 則</b><span>筆記</span></div>
              <div><b>{openCount(next.id)} 件</b><span>未完成待辦</span></div>
            </div>
          </Link>
        ) : (
          <p className="empty">還沒有排日期的演出。點下面的演出、按右上角的編輯填日期，或按右下角 ＋ 新增。</p>
        )}
        {upcoming.length > 1 ? (
          <section>
            <div className="section"><h2>之後</h2><span>{upcoming.length - 1} 場</span></div>
            {upcoming.slice(1).map((s) => <ShowRow key={s.id} s={s} open={openCount(s.id)} notes={noteCount(s.id)} />)}
          </section>
        ) : null}
        {more.length ? (
          <details className="more-shows">
            <summary>已演出／其他（{more.length}）</summary>
            {more.map((s) => <ShowRow key={s.id} s={s} open={openCount(s.id)} notes={noteCount(s.id)} />)}
          </details>
        ) : null}
      </div>
      <Link className="fab" href="/shows?new=1" aria-label="新增演出"><IconPlus /></Link>

      {sp.new === "1" ? (
        <div className="sheet-backdrop">
          <Link href="/shows" aria-label="關閉" style={{ position: "absolute", inset: 0 }} />
          <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="new-show" style={{ position: "relative" }}>
            <h2 id="new-show">新增演出</h2>
            {err ? <div className="notice">{err}</div> : null}
            <form action={createShow}>
              <label className="field"><span>演出名稱</span><input className="input" name="name" required maxLength={100} placeholder="例如：第 2 季 11 月號" /></label>
              <label className="field">
                <span>類型</span>
                <select className="select" name="type" defaultValue="monthly">
                  <option value="monthly">月號</option>
                  <option value="special">專場</option>
                  <option value="other">其他</option>
                </select>
              </label>
              <label className="field">
                <span>類別</span>
                <select className="select" name="series" defaultValue="看我笑話">
                  {SHOW_SERIES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label className="field"><span>演出日期（月號必填；多場次填最晚一場）</span><input className="input" type="date" name="performance_date" /></label>
              <div className="actions">
                <button className="btn btn-primary" type="submit">新增</button>
                <Link className="btn btn-ghost" href="/shows">取消</Link>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function ShowRow({ s, open, notes }: { s: Show; open: number; notes: number }) {
  return (
    <Link href={`/shows/${s.id}`} className="card show-row">
      <DateBadge date={s.performanceDate} />
      <span className="show-row-main">
        <span className="show-row-name">{s.name}</span>
        <span className="meta">
          {s.performanceDate ? <span>{formatMonthDay(s.performanceDate)}</span> : null}
          <span>{seriesOf(s)}</span>
          <span>筆記 {notes}</span>
          <span>待辦 {open}</span>
          {s.status === "archived" ? <span className="tag">已歸檔</span> : null}
        </span>
      </span>
      <IconChevron className="chev" />
    </Link>
  );
}
