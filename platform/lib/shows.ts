import { db, type Actor } from "./supabase.ts";

export type ShowType = "monthly" | "special" | "other";
export type ShowKind = "performance" | "ledger";
export type Show = {
  id: string; name: string; type: ShowType; kind: ShowKind; performanceDate: string | null; status: string;
  /** 財務：預設不分配的成員；null = 未設定（匯入時依既有票房列／名稱推測）。 */
  defaultExcludedMembers: string[] | null;
};

export const SHOW_TYPE_LABEL: Record<ShowType, string> = { monthly: "月號", special: "專場", other: "其他" };

type Row = { id: string; name: string; type: ShowType; kind: ShowKind; performance_date: string | null; status: string; default_excluded_members: string[] | null };
const COLUMNS = "id, name, type, kind, performance_date, status, default_excluded_members";

function toShow(r: Row): Show {
  return { id: r.id, name: r.name, type: r.type, kind: r.kind, performanceDate: r.performance_date, status: r.status, defaultExcludedMembers: r.default_excluded_members ?? null };
}
const sortShows = (list: Show[]) =>
  list.sort((a, b) => (b.performanceDate ?? "").localeCompare(a.performanceDate ?? "") || a.name.localeCompare(b.name, "zh-Hant"));

/** 財務用：全部專案，含 ledger（收支分類）。企劃面請用 listPerformances。 */
export async function listShows(actor: Actor): Promise<Show[]> {
  const { data, error } = await db(actor).from("shows").select(COLUMNS);
  if (error) throw new Error(`list shows: ${error.message}`);
  return sortShows(((data ?? []) as Row[]).map(toShow));
}

/** 企劃面（待辦、靈感、演出頁、LINE）：只有演出，永遠不含 ledger。 */
export async function listPerformances(actor: Actor): Promise<Show[]> {
  const { data, error } = await db(actor).from("shows").select(COLUMNS).eq("kind", "performance");
  if (error) throw new Error(`list performances: ${error.message}`);
  return sortShows(((data ?? []) as Row[]).map(toShow));
}

export type Pickable = { next: Show | null; upcoming: Show[]; more: Show[] };

/**
 * 候選演出清單（spec show-picker「Pickable show list」）：網頁選演出與 LINE 按鈕共用。
 * next = 今天或之後最近的 active 演出；upcoming = 今天或之後的 active 演出（依日期升冪，含 next）；
 * more = 其餘演出（已演出、沒日期、已歸檔），依日期降冪、沒日期的依名稱排在最後。ledger 一律不出現。
 */
export function pickableShows(shows: Show[], today: string): Pickable {
  const perf = shows.filter((s) => s.kind === "performance");
  const isUpcoming = (s: Show) => s.status === "active" && !!s.performanceDate && s.performanceDate >= today;
  const upcoming = perf.filter(isUpcoming).sort((a, b) => a.performanceDate!.localeCompare(b.performanceDate!) || a.name.localeCompare(b.name, "zh-Hant"));
  const more = perf
    .filter((s) => !isUpcoming(s))
    .sort((a, b) => {
      if (a.performanceDate && b.performanceDate) return b.performanceDate.localeCompare(a.performanceDate);
      if (a.performanceDate) return -1;
      if (b.performanceDate) return 1;
      return a.name.localeCompare(b.name, "zh-Hant");
    });
  return { next: upcoming[0] ?? null, upcoming, more };
}

/** 從 today 起算最近的一場（含當天）。 */
export function nextShow(shows: Show[], today: string): Show | null {
  return pickableShows(shows, today).next;
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86400000);
}

/** 傳給網頁選演出面板的精簡資料（伺服器端呼叫，結果當 props 傳給 client 元件）。 */
export type PickerShow = { id: string; name: string; performanceDate: string | null };
export type PickerData = { next: PickerShow | null; upcoming: PickerShow[]; more: PickerShow[] };
export function toPickerData(p: Pickable): PickerData {
  const slim = (s: Show): PickerShow => ({ id: s.id, name: s.name, performanceDate: s.performanceDate });
  return { next: p.next ? slim(p.next) : null, upcoming: p.upcoming.map(slim), more: p.more.map(slim) };
}
