// 讀一張票：內容、歷史、這個人能做的動作、下一步、開工指令（spec claude-ticket-tools「Ticket API parity」）。
import { fail, json, summarize, ticketUrl, withClaudeUser } from "@/lib/claude/http";
import { getTicketByNumber, listTicketEvents } from "@/lib/tickets/data";
import { ACTION_LABEL, allowedActions, nextStep } from "@/lib/tickets/flow";
import { kickoffText } from "@/lib/tickets/kickoff";
import { listUsers, nameMap } from "@/lib/todos";

// 這兩個動作只在網頁上做（design「網頁與 API 共用同一套開發票操作」）
const WEB_ONLY = new Set(["edit", "reopen"]);

export async function GET(request: Request, ctx: RouteContext<"/api/claude/tickets/[number]">): Promise<Response> {
  return withClaudeUser(request, async (u) => {
    const { number } = await ctx.params;
    const actor = `user:${u.id}` as const;
    const t = await getTicketByNumber(actor, Number(number));
    if (!t) return fail(404, "找不到這張票");
    const [events, users] = await Promise.all([listTicketEvents(actor, t.id), listUsers(actor)]);
    const names = nameMap(users);
    const name = (id: string | null) => (id ? (names.get(id) ?? "成員") : "沒人");
    const label: Record<string, string> = { create: "開票", ...ACTION_LABEL };
    return json({
      ticket: { ...summarize(t, name), description: t.description, createdAt: t.createdAt, url: ticketUrl(request, t.number) },
      history: events.map((e) => ({ at: e.at, who: name(e.actorId), action: label[e.action] ?? e.action, note: e.note })),
      allowedActions: allowedActions(t, u).filter((a) => !WEB_ONLY.has(a)),
      nextStep: nextStep(t, name),
      kickoff: t.ownerId === u.id || u.role === "admin" ? kickoffText(t, name(t.reporterId)) : null,
    });
  });
}
