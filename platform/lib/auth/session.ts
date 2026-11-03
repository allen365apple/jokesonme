// 自建 session（design.md「LINE Login 與 LIFF 共用自建 session」）。
// cookie 值 = base64url(JSON payload) + "." + base64url(HMAC-SHA256(AUTH_SECRET, payload))。
// 只存 userId 與到期時間；身分與角色每個請求都重讀資料庫，撤銷立即生效。

export const SESSION_COOKIE = "jk_session";
export const SESSION_DAYS = 30;

type Payload = { uid: string; exp: number }; // exp：Unix 秒

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(s: string): Uint8Array {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return Uint8Array.from(atob(pad), (c) => c.charCodeAt(0));
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data))));
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function signSession(secret: string, uid: string, nowSec = Math.floor(Date.now() / 1000)): Promise<string> {
  if (!secret) throw new Error("AUTH_SECRET 未設定");
  const body = b64url(new TextEncoder().encode(JSON.stringify({ uid, exp: nowSec + SESSION_DAYS * 86400 } satisfies Payload)));
  return `${body}.${await hmac(secret, body)}`;
}

/** 驗證成功回 userId；簽章不符、格式錯、過期都回 null。 */
export async function verifySession(secret: string, value: string | undefined | null, nowSec = Math.floor(Date.now() / 1000)): Promise<string | null> {
  if (!secret || !value) return null;
  const [body, sig] = value.split(".");
  if (!body || !sig) return null;
  if (!safeEqual(await hmac(secret, body), sig)) return null;
  try {
    const p = JSON.parse(new TextDecoder().decode(fromB64url(body))) as Payload;
    if (typeof p.uid !== "string" || typeof p.exp !== "number" || p.exp <= nowSec) return null;
    return p.uid;
  } catch {
    return null;
  }
}

export function sessionCookieOptions(secure: boolean) {
  return { httpOnly: true, secure, sameSite: "lax" as const, path: "/", maxAge: SESSION_DAYS * 86400 };
}

/** 登入後要回去的路徑：只接受站內相對路徑，避免被拿來轉址到外站。 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/"; // 根路徑依角色導到各自的首頁
  return next;
}
