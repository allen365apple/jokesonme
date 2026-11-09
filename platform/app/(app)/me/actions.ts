"use server";
// 「我的」頁的連結 Claude（spec claude-ticket-tools「Link code issuance」「Key revocation」）。
// 只有能用開發頁的人（admin、member）可以產生連結碼與撤銷；撤銷只能撤自己的。
import { revalidatePath } from "next/cache";
import { requireAction } from "@/lib/auth/current";
import { createLinkCode, revokeLinkedDevice } from "@/lib/claude/links";

export type LinkCodeResult = { ok: true; code: string; expiresAt: string } | { ok: false; error: string };

export async function generateLinkCode(): Promise<LinkCodeResult> {
  let me;
  try {
    me = await requireAction("tickets");
  } catch {
    return { ok: false, error: "你沒有開發頁的權限" };
  }
  try {
    const r = await createLinkCode(me);
    revalidatePath("/me");
    return { ok: true, ...r };
  } catch {
    return { ok: false, error: "沒有產生成功，請再試一次" };
  }
}

export async function revokeDevice(fd: FormData): Promise<{ ok: boolean; error?: string }> {
  const me = await requireAction("tickets");
  const id = fd.get("id");
  if (typeof id !== "string" || !id) return { ok: false, error: "缺少要撤銷的連結" };
  const done = await revokeLinkedDevice(me.id, id);
  revalidatePath("/me");
  return done ? { ok: true } : { ok: false, error: "這個連結已經撤銷了" };
}
