// 本機開發用的假帳號登入（spec local-dev-environment「Development sign-in shortcut」）。
// 三個條件同時成立才啟用：不是正式建置、DEV_LOGIN=1、JK_ENV=development。
// Cloudflare 上的正式版一定是 NODE_ENV=production，所以正式網站永遠是 404。

export type DevLoginEnv = { NODE_ENV?: string; DEV_LOGIN?: string; JK_ENV?: string };

export function devLoginEnabled(env: DevLoginEnv): boolean {
  return env.NODE_ENV !== "production" && env.DEV_LOGIN === "1" && env.JK_ENV === "development";
}
