"use server";
// 新增演出（spec: show-management「Add new show」）：月號一定要有演出日期。
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAction } from "@/lib/auth/current";
import { db } from "@/lib/supabase";
import { ensureTemplateTodos, shiftTemplateTodos } from "@/lib/templates";
import { isShowSeries } from "@/lib/shows";

export async function createShow(fd: FormData) {
  const me = await requireAction("planning");
  const name = String(fd.get("name") ?? "").trim();
  const type = String(fd.get("type") ?? "other");
  const seriesRaw = String(fd.get("series") ?? "");
  const date = String(fd.get("performance_date") ?? "").trim();
  if (!name) redirect("/shows?new=1&err=name");
  if (!["monthly", "special", "other"].includes(type)) throw new Error("invalid type");
  if (!isShowSeries(seriesRaw)) redirect("/shows?new=1&err=series");
  if (type === "monthly" && !/^\d{4}-\d{2}-\d{2}$/.test(date)) redirect("/shows?new=1&err=date");
  const { data: created, error } = await db(`user:${me.id}`)
    .from("shows")
    .insert({ name, type, series: seriesRaw, performance_date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null })
    .select("id")
    .single();
  if (error || !created) redirect(`/shows?new=1&err=${error?.code === "23505" ? "dup" : "save"}`);
  await ensureTemplateTodos(`user:${me.id}`, created.id); // 月號 → 依模板產生固定待辦（已演出的場次不產生）
  revalidatePath("/shows");
  revalidatePath("/todos");
  revalidatePath("/home");
  redirect("/shows");
}

/** 編輯演出（名稱、類型、類別、演出日期）；月號一定要有日期。多場次演出的日期填最晚一場（lib/shows.ts）。 */
export async function updateShow(fd: FormData): Promise<{ ok: boolean; error?: string }> {
  const me = await requireAction("planning");
  const id = String(fd.get("id") ?? "");
  const name = String(fd.get("name") ?? "").trim();
  const type = String(fd.get("type") ?? "other");
  const seriesRaw = String(fd.get("series") ?? "");
  const date = String(fd.get("performance_date") ?? "").trim();
  const status = fd.get("archived") === "1" ? "archived" : "active"; // spec show-management「Archive a show」
  if (!name) return { ok: false, error: "請填寫演出名稱" };
  if (!["monthly", "special", "other"].includes(type)) return { ok: false, error: "類型不正確" };
  if (!isShowSeries(seriesRaw)) return { ok: false, error: "請選擇類別" };
  if (type === "monthly" && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "月號一定要填演出日期" };
  const actor = `user:${me.id}` as const;
  const { data: before } = await db(actor).from("shows").select("performance_date").eq("id", id).single();
  const newDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
  const { error } = await db(actor).from("shows").update({ name, type, series: seriesRaw, performance_date: newDate, status }).eq("id", id).eq("kind", "performance");
  if (error) return { ok: false, error: error.code === "23505" ? "已經有同名的演出" : "儲存失敗，請再試一次" };
  try {
    // 改演出日 → 未完成的模板待辦一起平移；變成月號且還沒有模板待辦 → 產生（已演出的場次不產生，避免冒出一批過期待辦）
    if (before?.performance_date && newDate && before.performance_date !== newDate) await shiftTemplateTodos(actor, id, before.performance_date, newDate);
    await ensureTemplateTodos(actor, id);
  } catch (e) {
    console.error("[shows] template todos failed", e);
    return { ok: false, error: "演出資訊已儲存，但模板待辦沒有產生成功，請再存一次" };
  }
  revalidatePath("/shows");
  revalidatePath(`/shows/${id}`);
  revalidatePath("/todos");
  revalidatePath("/home");
  revalidatePath("/finance");
  revalidatePath(`/finance/shows/${id}`);
  return { ok: true };
}
