// 伺服器端取目前登入者，並依角色守門（spec: Role-based page access）。只能在 server component / action / route 用。
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession } from "./session.ts";
import { getUser, type UserRow } from "./users.ts";
import { checkAccess, type Area } from "./access.ts";

/** 同一個請求內只查一次資料庫（layout 與 page 都會呼叫）。 */
export const getCurrentUser = cache(async (): Promise<UserRow | null> => {
  const store = await cookies();
  const uid = await verifySession(process.env.AUTH_SECRET ?? "", store.get(SESSION_COOKIE)?.value);
  if (!uid) return null;
  return getUser(uid);
});

/** 頁面用：沒登入導去登入、未核准導去等待頁、沒權限導去自己能看的首頁。 */
export async function requirePage(area: Area, nextPath: string): Promise<UserRow> {
  const user = await getCurrentUser();
  const r = checkAccess(user, area);
  if (r.ok) return user!;
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  if (user.status !== "approved") redirect("/pending");
  redirect(homeFor(user));
}

/** server action / API 用：不合格直接丟錯，不轉址。 */
export async function requireAction(area: Area): Promise<UserRow> {
  const user = await getCurrentUser();
  const r = checkAccess(user, area);
  if (!r.ok) throw new Error(`forbidden: ${r.reason}`);
  return user!;
}

/** 首頁：成員與管理員是 /home（下一場、財務時程、待確認）；財務夥伴只有財務區，直接到財務總覽。 */
export function homeFor(user: Pick<UserRow, "role">): string {
  return user.role === "finance_partner" ? "/finance" : "/home";
}
