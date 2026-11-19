// 最後更新：2026-11-19 15:09
// 誰幫忙的：Claude Code（Claude Opus 5.5）
// 修改摘要：區塊改成資料（新增、改名、刪除、整份排序），工具改用 sectionId 與整份排序 reorderTools；移除 moveTool；復原時原區塊已刪就放到第一個區塊最後。
//
// 工具箱（spec tools-directory）。validateToolInput、validateSectionName 是純函式（有單元測試）；
// 其餘資料函式一律經 db(actor)，只能在伺服器端用。寫入的權限守門在 app/(app)/tools/actions.ts。
import { db, type Actor } from "./supabase.ts";

export const ICON_MAX = 8;
export const NAME_MAX = 40;
export const DESCRIPTION_MAX = 120;
export const SECTION_NAME_MAX = 20;

export type ToolSection = { id: string; name: string; position: number };

export type Tool = {
  id: string;
  sectionId: string;
  icon: string;
  name: string;
  description: string;
  url: string;
  position: number;
  archivedAt: string | null;
};

export type ToolInput = { sectionId: string; icon: string; name: string; description: string; url: string };

export type ValidateResult = { ok: true; value: ToolInput } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(s: string): boolean {
  return UUID.test(s);
}

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

/** 修剪空白後檢查欄位；不合格回白話中文錯誤（spec「Tool input validation」）。區塊是否還在由資料函式查資料庫。 */
export function validateToolInput(raw: Record<string, string>): ValidateResult {
  const icon = (raw.icon ?? "").trim();
  const name = (raw.name ?? "").trim();
  const description = (raw.description ?? "").trim();
  const url = (raw.url ?? "").trim();
  const sectionId = (raw.sectionId ?? "").trim();

  if (chars(icon) < 1 || chars(icon) > ICON_MAX) return { ok: false, error: `圖示請填 1 個 emoji（最多 ${ICON_MAX} 個字）` };
  if (chars(name) < 1 || chars(name) > NAME_MAX) return { ok: false, error: `名稱請填 1 到 ${NAME_MAX} 個字` };
  if (chars(description) > DESCRIPTION_MAX) return { ok: false, error: `說明最多 ${DESCRIPTION_MAX} 個字` };
  if (!isHttpUrl(url)) return { ok: false, error: "網址要用 http:// 或 https:// 開頭" };
  if (!isUuid(sectionId)) return { ok: false, error: "請選擇工具要放在哪一區" };

  return { ok: true, value: { sectionId: sectionId.toLowerCase(), icon, name, description, url } };
}

/** 區塊名稱修剪後 1–20 字（spec「Manage toolbox sections」）。 */
export function validateSectionName(raw: string | null | undefined): { ok: true; value: string } | { ok: false; error: string } {
  const name = (raw ?? "").trim();
  if (chars(name) < 1 || chars(name) > SECTION_NAME_MAX) return { ok: false, error: `區塊名稱請填 1 到 ${SECTION_NAME_MAX} 個字` };
  return { ok: true, value: name };
}

// ---- 資料函式（伺服器端） ----

type ToolRow = {
  id: string; section_id: string; icon: string; name: string; description: string; url: string;
  position: number; archived_at: string | null;
};
type SectionRow = { id: string; name: string; position: number; archived_at: string | null };

const TOOL_COLUMNS = "id, section_id, icon, name, description, url, position, archived_at";
const SECTION_COLUMNS = "id, name, position, archived_at";

function toTool(r: ToolRow): Tool {
  return {
    id: r.id, sectionId: r.section_id, icon: r.icon, name: r.name, description: r.description, url: r.url,
    position: Number(r.position), archivedAt: r.archived_at,
  };
}

/** 使用中的區塊（依 position）與全部工具（含已下架，依區塊、position）。畫面再依 archivedAt 分成上架中與已下架。 */
export async function listToolbox(actor: Actor): Promise<{ sections: ToolSection[]; tools: Tool[] }> {
  const client = db(actor);
  const [s, t] = await Promise.all([
    client.from("tool_sections").select(SECTION_COLUMNS).is("archived_at", null)
      .order("position", { ascending: true }).order("id", { ascending: true }).returns<SectionRow[]>(),
    client.from("tools").select(TOOL_COLUMNS)
      .order("section_id", { ascending: true }).order("position", { ascending: true }).order("id", { ascending: true })
      .returns<ToolRow[]>(),
  ]);
  if (s.error) throw new Error(`list tool sections: ${s.error.message}`);
  if (t.error) throw new Error(`list tools: ${t.error.message}`);
  return {
    sections: (s.data ?? []).map((r) => ({ id: r.id, name: r.name, position: Number(r.position) })),
    tools: (t.data ?? []).map(toTool),
  };
}

