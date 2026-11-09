// 連結碼與連結金鑰（change claude-ticket-tools；spec「Link code issuance」「Link exchange」）。
// 兩者都只在產生當下以明碼出現一次；資料庫只存 hashSecret 的結果。純函式，瀏覽器以外的 Web Crypto 都能跑。

export const LINK_CODE_PREFIX = "jk_link_";
export const TOKEN_PREFIX = "jk_cl_";
export const LINK_CODE_TTL_MS = 10 * 60 * 1000;
export const API_VERSION = 1;

const LINK_CODE_RE = /^jk_link_[0-9a-f]{24}$/;
const TOKEN_RE = /^jk_cl_[0-9a-f]{64}$/;

function randomHex(bytes: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function newLinkCode(): string {
  return `${LINK_CODE_PREFIX}${randomHex(12)}`;
}

export function newToken(): string {
  return `${TOKEN_PREFIX}${randomHex(32)}`;
}

export function isLinkCode(s: string): boolean {
  return LINK_CODE_RE.test(s);
}

export function isToken(s: string): boolean {
  return TOKEN_RE.test(s);
}

/** SHA-256 十六進位（64 字元小寫）。資料庫的 code_hash／token_hash 有 check 擋住不是這個格式的值。 */
export async function hashSecret(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function linkCodeExpiry(nowMs = Date.now()): string {
  return new Date(nowMs + LINK_CODE_TTL_MS).toISOString();
}

/** 到期時間當下就算過期。 */
export function isExpired(expiresAt: string, nowMs = Date.now()): boolean {
  return nowMs >= Date.parse(expiresAt);
}
