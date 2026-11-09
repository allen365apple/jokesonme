"use server";
// 開發票的寫入（spec dev-tickets）。每個 action 先過角色守門，用 planTransition 判斷能不能做，
// 再交給資料庫函式 dev_ticket_apply 比對「看到的狀態與認領人」後原子寫入（spec「Conflict-safe claiming」）。
import { revalidatePath } from "next/cache";
import { requireAction } from "@/lib/auth/current";
import { db } from "@/lib/supabase";
import { listUsers, nameMap } from "@/lib/todos";
import { isCategory, planTransition, titleError, type TicketAction } from "@/lib/tickets/flow";
import { getTicket, type TicketRow } from "@/lib/tickets/data";

export type TicketResult = { ok: true; number?: number } | { ok: false; error: string };

const ACTIONS: readonly TicketAction[] = ["claim", "unclaim", "deliver", "accept", "reject", "wontfix", "reopen", "edit"];

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
}

async function guard() {
  try {
    return { me: await requireAction("tickets") };
  } catch {
    return { error: "你沒有開發票的權限" };
  }
}

export async function createTicket(fd: FormData): Promise<TicketResult> {
  const g = await guard();
  if (!g.me) return { ok: false, error: g.error! };
  const title = str(fd, "title").trim();
  const category = str(fd, "category");
  const te = titleError(title);
  if (te) return { ok: false, error: te };
  if (!isCategory(category)) return { ok: false, error: "請選分類" };
  const { data, error } = await db(`user:${g.me.id}`).rpc("dev_ticket_create", {
    p_row: { title, category, description: str(fd, "description"), reporter_id: g.me.id },
  });
  if (error) return { ok: false, error: "沒有存成功，請再試一次" };
  revalidatePath("/tickets");
  return { ok: true, number: Number((data as TicketRow).number) };
}

export async function actOnTicket(fd: FormData): Promise<TicketResult> {
  const g = await guard();
  if (!g.me) return { ok: false, error: g.error! };
  const me = g.me;
  const action = str(fd, "action") as TicketAction;
  if (!ACTIONS.includes(action)) return { ok: false, error: "不認得這個動作" };
  const actor = `user:${me.id}` as const;
  const ticket = await getTicket(actor, str(fd, "id"));
  if (!ticket) return { ok: false, error: "找不到這張票" };

  const plan = planTransition(ticket, action, { id: me.id, role: me.role }, {
    note: str(fd, "note"),
    edit: action === "edit" ? { title: str(fd, "title"), category: str(fd, "category"), description: str(fd, "description") } : undefined,
  });
  if (!plan.ok) return { ok: false, error: plan.reason };

  const { data, error } = await db(actor).rpc("dev_ticket_apply", {
    p_id: ticket.id,
    p_expect_status: plan.expectStatus,
    p_expect_owner: plan.expectOwner,
    p_patch: plan.patch,
    p_event: plan.event,
  });
  if (error) return { ok: false, error: "沒有存成功，請再試一次" };
  // 函式回 null（PostgREST 可能給 null 或整列都是 null 的物件）＝票在你按下之前被別人改了
  if (!data || !(data as Partial<TicketRow>).id) {
    revalidatePath("/tickets");
    const now = await getTicket(actor, ticket.id);
    if (now?.ownerId && now.ownerId !== me.id && action === "claim") {
      const who = nameMap(await listUsers(actor)).get(now.ownerId) ?? "別人";
      return { ok: false, error: `T-${ticket.number} 剛被 ${who} 認領了，重新整理看看` };
    }
    return { ok: false, error: `T-${ticket.number} 剛被別人改過，重新整理看看` };
  }
  revalidatePath("/tickets");
  return { ok: true };
}
