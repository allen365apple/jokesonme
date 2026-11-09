import Link from "next/link";
import { requirePage } from "@/lib/auth/current";
import { listUsers, nameMap } from "@/lib/todos";
import { listTicketEvents, listTickets } from "@/lib/tickets/data";
import { ACTIVE_STATUSES, allowedActions, nextStep } from "@/lib/tickets/flow";
import { kickoffText } from "@/lib/tickets/kickoff";
import TopBar from "@/components/top-bar";
import TicketBoard from "@/components/ticket-board";

function q(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `/tickets?${s}` : "/tickets";
}

// 開發頁（spec dev-tickets「Ticket board page」）：進行中／已結案分頁、只看我的、?t=<n> 開票頁。
export default async function TicketsPage({ searchParams }: PageProps<"/tickets">) {
  const sp = await searchParams;
  const seg = sp.seg === "closed" ? "closed" : "active";
  const mine = sp.mine === "1";
  const me = await requirePage("tickets", "/tickets");
  const actor = `user:${me.id}` as const;
  const [tickets, users] = await Promise.all([listTickets(actor), listUsers(actor)]);
  const names = Object.fromEntries(nameMap(users));
  const name = (id: string | null) => (id ? (names[id] ?? "成員") : "沒人");

  const isActive = (s: string) => (ACTIVE_STATUSES as string[]).includes(s);
  const mineOnly = (list: typeof tickets) => (mine ? list.filter((t) => t.reporterId === me.id || t.ownerId === me.id) : list);
  const active = mineOnly(tickets.filter((t) => isActive(t.status)));
  const closed = mineOnly(tickets.filter((t) => !isActive(t.status)));

  const selected = typeof sp.t === "string" ? tickets.find((t) => t.number === Number(sp.t)) : undefined;
  const meActor = { id: me.id, role: me.role };
  const detail = selected
    ? {
        ticket: selected,
        events: await listTicketEvents(actor, selected.id),
        actions: allowedActions(selected, meActor),
        next: nextStep(selected, name),
        kickoff: selected.ownerId === me.id || me.role === "admin" ? kickoffText(selected, name(selected.reporterId)) : null,
      }
    : null;

  const base = { seg: seg === "closed" ? "closed" : undefined, mine: mine ? "1" : undefined };
  return (
    <main className="page">
      <TopBar me={me} title="開發" sub="平台要改什麼、誰在做、做完了沒" />
      <nav className="seg-tabs" aria-label="開發頁分頁">
        <Link className={seg === "active" ? "on" : ""} href={q({ mine: base.mine })}>進行中 <span className="count">{active.length}</span></Link>
        <Link className={seg === "closed" ? "on" : ""} href={q({ seg: "closed", mine: base.mine })}>已結案 <span className="count">{closed.length}</span></Link>
      </nav>
      <div className="content">
        <Link className={`tk-filter${mine ? " on" : ""}`} href={q({ seg: base.seg, mine: mine ? undefined : "1" })} aria-pressed={mine}>
          {mine ? "✓ " : ""}只看我的
        </Link>
        <TicketBoard
          key={`${seg}-${mine}-${selected?.id ?? ""}`}
          tickets={seg === "active" ? active : closed}
          names={names}
          detail={detail}
          listHref={q(base)}
          emptyText={mine ? "目前沒有你開的或你認領的票。" : seg === "active" ? "目前沒有進行中的票。按右下角的＋開第一張。" : "還沒有結案的票。"}
          initialNew={sp.new === "1"}
        />
      </div>
    </main>
  );
}
