// 最後更新：2026-11-19 13:49
// 誰幫忙的：Claude Code（Claude Opus 5.5）
// 修改摘要：權限表新增工具箱區域 tools（admin、member 可用，finance_partner 不可）。
// 角色權限表（spec: line-login-access「Role-based page access」）。伺服器端每個資料入口都要過這裡。

export type Role = "admin" | "member" | "finance_partner";
export type UserStatus = "pending" | "approved" | "revoked";
export type Area = "todos" | "ideas" | "planning" | "messages" | "finance" | "tickets" | "tools" | "admin";

export type SessionUser = { id: string; role: Role | null; status: UserStatus };

const ALLOWED: Record<Role, ReadonlySet<Area>> = {
  admin: new Set<Area>(["todos", "ideas", "planning", "messages", "finance", "tickets", "tools", "admin"]),
  member: new Set<Area>(["todos", "ideas", "planning", "messages", "finance", "tickets", "tools"]),
  finance_partner: new Set<Area>(["finance"]),
};

export type AccessResult = { ok: true } | { ok: false; status: 401 | 403; reason: string };

export function checkAccess(user: SessionUser | null, area: Area): AccessResult {
  if (!user) return { ok: false, status: 401, reason: "not signed in" };
  if (user.status !== "approved" || !user.role) return { ok: false, status: 403, reason: `user ${user.status}` };
  return ALLOWED[user.role].has(area) ? { ok: true } : { ok: false, status: 403, reason: `${user.role} cannot access ${area}` };
}
