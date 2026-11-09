// 伺服器端 Supabase client。每個請求都要帶 actor，資料庫 trigger 才能記錄「是誰改的」（spec: audit-log）。
// 只能在伺服器端使用：SUPABASE_SECRET_KEY 絕不能送到瀏覽器。
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** actor 格式：真人 `user:<LINE userId>`；系統 `line-bot` / `reminder-job` / `calendar-sync` / `migration`；
 *  `claude-api` 只用在「用金鑰找出是誰」的讀取，找到人之後的寫入一律用 `user:<id>`（change claude-ticket-tools）。 */
export type Actor = `user:${string}` | "line-bot" | "reminder-job" | "calendar-sync" | "migration" | "claude-api";

export function db(actor: Actor): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SECRET_KEY 未設定");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-actor": actor } },
  });
}
