"use server";
// 最後更新：2026-11-19 14:58
// 誰幫忙的：Claude Code（Claude Opus 5.5）
// 修改摘要：新增工具箱的五個寫入動作（新增、編輯、上下移、下架、復原），先過權限再寫入；工具 id 不是 uuid 時直接回「找不到這個工具」。
//
// 工具箱的寫入（spec tools-directory）。每個動作先 requireAction("tools")，欄位檢查在 lib/tools.ts，
// 資料庫錯誤不顯示技術訊息。
import { revalidatePath } from "next/cache";
import { requireAction } from "@/lib/auth/current";
import {
  archiveTool as archiveToolData,
  createTool as createToolData,
  moveTool as moveToolData,
  restoreTool as restoreToolData,
  updateTool as updateToolData,
  validateToolInput,
} from "@/lib/tools";

export type ToolResult = { ok: true } | { ok: false; error: string };

const FORBIDDEN = "你沒有工具箱的權限";
const SAVE_FAILED = "存檔失敗，請稍後再試";
const NOT_FOUND = "找不到這個工具，可能已經被別人改過，請重新整理再試";

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 表單送來的工具 id；格式不對就回 null，不送進資料庫。 */
function toolId(fd: FormData): string | null {
  const id = str(fd, "id");
  return UUID.test(id) ? id : null;
}

async function guard(): Promise<`user:${string}` | null> {
  try {
    const me = await requireAction("tools");
    return `user:${me.id}`;
  } catch {
    return null;
  }
}

function fields(fd: FormData): Record<string, string> {
  return { icon: str(fd, "icon"), name: str(fd, "name"), description: str(fd, "description"), url: str(fd, "url"), section: str(fd, "section") };
}

async function run(fn: () => Promise<boolean | void>): Promise<ToolResult> {
  try {
    const found = await fn();
    if (found === false) return { ok: false, error: NOT_FOUND };
  } catch (e) {
    console.error("tools action failed", e);
    return { ok: false, error: SAVE_FAILED };
  }
  revalidatePath("/tools");
  return { ok: true };
}

export async function createTool(fd: FormData): Promise<ToolResult> {
  const actor = await guard();
  if (!actor) return { ok: false, error: FORBIDDEN };
  const v = validateToolInput(fields(fd));
  if (!v.ok) return v;
  return run(async () => {
    await createToolData(actor, v.value);
  });
}

export async function updateTool(fd: FormData): Promise<ToolResult> {
  const actor = await guard();
  if (!actor) return { ok: false, error: FORBIDDEN };
  const v = validateToolInput(fields(fd));
  if (!v.ok) return v;
  const id = toolId(fd);
  if (!id) return { ok: false, error: NOT_FOUND };
  return run(async () => (await updateToolData(actor, id, v.value)) !== null);
}

export async function moveTool(fd: FormData): Promise<ToolResult> {
  const actor = await guard();
  if (!actor) return { ok: false, error: FORBIDDEN };
  const dir = str(fd, "dir") === "up" ? -1 : str(fd, "dir") === "down" ? 1 : 0;
  if (dir === 0) return { ok: false, error: SAVE_FAILED };
  const id = toolId(fd);
  if (!id) return { ok: false, error: NOT_FOUND };
  return run(() => moveToolData(actor, id, dir));
}

export async function archiveTool(fd: FormData): Promise<ToolResult> {
  const actor = await guard();
  if (!actor) return { ok: false, error: FORBIDDEN };
  const id = toolId(fd);
  if (!id) return { ok: false, error: NOT_FOUND };
  return run(() => archiveToolData(actor, id));
}

export async function restoreTool(fd: FormData): Promise<ToolResult> {
  const actor = await guard();
  if (!actor) return { ok: false, error: FORBIDDEN };
  const id = toolId(fd);
  if (!id) return { ok: false, error: NOT_FOUND };
  return run(() => restoreToolData(actor, id));
}
