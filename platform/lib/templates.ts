// 演出模板（spec: show-todo-templates）：月號建立時依模板產生有實際截止日的待辦；改演出日會平移未完成的模板待辦。
import { db, type Actor } from "./supabase.ts";
import { addDays, todayInTaipei } from "./dates.ts";

export type TemplateItem = { id: string; title: string; offsetDays: number; defaultAssignee: string | null; sortOrder: number };

export async function listTemplateItems(actor: Actor, showType = "monthly"): Promise<TemplateItem[]> {
  const { data, error } = await db(actor)
    .from("show_template_items")
    .select("id, title, offset_days, default_assignee, sort_order, show_templates!inner(show_type)")
    .eq("show_templates.show_type", showType)
    .order("sort_order");
  if (error) throw new Error(`list template: ${error.message}`);
  return (data ?? []).map((r: { id: string; title: string; offset_days: number; default_assignee: string | null; sort_order: number }) => ({
    id: r.id, title: r.title, offsetDays: r.offset_days, defaultAssignee: r.default_assignee, sortOrder: r.sort_order,
  }));
}

/**
 * 已演出的場次不產生模板待辦（2026-11-03 Jesse）：編輯一場過去的月號（例如補類別、改名）時，
 * 不能冒出一整批截止日在過去的待辦。演出日 < 今天就整批不建。
 */
export function templateTodosAllowed(performanceDate: string, today: string): boolean {
  return performanceDate >= today;
}

/** 純函式：模板 × 演出日 → 要建立的待辦（spec 範例：10/24 −21 → 10/3、−1 → 10/23、+7 → 10/31）。給 today 時，已演出的場次回傳空陣列。 */
export function planTemplateTodos(items: TemplateItem[], performanceDate: string, memberToUser: Map<string, string>, today?: string) {
  if (today && !templateTodosAllowed(performanceDate, today)) return [];
  return items.map((i) => ({
    title: i.title,
    dueDate: addDays(performanceDate, i.offsetDays),
    templateItemId: i.id,
    assigneeUserId: i.defaultAssignee ? (memberToUser.get(i.defaultAssignee) ?? null) : null,
  }));
}

async function memberUserMap(actor: Actor): Promise<Map<string, string>> {
  const { data, error } = await db(actor).from("users").select("id, member_name").eq("status", "approved").not("member_name", "is", null);
  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((u: { id: string; member_name: string }) => [u.member_name, u.id]));
}

/** 月號且有演出日、演出日還沒過、而且還沒有模板待辦時才產生（避免重複）。回傳產生的筆數。 */
export async function ensureTemplateTodos(actor: Actor, showId: string, today: string = todayInTaipei()): Promise<number> {
  const client = db(actor);
  const { data: show, error } = await client.from("shows").select("type, performance_date").eq("id", showId).single();
  if (error || !show) throw new Error(`read show: ${error?.message}`);
  if (show.type !== "monthly" || !show.performance_date) return 0;
  if (!templateTodosAllowed(show.performance_date, today)) return 0;
  const { count } = await client.from("todos").select("id", { count: "exact", head: true }).eq("show_id", showId).eq("source", "template");
  if ((count ?? 0) > 0) return 0;
  const plan = planTemplateTodos(await listTemplateItems(actor, "monthly"), show.performance_date, await memberUserMap(actor), today);
  if (!plan.length) return 0;
  const { data: created, error: e1 } = await client
    .from("todos")
    .insert(plan.map((p) => ({ title: p.title, show_id: showId, due_date: p.dueDate, source: "template", template_item_id: p.templateItemId })))
    .select("id, template_item_id");
  if (e1 || !created) throw new Error(`create template todos: ${e1?.message}`);
  const byItem = new Map(created.map((c: { id: string; template_item_id: string }) => [c.template_item_id, c.id]));
  const assignees = plan.filter((p) => p.assigneeUserId).map((p) => ({ todo_id: byItem.get(p.templateItemId), user_id: p.assigneeUserId }));
  if (assignees.length) {
    const { error: e2 } = await client.from("todo_assignees").insert(assignees);
    if (e2) throw new Error(`assign template todos: ${e2.message}`);
  }
  return plan.length;
}

/** 演出日改了：未完成的模板待辦一起平移同樣天數（已完成的不動）。 */
export async function shiftTemplateTodos(actor: Actor, showId: string, fromDate: string, toDate: string): Promise<void> {
  const delta = Math.round((Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / 86400000);
  if (!delta) return;
  const client = db(actor);
  const { data, error } = await client.from("todos").select("id, due_date").eq("show_id", showId).eq("source", "template").is("done_at", null).is("deleted_at", null);
  if (error) throw new Error(error.message);
  for (const t of (data ?? []) as { id: string; due_date: string | null }[]) {
    if (!t.due_date) continue;
    const { error: e } = await client.from("todos").update({ due_date: addDays(t.due_date, delta) }).eq("id", t.id);
    if (e) throw new Error(e.message);
  }
}