async function activeSection(actor: Actor, id: string): Promise<SectionRow | null> {
  const { data, error } = await db(actor).from("tool_sections").select(SECTION_COLUMNS)
    .eq("id", id).is("archived_at", null).maybeSingle<SectionRow>();
  if (error) throw new Error(`read tool section: ${error.message}`);
  return data;
}

/** 第一個使用中的區塊（復原時原區塊已刪就放這裡）。 */
async function firstActiveSection(actor: Actor): Promise<SectionRow | null> {
  const { data, error } = await db(actor).from("tool_sections").select(SECTION_COLUMNS).is("archived_at", null)
    .order("position", { ascending: true }).order("id", { ascending: true }).limit(1).returns<SectionRow[]>();
  if (error) throw new Error(`read first tool section: ${error.message}`);
  return data && data.length ? data[0] : null;
}

/** 該區目前最大的工具 position + 1（排到該區最後）。 */
async function nextToolPosition(actor: Actor, sectionId: string): Promise<number> {
  const { data, error } = await db(actor).from("tools").select("position").eq("section_id", sectionId)
    .order("position", { ascending: false }).limit(1).returns<{ position: number }[]>();
  if (error) throw new Error(`read tool position: ${error.message}`);
  return data && data.length ? Number(data[0].position) + 1 : 1;
}

/** 目前最大的區塊 position + 1（新增區塊排到最後）。 */
async function nextSectionPosition(actor: Actor): Promise<number> {
  const { data, error } = await db(actor).from("tool_sections").select("position")
    .order("position", { ascending: false }).limit(1).returns<{ position: number }[]>();
  if (error) throw new Error(`read section position: ${error.message}`);
  return data && data.length ? Number(data[0].position) + 1 : 1;
}

async function getToolRow(actor: Actor, id: string): Promise<ToolRow | null> {
  const { data, error } = await db(actor).from("tools").select(TOOL_COLUMNS).eq("id", id).maybeSingle<ToolRow>();
  if (error) throw new Error(`read tool: ${error.message}`);
  return data;
}

/** 新增工具，排到該區最後。區塊不在了回 "section_gone"。 */
export async function createTool(actor: Actor, input: ToolInput): Promise<Tool | "section_gone"> {
  if (!(await activeSection(actor, input.sectionId))) return "section_gone";
  const position = await nextToolPosition(actor, input.sectionId);
  const { data, error } = await db(actor)
    .from("tools")
    .insert({
      section_id: input.sectionId, icon: input.icon, name: input.name, description: input.description, url: input.url,
      position, created_by: actor,
    })
    .select(TOOL_COLUMNS)
    .single<ToolRow>();
  if (error) throw new Error(`create tool: ${error.message}`);
  return toTool(data);
}

/** 編輯全部欄位；改了區塊就排到新區最後。找不到這個工具回 null，區塊不在了回 "section_gone"。 */
export async function updateTool(actor: Actor, id: string, input: ToolInput): Promise<Tool | null | "section_gone"> {
  const cur = await getToolRow(actor, id);
  if (!cur) return null;
  if (!(await activeSection(actor, input.sectionId))) return "section_gone";
  const patch: Record<string, unknown> = {
    section_id: input.sectionId, icon: input.icon, name: input.name, description: input.description, url: input.url,
    updated_at: new Date().toISOString(),
  };
  if (cur.section_id !== input.sectionId) patch.position = await nextToolPosition(actor, input.sectionId);
  const { data, error } = await db(actor).from("tools").update(patch).eq("id", id).select(TOOL_COLUMNS).maybeSingle<ToolRow>();
  if (error) throw new Error(`update tool: ${error.message}`);
  return data ? toTool(data) : null;
}

/** 下架＝寫 archived_at，資料留著。找不到或已下架回 false。 */
export async function archiveTool(actor: Actor, id: string): Promise<boolean> {
  const now = new Date().toISOString();
  const { data, error } = await db(actor)
    .from("tools")
    .update({ archived_at: now, updated_at: now })
    .eq("id", id)
    .is("archived_at", null)
    .select("id");
  if (error) throw new Error(`archive tool: ${error.message}`);
  return (data ?? []).length > 0;
}

