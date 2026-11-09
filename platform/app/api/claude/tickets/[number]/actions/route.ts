// 對票做動作：認領、取消認領、交付、驗收、退回、不做（spec claude-ticket-tools「Ticket API parity」）。
import { fail, json, readJson, str, withClaudeUser } from "@/lib/claude/http";
import { actOnTicketAs } from "@/lib/tickets/operations";

const WEB_ONLY = new Set(["edit", "reopen"]);

export async function POST(request: Request, ctx: RouteContext<"/api/claude/tickets/[number]/actions">): Promise<Response> {
  return withClaudeUser(request, async (u) => {
    const { number } = await ctx.params;
    const body = await readJson(request);
    const action = str(body.action);
    if (WEB_ONLY.has(action)) return fail(400, "這個動作請到網頁上做");
    const r = await actOnTicketAs(u, { number: Number(number) }, action, { note: str(body.note) });
    if (!r.ok) return fail(r.status, r.error);
    return json({ ok: true, number: r.number, status: r.status });
  });
}
