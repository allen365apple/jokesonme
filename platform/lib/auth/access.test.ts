import { test } from "node:test";
import assert from "node:assert/strict";
import { checkAccess, type Area, type SessionUser } from "./access.ts";

const areas: Area[] = ["todos", "ideas", "planning", "messages", "finance", "tickets", "admin"];
const u = (role: SessionUser["role"], status: SessionUser["status"] = "approved"): SessionUser => ({ id: "U", role, status });
const allowed = (user: SessionUser | null) => areas.filter((a) => checkAccess(user, a).ok);

test("spec 權限表", () => {
  assert.deepEqual(allowed(u("admin")), areas);
  assert.deepEqual(allowed(u("member")), ["todos", "ideas", "planning", "messages", "finance", "tickets"]);
  assert.deepEqual(allowed(u("finance_partner")), ["finance"]);
});

test("財務夥伴碰開發頁回 403", () => {
  assert.deepEqual(checkAccess(u("finance_partner"), "tickets"), { ok: false, status: 403, reason: "finance_partner cannot access tickets" });
});

test("財務夥伴讀待辦回 403", () => {
  assert.deepEqual(checkAccess(u("finance_partner"), "todos"), { ok: false, status: 403, reason: "finance_partner cannot access todos" });
});

test("未登入 401、等待核准與已撤銷 403", () => {
  assert.equal((checkAccess(null, "todos") as { status: number }).status, 401);
  assert.deepEqual(allowed(u(null, "pending")), []);
  assert.deepEqual(allowed(u("member", "revoked")), []);
});
