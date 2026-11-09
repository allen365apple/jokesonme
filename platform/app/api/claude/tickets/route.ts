// 列票與開票（spec claude-ticket-tools「Ticket API parity」）。
import { fail, json, readJson, str, summarize, ticketUrl, toCategory, withClaudeUser } from "@/lib/claude/http";
import { listTickets } from "@/lib/tickets/data";
import { ACTIVE_STATUSES } from "@/lib/tickets/flow";
import { createTicketAs } from "@/lib/tickets/operations";
import { listUsers, nameMap } from "@/lib/todos";

export async function GET(request: Request): Promise<Response> {
  return withClaudeUser(request, async (u) => {
    const sp = new URL(request.url).searchParams;
    const closed = sp.get("seg") === "closed";
    const mine = sp.get("mine") === "1";
    const actor = `user:${u.id}` as const;
    const [tickets, users] = await Promise.all([listTickets(actor), listUsers(actor)]);
    const names = nameMap(users);
    const name = (id: string | null) => (id ? (names.get(id) ?? "成員") : "");
    const list = tickets
      .filter((t) => (ACTIVE_STATUSES as string[]).includes(t.status) !== closed)
      .filter((t) => !mine || t.reporterId === u.id || t.ownerId === u.id);
    return json({ tickets: list.map((t) => summarize(t, name)) });
  });
}

export async function POST(request: Request): Promise<Response> {
  return withClaudeUser(request, async (u) => {
    const body = await readJson(request);
    const r = await createTicketAs(u, { title: str(body.title), category: toCategory(str(body.category)), description: str(body.description) });
    if (!r.ok) return fail(r.status, r.error);
    return json({ number: r.number, url: ticketUrl(request, r.number) }, 201);
  });
}
