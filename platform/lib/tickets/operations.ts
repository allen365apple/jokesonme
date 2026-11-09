// 開發頁的寫入操作，網頁 server action 與給 Claude 的 API 共用（change claude-ticket-tools；
// spec claude-ticket-tools「Ticket API parity」）。判斷用 planTransition，寫入用 dev_ticket_create／dev_ticket_apply；
// 寫入一律以本人 `user:<id>` 為 actor，所以回報人、認領人、歷史都是操作的人本人。
// 這裡不碰 next/cache：重新整理頁面由呼叫端（server action）負責。
import { db } from "../supabase.ts";
import type { Role } from "../auth/access.ts";
import { listUsers, nameMap } from "../todos.ts";
import { isCategory, planTransition, titleError, type TicketAction } from "./flow.ts";
import { getTicket, getTicketByNumber, type TicketRow, type TicketView } from "./data.ts";

export type Operator = { id: string; role: Role | null };
export type TicketRef = { id: string } | { number: number };
export type OpResult =
  | { ok: true; number: number; status?: TicketView["status"] }
  | { ok: false; status: 400 | 404 | 409 | 500; error: string };

export const TICKET_ACTIONS: readonly TicketAction[] = ["claim", "unclaim", "deliver", "accept", "reject", "wontfix", "reopen", "edit"];

export type NewTicketInput = { title: string; category: string; description: string };

export async function createTicketAs(me: Operator, input: NewTicketInput): Promise<OpResult> {
  const title = input.title.trim();
  const te = titleError(title);
  if (te) return { ok: false, status: 400, error: te };
  if (!isCategory(input.category)) return { ok: false, status: 400, error: "請選分類" };
  const { data, error } = await db(`user:${me.id}`).rpc("dev_ticket_create", {
    p_row: { title, category: input.category, description: input.description ?? "", reporter_id: me.id },
  });
  if (error || !data) return { ok: false, status: 500, error: "沒有存成功，請再試一次" };
  return { ok: true, number: Number((data as TicketRow).number), status: "open" };
}

async function ownerName(me: Operator, ownerId: string): Promise<string> {
  return nameMap(await listUsers(`user:${me.id}`)).get(ownerId) ?? "別人";
}

export async function actOnTicketAs(
  me: Operator,
  ref: TicketRef,
  action: string,
  input: { note?: string; title?: string; category?: string; description?: string } = {},
): Promise<OpResult> {
  if (!(TICKET_ACTIONS as string[]).includes(action)) return { ok: false, status: 400, error: "不認得這個動作" };
  const act = action as TicketAction;
  const actor = `user:${me.id}` as const;
  const ticket = "id" in ref ? await getTicket(actor, ref.id) : await getTicketByNumber(actor, ref.number);
  if (!ticket) return { ok: false, status: 404, error: "找不到這張票" };

  const plan = planTransition(ticket, act, me, {
    note: input.note ?? "",
    edit: act === "edit" ? { title: input.title ?? "", category: input.category ?? "", description: input.description ?? "" } : undefined,
  });
  if (!plan.ok) {
    // 畫面還停在「沒人認領」但其實已被別人認領（spec dev-tickets「Conflict-safe claiming」）：講清楚是誰
    if (act === "claim" && ticket.ownerId && ticket.ownerId !== me.id) {
      return { ok: false, status: 409, error: `T-${ticket.number} 剛被 ${await ownerName(me, ticket.ownerId)} 認領了，重新整理看看` };
    }
    return { ok: false, status: 400, error: plan.reason };
  }

  const { data, error } = await db(actor).rpc("dev_ticket_apply", {
    p_id: ticket.id,
    p_expect_status: plan.expectStatus,
    p_expect_owner: plan.expectOwner,
    p_patch: plan.patch,
    p_event: plan.event,
  });
  if (error) return { ok: false, status: 500, error: "沒有存成功，請再試一次" };
  // 函式回 null（PostgREST 可能給 null 或整列都是 null 的物件）＝票在按下之前被別人改了
  if (!data || !(data as Partial<TicketRow>).id) {
    const now = await getTicket(actor, ticket.id);
    if (act === "claim" && now?.ownerId && now.ownerId !== me.id) {
      return { ok: false, status: 409, error: `T-${ticket.number} 剛被 ${await ownerName(me, now.ownerId)} 認領了，重新整理看看` };
    }
    return { ok: false, status: 409, error: `T-${ticket.number} 剛被別人改過，重新整理看看` };
  }
  return { ok: true, number: ticket.number, status: (data as TicketRow).status };
}
