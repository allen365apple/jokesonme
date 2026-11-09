// 連結碼與連結金鑰的資料操作（change claude-ticket-tools；spec「Link code issuance」「Link exchange」「Key revocation」）。
// 只能在伺服器端用。寫入一律以本人 `user:<id>` 為 actor；用金鑰找人的讀取用 `claude-api`。
import { db } from "../supabase.ts";
import { checkAccess } from "../auth/access.ts";
import { displayName, getUser, type UserRow } from "../auth/users.ts";
import type { AuthDeps } from "./auth.ts";
import { hashSecret, isExpired, isLinkCode, linkCodeExpiry, newLinkCode, newToken } from "./tokens.ts";

export const LINK_ERRORS = {
  invalid: "連結碼不正確",
  expired: "連結碼已過期，請到平台重新產生",
  used: "連結碼已經用過，請到平台重新產生",
  noAccess: "這個帳號沒有開發頁的權限",
} as const;

export type LinkedDevice = { id: string; deviceName: string; createdAt: string; lastUsedAt: string | null };

/** 產生新的連結碼；同一人之前還沒用的碼一律作廢（標成已用）。 */
export async function createLinkCode(user: Pick<UserRow, "id" | "role" | "status">): Promise<{ code: string; expiresAt: string }> {
  if (!checkAccess({ id: user.id, role: user.role, status: user.status }, "tickets").ok) throw new Error("forbidden: tickets");
  const client = db(`user:${user.id}`);
  const now = new Date().toISOString();
  const { error: e1 } = await client.from("claude_link_codes").update({ used_at: now }).eq("user_id", user.id).is("used_at", null);
  if (e1) throw new Error(`void old codes: ${e1.message}`);
  const code = newLinkCode();
  const expiresAt = linkCodeExpiry();
  const { error: e2 } = await client.from("claude_link_codes").insert({ user_id: user.id, code_hash: await hashSecret(code), expires_at: expiresAt });
  if (e2) throw new Error(`insert code: ${e2.message}`);
  return { code, expiresAt };
}

export type ExchangeResult = { ok: true; token: string; name: string } | { ok: false; error: string };

/** 連結碼換金鑰：碼必須存在、未用、未過期；標記已用用「還沒用才更新」防止同時換兩次。 */
export async function exchangeLinkCode(code: string, device: string): Promise<ExchangeResult> {
  if (!isLinkCode(code.trim())) return { ok: false, error: LINK_ERRORS.invalid };
  const hash = await hashSecret(code.trim());
  const { data: row, error } = await db("claude-api")
    .from("claude_link_codes")
    .select("id, user_id, expires_at, used_at")
    .eq("code_hash", hash)
    .maybeSingle<{ id: string; user_id: string; expires_at: string; used_at: string | null }>();
  if (error) throw new Error(`read code: ${error.message}`);
  if (!row) return { ok: false, error: LINK_ERRORS.invalid };
  if (row.used_at) return { ok: false, error: LINK_ERRORS.used };
  if (isExpired(row.expires_at)) return { ok: false, error: LINK_ERRORS.expired };
  const user = await getUser(row.user_id);
  if (!user || !checkAccess({ id: user.id, role: user.role, status: user.status }, "tickets").ok) return { ok: false, error: LINK_ERRORS.noAccess };

  const client = db(`user:${user.id}`);
  const { data: claimed, error: e1 } = await client
    .from("claude_link_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("used_at", null)
    .select("id");
  if (e1) throw new Error(`use code: ${e1.message}`);
  if (!claimed?.length) return { ok: false, error: LINK_ERRORS.used };

  const token = newToken();
  const { error: e2 } = await client
    .from("claude_tokens")
    .insert({ user_id: user.id, token_hash: await hashSecret(token), device_name: device.trim().slice(0, 80) });
  if (e2) throw new Error(`insert token: ${e2.message}`);
  return { ok: true, token, name: displayName(user) };
}

/** 自己還有效的連結（最新的在前）。 */
export async function listLinkedDevices(userId: string): Promise<LinkedDevice[]> {
  const { data, error } = await db(`user:${userId}`)
    .from("claude_tokens")
    .select("id, device_name, created_at, last_used_at")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .returns<{ id: string; device_name: string; created_at: string; last_used_at: string | null }[]>();
  if (error) throw new Error(`list tokens: ${error.message}`);
  return (data ?? []).map((r) => ({ id: r.id, deviceName: r.device_name || "未命名的電腦", createdAt: r.created_at, lastUsedAt: r.last_used_at }));
}

/** 撤銷自己的一把金鑰；條件同時鎖 id 與 user_id，撤不到別人的。 */
export async function revokeLinkedDevice(userId: string, tokenId: string): Promise<boolean> {
  const { data, error } = await db(`user:${userId}`)
    .from("claude_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", tokenId)
    .eq("user_id", userId)
    .is("revoked_at", null)
    .select("id");
  if (error) throw new Error(`revoke token: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

/** authenticateClaude 用的真實資料來源。 */
export const claudeAuthDeps: AuthDeps = {
  async findToken(hash) {
    const { data, error } = await db("claude-api")
      .from("claude_tokens")
      .select("id, user_id, revoked_at, last_used_at")
      .eq("token_hash", hash)
      .maybeSingle<{ id: string; user_id: string; revoked_at: string | null; last_used_at: string | null }>();
    if (error) throw new Error(`read token: ${error.message}`);
    return data ? { id: data.id, userId: data.user_id, revokedAt: data.revoked_at, lastUsedAt: data.last_used_at } : null;
  },
  async getUser(id) {
    const u = await getUser(id);
    return u ? { id: u.id, name: displayName(u), role: u.role, status: u.status } : null;
  },
  async touch(tokenId, userId) {
    const { error } = await db(`user:${userId}`).from("claude_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", tokenId);
    if (error) throw new Error(error.message);
  },
  now: () => Date.now(),
};