/** 復原＝清空 archived_at，排到原區塊最後；原區塊已刪就排到第一個區塊最後。找不到或沒下架回 false。 */
export async function restoreTool(actor: Actor, id: string): Promise<boolean> {
  const cur = await getToolRow(actor, id);
  if (!cur || cur.archived_at === null) return false;
  let sectionId = cur.section_id;
  if (!(await activeSection(actor, sectionId))) {
    const first = await firstActiveSection(actor);
    if (!first) return false;
    sectionId = first.id;
  }
  const position = await nextToolPosition(actor, sectionId);
  const { data, error } = await db(actor)
    .from("tools")
    .update({ archived_at: null, section_id: sectionId, position, updated_at: new Date().toISOString() })
    .eq("id", id)
    .not("archived_at", "is", null)
    .select("id");
  if (error) throw new Error(`restore tool: ${error.message}`);
  return (data ?? []).length > 0;
}

/** 資料庫排序函式回 'stale order'（id 集合跟目前不同）。 */
function isStale(error: { code?: string; message?: string }): boolean {
  return error.code === "P0001" && (error.message ?? "").includes("stale order");
}

/** 區內工具的整份順序（tools_reorder，同一交易）。id 集合跟目前上架中的不同回 "stale"。 */
export async function reorderTools(actor: Actor, sectionId: string, ids: string[]): Promise<"ok" | "stale"> {
  const { error } = await db(actor).rpc("tools_reorder", { p_section: sectionId, p_ids: ids });
  if (error) {
    if (isStale(error)) return "stale";
    throw new Error(`reorder tools: ${error.message}`);
  }
  return "ok";
}

/** 區塊的整份順序（tool_sections_reorder，同一交易）。id 集合跟目前使用中的不同回 "stale"。 */
export async function reorderSections(actor: Actor, ids: string[]): Promise<"ok" | "stale"> {
  const { error } = await db(actor).rpc("tool_sections_reorder", { p_ids: ids });
  if (error) {
    if (isStale(error)) return "stale";
    throw new Error(`reorder tool sections: ${error.message}`);
  }
  return "ok";
}

/** 新增區塊，排到最後。名稱先用 validateSectionName 檢查過。 */
export async function createSection(actor: Actor, name: string): Promise<ToolSection> {
  const position = await nextSectionPosition(actor);
  const { data, error } = await db(actor).from("tool_sections")
    .insert({ name, position, created_by: actor }).select(SECTION_COLUMNS).single<SectionRow>();
  if (error) throw new Error(`create tool section: ${error.message}`);
  return { id: data.id, name: data.name, position: Number(data.position) };
}

/** 改名。區塊不在（或已刪除）回 false。 */
export async function renameSection(actor: Actor, id: string, name: string): Promise<boolean> {
  const { data, error } = await db(actor).from("tool_sections")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", id).is("archived_at", null).select("id");
  if (error) throw new Error(`rename tool section: ${error.message}`);
  return (data ?? []).length > 0;
}

/** 刪除區塊＝寫 archived_at。區塊裡還有上架中的工具回 "has_tools"；只剩這一個區塊回 "last"；
 *  區塊不在回 "not_found"。已下架的工具不擋刪除（復原時會放到第一個區塊）。 */
export async function deleteSection(actor: Actor, id: string): Promise<"ok" | "has_tools" | "last" | "not_found"> {
  const client = db(actor);
  if (!(await activeSection(actor, id))) return "not_found";
  const listed = await client.from("tools").select("id", { count: "exact", head: true })
    .eq("section_id", id).is("archived_at", null);
  if (listed.error) throw new Error(`count section tools: ${listed.error.message}`);
  if ((listed.count ?? 0) > 0) return "has_tools";
  const active = await client.from("tool_sections").select("id", { count: "exact", head: true }).is("archived_at", null);
  if (active.error) throw new Error(`count tool sections: ${active.error.message}`);
  if ((active.count ?? 0) <= 1) return "last";
  const now = new Date().toISOString();
  const { data, error } = await client.from("tool_sections")
    .update({ archived_at: now, updated_at: now }).eq("id", id).is("archived_at", null).select("id");
  if (error) throw new Error(`delete tool section: ${error.message}`);
  return (data ?? []).length > 0 ? "ok" : "not_found";
}
