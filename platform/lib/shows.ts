import { db, type Actor } from "./supabase.ts";

export type ShowType = "monthly" | "special" | "other";
export type ShowKind = "performance" | "ledger";
/** 演出類別（shows.series，0014）：財務列表的 badge 與篩選用；跟 type（流程旗標：monthly 觸發月號模板與隔天技術費）分開。 */
export type ShowSeries = "看我笑話" | "現代問題維修中心" | "專場";
export type Show = {
  id: string; name: string; type: ShowType; kind: ShowKind; series: ShowSeries | null; performanceDate: string | null; status: string;
  /** 財務：預設不分配的成員；null = 未設定（匯入時依既有票房列／名稱推測）。 */
  defaultExcludedMembers: string[] | null;
};

export const SHOW_TYPE_LABEL: Record<ShowType, string> = { monthly: "月號", special: "專場", other: "其他" };
export const SHOW_SERIES: readonly ShowSeries[] = ["看我笑話", "現代問題維修中心", "專場"];
export const isShowSeries = (v: unknown): v is ShowSeries => typeof v === "string" && (SHOW_SERIES as readonly string[]).includes(v);
/** 類別未設定時的推測（與 0014 的回填規則相同），只給畫面顯示用，不寫回資料庫。 */
export function guessSeries(show: Pick<Show, "name" | "type">): ShowSeries {
  if (/^現代問題維修中心/.test(show.name)) return "現代問題維修中心";
  if (show.type === "special" || /專場/.test(show.name)) return "專場";
  return "看我笑話";
}
export const seriesOf = (show: Pick<Show, "name" | "type" | "series">): ShowSeries => show.series ?? guessSeries(show);

// performance_date rule (2026-11-03, Jesse): a show with several sessions stores the
// LATEST session date (e.g. 直球 5/23+5/30 → 05-30), because finance timing (settlements,
// day-after tech fees) follows the last session. Exact start time lives in program_start_time.
type Row = { id: string; name: string; type: ShowType; kind: ShowKind; series: ShowSeries | null; performance_date: string | null; status: string; default_excluded_members: string[] | null };
const COLUMNS = "id, name, type, kind, series, performance_date, status, default_excluded_members";

function toShow(r: Row): Show {
  return { id: r.id, name: r.name, type: r.type, kind: r.kind, series: r.series ?? null, performanceDate: r.performance_date, status: r.status, defaultExcludedMembers: r.default_excluded_members ?? null };
}

/** 財務用：單一專案。 */
export async function getShow(actor: Actor, id: string): Promise<Show | null> {
  const { data, error } = await db(actor).from("shows").select(COLUMNS).eq("id", id).maybeSingle<Row>();
  if (error) throw new Error(`get show: ${error.message}`);
  return data ? toShow(data) : null;
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
