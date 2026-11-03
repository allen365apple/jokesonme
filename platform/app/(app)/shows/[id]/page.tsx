import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth/current";
import { db } from "@/lib/supabase";
import { listIdeas } from "@/lib/ideas";
import { daysBetween, listPerformances, pickableShows, seriesOf, SHOW_TYPE_LABEL, type ShowSeries, type ShowType, toPickerData } from "@/lib/shows";
import { assignableUsers, groupByShow, listTodos, listUsers, nameMap } from "@/lib/todos";
import { formatMonthDay, todayInTaipei } from "@/lib/dates";
import { displayName } from "@/lib/auth/users";
import TopBar from "@/components/top-bar";
import IdeaList from "@/components/idea-list";
import TodoBoard from "@/components/todo-board";
import ShowTodos from "@/components/show-todos";
import { ShowInfoButton } from "@/components/show-editor";

// 每場演出的頁面（spec show-planning-page「Monthly planning page」）：筆記在前（頁面上直接寫），待辦收成摘要卡；電腦左右兩欄。
export default async function ShowPlanningPage({ params, searchParams }: PageProps<"/shows/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const me = await requirePage("planning", `/shows/${id}`);
  const actor = `user:${me.id}` as const;
  const { data: show } = await db(actor).from("shows").select("id, name, type, kind, series, performance_date, status").eq("id", id).maybeSingle<{ id: string; name: string; type: ShowType; kind: string; series: ShowSeries | null; performance_date: string | null; status: string }>();
  if (!show || show.kind !== "performance") notFound();
  const [ideas, shows, users, todos] = await Promise.all([listIdeas(actor, { showId: id }), listPerformances(actor), listUsers(actor), listTodos(actor)]);
  const today = todayInTaipei();
  const names = nameMap(users);
  const picker = toPickerData(pickableShows(shows, today));
  const showTodos = todos.filter((t) => t.show?.id === id);
  const openTodos = showTodos.filter((t) => !t.doneAt);
  const nextDue = openTodos.map((t) => t.dueDate).filter((d): d is string => !!d).sort()[0] ?? null;
  const newTodo = sp.new === "todo";
  const date = show.performance_date;
  const days = date ? daysBetween(today, date) : null;

  return (
    <main className="page">
      <TopBar
        me={me}
        title={show.name}
        back={{ href: "/shows", label: "演出" }}
        sub={
          <>
            <span>{seriesOf(show)}・{SHOW_TYPE_LABEL[show.type]}・{date ? `${formatMonthDay(date)}演出` : "還沒填演出日期"}</span>
            {days !== null && days >= 0 && show.status !== "archived" ? <span className="due soon">{days === 0 ? "就是今天" : `還有 ${days} 天`}</span> : null}
            {show.status === "archived" ? <span>・已歸檔</span> : null}
          </>
        }
        actions={
          <>
            <Link className="btn btn-ghost btn-sm" href={`/finance/shows/${show.id}`}>財務</Link>
            <ShowInfoButton show={{ id: show.id, name: show.name, type: show.type, series: show.series, performanceDate: show.performance_date, status: show.status }} />
          </>
        }
      />
      <div className="split">
        <div>
          <div className="section"><h2>筆記</h2><span>{ideas.length} 則</span></div>
          <IdeaList
            ideas={ideas.map((i) => ({ id: i.id, text: i.text, author: names.get(i.authorUserId ?? "") ?? "成員", when: i.source?.sentAt ?? i.createdAt, showId: i.showId, showName: show.name, viaLine: !!i.source }))}
            picker={picker}
            mode="show"
            contextShowId={id}
            composer
            me={displayName(me)}
            emptyText="這場還沒有筆記。在上面直接寫，或到「筆記」把筆記放到這場。"
          />
        </div>
        <div className="content">
          <ShowTodos open={openTodos.length} total={showTodos.length} nextDue={nextDue} today={today} newHref={`/shows/${id}?new=todo`} initialOpen={newTodo}>
            <TodoBoard
              key={`todos-${newTodo ? "new" : ""}`}
              groups={groupByShow(showTodos).map((g) => ({ ...g, title: "待辦清單" }))}
              names={Object.fromEntries(names)}
              picker={picker}
              assignable={assignableUsers(users).map((u) => ({ id: u.id, name: displayName(u) }))}
              meId={me.id}
              showDone={false}
              emptyText="這場還沒有待辦。"
              initialSelected={null}
              initialNew={newTodo}
              initialShowId={id}
              showFab={false}
              today={today}
            />
          </ShowTodos>
        </div>
      </div>
    </main>
  );
}
