import Link from "next/link";
import { requirePage } from "@/lib/auth/current";
import { daysBetween, listShows, pickableShows, seriesOf, SHOW_TYPE_LABEL } from "@/lib/shows";
import { applyFilter, listTodos } from "@/lib/todos";
import { countPendingLines } from "@/lib/finance/oen";
import { financeSchedule } from "@/lib/finance/schedule";
import { formatMonthDay, todayInTaipei } from "@/lib/dates";
import TopBar from "@/components/top-bar";
import DateBadge from "@/components/date-badge";
import FinanceSchedule from "@/components/finance-schedule";
import { IconChevron } from "@/components/icons";

// 首頁（2026-11-03 改版）：下一場（與之後幾場）、財務時程、待確認數、我的待辦摘要。待辦清單從這裡的「全部待辦」進。
export default async function HomePage() {
  const me = await requirePage("todos", "/home");
  const actor = `user:${me.id}` as const;
  const [shows, todos, pending] = await Promise.all([listShows(actor), listTodos(actor), countPendingLines(actor).catch(() => 0)]);
  const today = todayInTaipei();
  const { next, upcoming } = pickableShows(shows, today);
  const schedule = financeSchedule(today, shows.map((s) => ({ name: s.name, type: s.type, series: seriesOf(s), performanceDate: s.performanceDate, kind: s.kind })));
  const open = todos.filter((t) => !t.doneAt);
  const mine = applyFilter(open, "mine", me.id).sort((a, b) => (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9"));
  const overdue = mine.filter((t) => t.dueDate && t.dueDate < today).length;
  const openCount = (id: string) => open.filter((t) => t.show?.id === id).length;

  return (
    <main className="page">
      <TopBar me={me} title="首頁" sub={formatMonthDay(today)} />
      <div className="content">
        {next ? (
          <Link href={`/shows/${next.id}`} className="hero">
            <div className="hero-top"><span>下一場・{seriesOf(next)}・{SHOW_TYPE_LABEL[next.type]}</span><IconChevron className="chev" /></div>
            <div className="hero-title">{next.name}</div>
            <div className="hero-stats">
              <div><b>{formatMonthDay(next.performanceDate!)}</b><span>演出日</span></div>
              <div><b>{daysBetween(today, next.performanceDate!)} 天</b><span>倒數</span></div>
              <div><b>{openCount(next.id)} 件</b><span>未完成待辦</span></div>
            </div>
          </Link>
        ) : (
          <Link href="/shows" className="card link-row"><span className="row-main">還沒排下一場演出，到演出補日期</span><IconChevron className="chev" /></Link>
        )}
        {upcoming.length > 1 ? (
          <section>
            <div className="section"><h2>之後</h2><Link href="/shows">演出 <IconChevron className="chev" /></Link></div>
            {upcoming.slice(1, 4).map((s) => (
              <Link key={s.id} href={`/shows/${s.id}`} className="card show-row">
                <DateBadge date={s.performanceDate} />
                <span className="show-row-main">
                  <span className="show-row-name">{s.name}</span>
                  <span className="meta"><span>{formatMonthDay(s.performanceDate!)}</span><span>{seriesOf(s)}</span><span>待辦 {openCount(s.id)}</span></span>
                </span>
                <IconChevron className="chev" />
              </Link>
            ))}
          </section>
        ) : null}

        <div className="section"><h2>財務時程</h2><Link href="/finance">財務 <IconChevron className="chev" /></Link></div>
        <FinanceSchedule events={schedule} />
        <Link className="card link-row" href="/finance/inbox">
          <span className="row-main"><b>待確認 {pending} 筆</b><span className="meta">{pending ? "Oen 明細等待核准入帳" : "沒有待確認的 Oen 明細"}</span></span>
          <IconChevron className="chev" />
        </Link>

        <section>
          <div className="section"><h2>我的待辦</h2><Link href="/todos?f=all">全部待辦 <IconChevron className="chev" /></Link></div>
          {mine.length === 0 ? <p className="empty">你目前沒有待辦。</p> : mine.slice(0, 6).map((t) => (
            <Link key={t.id} href={`/todos?t=${t.id}`} className="card show-row">
              <span className="show-row-main">
                <span className="show-row-name">{t.title}</span>
                <span className="meta">{t.show ? <span>{t.show.name}</span> : null}{t.dueDate ? <span className={`due ${t.dueDate < today ? "overdue" : daysBetween(today, t.dueDate) <= 3 ? "soon" : ""}`}>{formatMonthDay(t.dueDate)}前</span> : null}</span>
              </span>
              <IconChevron className="chev" />
            </Link>
          ))}
          {mine.length > 6 || overdue ? <Link className="toggle-done" href="/todos">{overdue ? `${overdue} 件已逾期・` : ""}看我的全部 {mine.length} 件</Link> : null}
        </section>
      </div>
    </main>
  );
}
