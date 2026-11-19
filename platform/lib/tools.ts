// 最後更新：2026-11-19 13:49
// 誰幫忙的：Claude Code（Claude Opus 5.5）
// 修改摘要：新增工具箱的欄位檢查與資料讀寫（列出、新增、編輯、調順序、下架、復原）。
//
// 工具箱（spec tools-directory）。validateToolInput 是純函式（有單元測試）；其餘資料函式一律經 db(actor)，只能在伺服器端用。
// 寫入的權限守門在 app/(app)/tools/actions.ts。
import { db, type Actor } from "./supabase.ts";

export type ToolSection = "internal" | "live" | "other";

export const TOOL_SECTIONS: ToolSection[] = ["internal", "live", "other"];

export const ICON_MAX = 8;
export const NAME_MAX = 40;
export const DESCRIPTION_MAX = 120;

export type Tool = {
  id: string;
  section: ToolSection;
  icon: string;
  name: string;
  description: string;
  url: string;
  position: number;
  archivedAt: string | null;
};

export type ToolInput = { section: ToolSection; icon: string; name: string; description: string; url: string };

export type ValidateResult = { ok: true; value: ToolInput } | { ok: false; error: string };

/** 字數照資料庫 char_length 的算法（一個 emoji 算一個字），不用 JS 的 .length。 */
function chars(s: string): number {
  return Array.from(s).length;
}

function isHttpUrl(s: string): boolean {
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return false;
  }
  return (u.protocol === "http:" || u.protocol === "https:") && /^https?:\/\//.test(s);
}

/** 修剪空白後檢查欄位；不合格回白話中文錯誤（spec「Tool input validation」）。 */
export function validateToolInput(raw: Record<string, string>): ValidateResult {
  const icon = (raw.icon ?? "").trim();
  const name = (raw.name ?? "").trim();
  const description = (raw.description ?? "").trim();
  const url = (raw.url ?? "").trim();
  const section = (raw.section ?? "").trim();

  if (chars(icon) < 1 || chars(icon) > ICON_MAX) return { ok: false, error: `圖示請填 1 個 emoji（最多 ${ICON_MAX} 個字）` };
  if (chars(name) < 1 || chars(name) > NAME_MAX) return { ok: false, error: `名稱請填 1 到 ${NAME_MAX} 個字` };
  if (chars(description) > DESCRIPTION_MAX) return { ok: false, error: `說明最多 ${DESCRIPTION_MAX} 個字` };
  if (!isHttpUrl(url)) return { ok: false, error: "網址要用 http:// 或 https:// 開頭" };
  if (!(TOOL_SECTIONS as string[]).includes(section)) return { ok: false, error: "請選擇工具要放在哪一區" };

  return { ok: true, value: { section: section as ToolSection, icon, name, description, url } };
}

type ToolRow = {
  id: string; section: ToolSection; icon: string; name: string; description: string; url: string;
  position: number; archived_at: string | null;
};

const COLUMNS = "id, section, icon, name, description, url, position, archived_at";

function toTool(r: ToolRow): Tool {
  return {
    id: r.id, section: r.section, icon: r.icon, name: r.name, description: r.description, url: r.url,
    position: Number(r.position), archivedAt: r.archived_at,
  };
}

/** 全部工具（含已下架），依分區、position 排好。畫面再依 archivedAt 分成上架中與已下架。 */
export async function listTools(actor: Actor): Promise<Tool[]> {
  const { data, error } = await db(actor)
    .from("tools")
    .select(COLUMNS)
    .order("section", { ascending: true })
    .order("position", { ascending: true })
    .order("id", { ascending: true })
    .returns<ToolRow[]>();
  if (error) throw new Error(`list tools: ${error.message}`);
  return (data ?? []).map(toTool);
}

/** 該區目前最大的 position + 1（排到該區最後）。 */
async function nextPosition(actor: Actor, section: ToolSection): Promise<number> {
  const { data, error } = await db(actor)
    .from("tools")
    .select("position")
    .eq("section", section)
    .order("position", { ascending: false })
    .limit(1)
    .returns<{ position: number }[]>();
  if (error) throw new Error(`read tool position: ${error.message}`);
  return data && data.length ? Number(data[0].position) + 1 : 1;
}

async function getToolRow(actor: Actor, id: string): Promise<ToolRow | null> {
  const { data, error } = await db(actor).from("tools").select(COLUMNS).eq("id", id).maybeSingle<ToolRow>();
  if (error) throw new Error(`read tool: ${error.message}`);
  return data;
}

export async function createTool(actor: Actor, input: ToolInput): Promise<Tool> {
  const position = await nextPosition(actor, input.section);
  const { data, error } = await db(actor)
    .from("tools")
    .insert({ ...input, position, created_by: actor })
    .select(COLUMNS)
    .single<ToolRow>();
  if (error) throw new Error(`create tool: ${error.message}`);
  return toTool(data);
}

/** 編輯全部欄位；改了分區就排到新區最後。找不到這個工具回 null。 */
export async function updateTool(actor: Actor, id: string, input: ToolInput): Promise<Tool | null> {
  const cur = await getToolRow(actor, id);
  if (!cur) return null;
  const patch: Record<string, unknown> = { ...input, updated_at: new Date().toISOString() };
  if (cur.section !== input.section) patch.position = await nextPosition(actor, input.section);
  const { data, error } = await db(actor).from("tools").update(patch).eq("id", id).select(COLUMNS).maybeSingle<ToolRow>();
  if (error) throw new Error(`update tool: ${error.message}`);
  return data ? toTool(data) : null;
}

/** 同區上下移一格；最前往上、最後往下不變（資料庫函式 tools_move 在同一交易對調）。 */
export async function moveTool(actor: Actor, id: string, dir: -1 | 1): Promise<void> {
  const { error } = await db(actor).rpc("tools_move", { p_id: id, p_dir: dir });
  if (error) throw new Error(`move tool: ${error.message}`);
}

/** 下架＝寫 archived_at，資料留著。找不到或已下架回 false。 */
export async function archiveTool(actor: Actor, id: string): Promise<boolean> {
  const { data, error } = await db(actor)
    .from("tools")
    .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .is("archived_at", null)
    .select("id");
  if (error) throw new Error(`archive tool: ${error.message}`);
  return (data ?? []).length > 0;
}

/** 復原＝清空 archived_at，並排到原分區最後。找不到或沒下架回 false。 */
export async function restoreTool(actor: Actor, id: string): Promise<boolean> {
  const cur = await getToolRow(actor, id);
  if (!cur || cur.archived_at === null) return false;
  const position = await nextPosition(actor, cur.section);
  const { data, error } = await db(actor)
    .from("tools")
    .update({ archived_at: null, position, updated_at: new Date().toISOString() })
    .eq("id", id)
    .not("archived_at", "is", null)
    .select("id");
  if (error) throw new Error(`restore tool: ${error.message}`);
  return (data ?? []).length > 0;
}
