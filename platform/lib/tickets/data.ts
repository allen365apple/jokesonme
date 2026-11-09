// 開發頁的讀取（spec dev-tickets）。寫入在 app/(app)/tickets/actions.ts。只能在伺服器端用。
import { db, type Actor } from "../supabase.ts";
import type { TicketAction, TicketCategory, TicketStatus } from "./flow.ts";

export type TicketView = {
  id: string;
  number: number;
  title: string;
  category: TicketCategory;
  description: string;
  status: TicketStatus;
  reporterId: string;
  ownerId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TicketEvent = { id: string; actorId: string; action: TicketAction | "create"; note: string; at: string };

export type TicketRow = {
  id: string; number: number; title: string; category: TicketCategory; description: string; status: TicketStatus;
  reporter_id: string; owner_id: string | null; created_at: string; updated_at: string;
};

export const TICKET_COLUMNS = "id, number, title, category, description, status, reporter_id, owner_id, created_at, updated_at";

export function toView(r: TicketRow): TicketView {
  return {
    id: r.id, number: Number(r.number), title: r.title, category: r.category, description: r.description, status: r.status,
    reporterId: r.reporter_id, ownerId: r.owner_id, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

/** 全部的票，票號由新到舊。 */
export async function listTickets(actor: Actor): Promise<TicketView[]> {
  const { data, error } = await db(actor).from("dev_tickets").select(TICKET_COLUMNS).order("number", { ascending: false }).returns<TicketRow[]>();
  if (error) throw new Error(`list dev tickets: ${error.message}`);
  return (data ?? []).map(toView);
}

export async function getTicket(actor: Actor, id: string): Promise<TicketView | null> {
  const { data, error } = await db(actor).from("dev_tickets").select(TICKET_COLUMNS).eq("id", id).maybeSingle<TicketRow>();
  if (error) throw new Error(`read dev ticket: ${error.message}`);
  return data ? toView(data) : null;
}

/** 一張票的歷史，由舊到新（spec「Ticket history」）。 */
export async function listTicketEvents(actor: Actor, ticketId: string): Promise<TicketEvent[]> {
  const { data, error } = await db(actor)
    .from("dev_ticket_events")
    .select("id, actor_id, action, note, at")
    .eq("ticket_id", ticketId)
    .order("at", { ascending: true })
    .returns<{ id: string; actor_id: string; action: TicketEvent["action"]; note: string; at: string }[]>();
  if (error) throw new Error(`list dev ticket events: ${error.message}`);
  return (data ?? []).map((e) => ({ id: e.id, actorId: e.actor_id, action: e.action, note: e.note, at: e.at }));
}
