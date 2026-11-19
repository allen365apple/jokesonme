// 最後更新：2026-11-19 13:49
// 誰幫忙的：Claude Code（Claude Opus 5.5）
// 修改摘要：新增三種角色對工具箱區域 tools 的權限斷言。
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkAccess, type Area, type SessionUser } from "./access.ts";

const areas: Area[] = ["todos", "ideas", "planning", "messages", "finance", "tickets", "tools", "admin"];
const u = (role: SessionUser["role"], status: SessionUser["status"] = "approved"): SessionUser => ({ id: "U", role, status });
const allowed = (user: SessionUser | null) => areas.filter((a) => checkAccess(user, a).ok);

test("spec 權限表", () => {
  assert.deepEqual(allowed(u("admin")), areas);
  assert.deepEqual(allowed(u("member")), ["todos", "ideas", "planning", "messages", "finance", "tickets", "tools"]);
  assert.deepEqual(allowed(u("finance_partner")), ["finance"]);
});

test("財務夥伴碰開發頁回 403", () => {
  assert.deepEqual(checkAccess(u("finance_partner"), "tickets"), { ok: false, status: 403, reason: "finance_partner cannot access tickets" });
});

test("工具箱：管理員與成員可用、財務夥伴 403、未登入 401", () => {
  assert.deepEqual(checkAccess(u("admin"), "tools"), { ok: true });
  assert.deepEqual(checkAccess(u("member"), "tools"), { ok: true });
  assert.deepEqual(checkAccess(u("finance_partner"), "tools"), { ok: false, status: 403, reason: "finance_partner cannot access tools" });
  assert.equal((checkAccess(null, "tools") as { status: number }).status, 401);
});

test("財務夥伴讀待辦回 403", () => {
  assert.deepEqual(checkAccess(u("finance_partner"), "todos"), { ok: false, status: 403, reason: "finance_partner cannot access todos" });
});

test("未登入 401、等待核准與已撤銷 403", () => {
  assert.equal((checkAccess(null, "todos") as { status: number }).status, 401);
  assert.deepEqual(allowed(u(null, "pending")), []);
  assert.deepEqual(allowed(u("member", "revoked")), []);
});
