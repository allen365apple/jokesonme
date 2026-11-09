"use server";
// 開發頁的寫入（spec dev-tickets）。先過角色守門，實際判斷與寫入在 lib/tickets/operations.ts，
// 跟給 Claude 的 API（/api/claude/*）共用同一套規則（change claude-ticket-tools）。
import { revalidatePath } from "next/cache";
import { requireAction } from "@/lib/auth/current";
import { actOnTicketAs, createTicketAs } from "@/lib/tickets/operations";

export type TicketResult = { ok: true; number?: number } | { ok: false; error: string };

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
}

async function guard() {
  try {
    return { me: await requireAction("tickets") };
  } catch {
    return { error: "你沒有開發頁的權限" };
  }
}

export async function createTicket(fd: FormData): Promise<TicketResult> {
  const g = await guard();
  if (!g.me) return { ok: false, error: g.error! };
  const r = await createTicketAs(g.me, { title: str(fd, "title"), category: str(fd, "category"), description: str(fd, "description") });
  if (!r.ok) return { ok: false, error: r.error };
  revalidatePath("/tickets");
  return { ok: true, number: r.number };
}

export async function actOnTicket(fd: FormData): Promise<TicketResult> {
  const g = await guard();
  if (!g.me) return { ok: false, error: g.error! };
  const r = await actOnTicketAs(g.me, { id: str(fd, "id") }, str(fd, "action"), {
    note: str(fd, "note"),
    title: str(fd, "title"),
    category: str(fd, "category"),
    description: str(fd, "description"),
  });
  revalidatePath("/tickets");
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}
