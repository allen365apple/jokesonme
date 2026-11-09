// 本機開發用：/api/dev/login?as=<userId>&next=<path>（spec local-dev-environment「Development sign-in shortcut」）。
// 條件不符一律 404，不說明原因；只能登入資料庫裡已核准的使用者（種子資料的 dev-admin、dev-member、dev-finance）。
import { NextResponse } from "next/server";
import { devLoginEnabled } from "@/lib/auth/dev-login";
import { getUser } from "@/lib/auth/users";
import { SESSION_COOKIE, safeNextPath, sessionCookieOptions, signSession } from "@/lib/auth/session";

export async function GET(request: Request): Promise<Response> {
  if (!devLoginEnabled(process.env)) return new NextResponse(null, { status: 404 });
  const url = new URL(request.url);
  const uid = url.searchParams.get("as") ?? "";
  const user = uid ? await getUser(uid) : null;
  if (!user || user.status !== "approved") {
    return NextResponse.json({ error: "找不到這個已核准的使用者，先跑 npm run db:seed-dev" }, { status: 403 });
  }
  const res = NextResponse.redirect(new URL(safeNextPath(url.searchParams.get("next")), url));
  res.cookies.set(SESSION_COOKIE, await signSession(process.env.AUTH_SECRET ?? "", user.id), sessionCookieOptions(url.protocol === "https:"));
  return res;
}
