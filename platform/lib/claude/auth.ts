// /api/claude/* 的身分驗證（change claude-ticket-tools；spec「Key scope and authentication」）。
// 只認 Authorization: Bearer jk_cl_…，完全不讀 session cookie：瀏覽器登入狀態不能拿來呼叫，
// 反過來其他頁面與 server action 也不認這把金鑰（它們只讀 cookie），所以金鑰碰不到財務。
import { checkAccess, type Role, type UserStatus } from "../auth/access.ts";
import { hashSecret, isToken } from "./tokens.ts";

export const NOT_LINKED =
  "還沒連結或連結已被撤銷。請到看我笑話平台「我的」→「連結 Claude」按「產生連結碼」，再跟 Claude 說「連結看我笑話，代碼 jk_link_…」。";
export const NO_ACCESS = "你沒有開發頁的權限";
const TOUCH_INTERVAL_MS = 60 * 60 * 1000;

export type ClaudeUser = { id: string; name: string; role: Role; status: UserStatus };
export type TokenRow = { id: string; userId: string; revokedAt: string | null; lastUsedAt: string | null };
export type AuthResult = { ok: true; user: ClaudeUser; tokenId: string } | { ok: false; status: 401 | 403; error: string };

export type AuthDeps = {
  findToken(hash: string): Promise<TokenRow | null>;
  getUser(id: string): Promise<{ id: string; name: string; role: Role | null; status: UserStatus } | null>;
  touch(tokenId: string, userId: string): Promise<void>;
  now(): number;
};

export function bearerToken(request: Request): string | null {
  const h = request.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(\S+)$/i.exec(h.trim());
  return m ? m[1] : null;
}

export async function authenticateClaude(request: Request, deps: AuthDeps): Promise<AuthResult> {
  const token = bearerToken(request);
  if (!token || !isToken(token)) return { ok: false, status: 401, error: NOT_LINKED };
  const row = await deps.findToken(await hashSecret(token));
  if (!row || row.revokedAt) return { ok: false, status: 401, error: NOT_LINKED };
  const u = await deps.getUser(row.userId);
  if (!u) return { ok: false, status: 401, error: NOT_LINKED };
  if (!checkAccess({ id: u.id, role: u.role, status: u.status }, "tickets").ok || !u.role) {
    return { ok: false, status: 403, error: NO_ACCESS };
  }
  // 最後使用時間：超過 1 小時才寫一次；寫失敗不影響這次請求
  const last = row.lastUsedAt ? Date.parse(row.lastUsedAt) : 0;
  if (deps.now() - last >= TOUCH_INTERVAL_MS) {
    try {
      await deps.touch(row.id, u.id);
    } catch (err) {
      console.error("[claude] touch last_used_at failed", err);
    }
  }
  return { ok: true, user: { id: u.id, name: u.name, role: u.role, status: u.status }, tokenId: row.id };
}
