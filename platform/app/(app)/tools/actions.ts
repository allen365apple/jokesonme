"use server";
// 最後更新：2026-11-19 15:09
// 誰幫忙的：Claude Code（Claude Opus 5.5）
// 修改摘要：新增區塊的新增／改名／刪除／整份排序與工具整份排序的動作（排序參數是 JSON 字串陣列）；移除上下移 moveTool；錯誤訊息照 design「Failure modes」。
//
// 工具箱的寫入（spec tools-directory）。每個動作先 requireAction("tools")，欄位檢查在 lib/tools.ts，
// 資料庫錯誤不顯示技術訊息。
import { revalidatePath } from "next/cache";
import { requireAction } from "@/lib/auth/current";
import {
  archiveTool as archiveToolData,
  createSection as createSectionData,
  createTool as createToolData,
  deleteSection as deleteSectionData,
  isUuid,
  renameSection as renameSectionData,
  reorderSections as reorderSectionsData,
  reorderTools as reorderToolsData,
  restoreTool as restoreToolData,
  updateTool as updateToolData,
  validateSectionName,
  validateToolInput,
} from "@/lib/tools";

export type ToolResult = { ok: true } | { ok: false; error: string };

const FORBIDDEN = "你沒有工具箱的權限";
const SAVE_FAILED = "存檔失敗，請稍後再試";
const NOT_FOUND = "找不到這個工具，可能已經被別人改過，請重新整理再試";
const SECTION_GONE = "這個區塊已經不在了，請重新整理後再選";
const SECTION_HAS_TOOLS = "區塊裡還有工具，先把工具移走或下架再刪除";
const LAST_SECTION = "至少要留一個區塊";
const STALE = "清單已經被別人改過，請重新整理後再排";

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
}

/** 表單送來的 id；格式不對就回 null，不送進資料庫。 */
function idOf(fd: FormData, key = "id"): string | null {
  const id = str(fd, key).trim();
  return isUuid(id) ? id.toLowerCase() : null;
}

/** 排序參數：JSON 字串陣列，每個都是 uuid、不重複；不合格回 null。 */
function idList(fd: FormData): string[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(str(fd, "ids"));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length > 500) return null;
  const ids: string[] = [];
  for (const x of parsed) {
    if (typeof x !== "string" || !isUuid(x)) return null;
    ids.push(x.toLowerCase());
  }
  return new Set(ids).size === ids.length ? ids : null;
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
  return {
    icon: str(fd, "icon"), name: str(fd, "name"), description: str(fd, "description"), url: str(fd, "url"),
    sectionId: str(fd, "sectionId"),
  };
}

/** 跑資料函式：回字串＝白話錯誤；丟錯＝存檔失敗；其他＝成功並 revalidate。 */
async function run(fn: () => Promise<string | void>): Promise<ToolResult> {
  try {
    const err = await fn();
    if (typeof err === "string") return { ok: false, error: err };
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
    if ((await createToolData(actor, v.value)) === "section_gone") return SECTION_GONE;
  });
}

export async function updateTool(fd: FormData): Promise<ToolResult> {
  const actor = await guard();
  if (!actor) return { ok: false, error: FORBIDDEN };
  const v = validateToolInput(fields(fd));
  if (!v.ok) return v;
  const id = idOf(fd);
  if (!id) return { ok: false, error: NOT_FOUND };
  return run(async () => {
    const r = await updateToolData(actor, id, v.value);
    if (r === "section_gone") return SECTION_GONE;
    if (r === null) return NOT_FOUND;
  });
}

export async function archiveTool(fd: FormData): Promise<ToolResult> {
  const actor = await guard();
  if (!actor) return { ok: false, error: FORBIDDEN };
  const id = idOf(fd);
  if (!id) return { ok: false, error: NOT_FOUND };
  return run(async () => {
    if (!(await archiveToolData(actor, id))) return NOT_FOUND;
  });
}

export async function restoreTool(fd: FormData): Promise<ToolResult> {
  const actor = await guard();
  if (!actor) return { ok: false, error: FORBIDDEN };
  const id = idOf(fd);
  if (!id) return { ok: false, error: NOT_FOUND };
  return run(async () => {
    if (!(await restoreToolData(actor, id))) return NOT_FOUND;
  });
}

/** 區內工具的整份順序：sectionId＋ids（JSON 字串陣列）。 */
export async function reorderTools(fd: FormData): Promise<ToolResult> {
  const actor = await guard();
  if (!actor) return { ok: false, error: FORBIDDEN };
  const sectionId = idOf(fd, "sectionId");
  const ids = idList(fd);
  if (!sectionId || !ids) return { ok: false, error: STALE };
  return run(async () => {
    if ((await reorderToolsData(actor, sectionId, ids)) === "stale") return STALE;
  });
}

export async function createSection(fd: FormData): Promise<ToolResult> {
  const actor = await guard();
  if (!actor) return { ok: false, error: FORBIDDEN };
  const v = validateSectionName(str(fd, "name"));
  if (!v.ok) return v;
  return run(async () => {
    await createSectionData(actor, v.value);
  });
}

export async function renameSection(fd: FormData): Promise<ToolResult> {
  const actor = await guard();
  if (!actor) return { ok: false, error: FORBIDDEN };
  const v = validateSectionName(str(fd, "name"));
  if (!v.ok) return v;
  const id = idOf(fd);
  if (!id) return { ok: false, error: SECTION_GONE };
  return run(async () => {
    if (!(await renameSectionData(actor, id, v.value))) return SECTION_GONE;
  });
}

export async function deleteSection(fd: FormData): Promise<ToolResult> {
  const actor = await guard();
  if (!actor) return { ok: false, error: FORBIDDEN };
  const id = idOf(fd);
  if (!id) return { ok: false, error: SECTION_GONE };
  return run(async () => {
    const r = await deleteSectionData(actor, id);
    if (r === "has_tools") return SECTION_HAS_TOOLS;
    if (r === "last") return LAST_SECTION;
    if (r === "not_found") return SECTION_GONE;
  });
}

/** 區塊的整份順序：ids（JSON 字串陣列）。 */
export async function reorderSections(fd: FormData): Promise<ToolResult> {
  const actor = await guard();
  if (!actor) return { ok: false, error: FORBIDDEN };
  const ids = idList(fd);
  if (!ids) return { ok: false, error: STALE };
  return run(async () => {
    if ((await reorderSectionsData(actor, ids)) === "stale") return STALE;
  });
}
