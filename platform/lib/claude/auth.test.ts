import { test } from "node:test";
import assert from "node:assert/strict";
import { authenticateClaude, NO_ACCESS, NOT_LINKED, type AuthDeps, type TokenRow } from "./auth.ts";
import { hashSecret, newToken } from "./tokens.ts";

const NOW = Date.parse("2026-11-09T12:00:00Z");

async function setup(opts: { revoked?: boolean; role?: "admin" | "member" | "finance_partner" | null; status?: "approved" | "pending" | "revoked"; lastUsedAt?: string | null } = {}) {
  const token = newToken();
  const hash = await hashSecret(token);
  const touched: string[] = [];
  const row: TokenRow = { id: "tok1", userId: "U_jesse", revokedAt: opts.revoked ? "2026-11-09T11:00:00Z" : null, lastUsedAt: opts.lastUsedAt ?? null };
  const deps: AuthDeps = {
    findToken: async (h) => (h === hash ? row : null),
    getUser: async (id) => (id === "U_jesse" ? { id, name: "傑哥", role: opts.role === undefined ? "admin" : opts.role, status: opts.status ?? "approved" } : null),
    touch: async (tid) => { touched.push(tid); },
    now: () => NOW,
  };
  return { token, deps, touched };
}

const req = (headers: Record<string, string>) => new Request("http://x/api/claude/tickets", { headers });

test("正確的金鑰回傳本人，並更新最後使用時間", async () => {
  const { token, deps, touched } = await setup();
  const r = await authenticateClaude(req({ authorization: `Bearer ${token}` }), deps);
  assert.deepEqual(r, { ok: true, user: { id: "U_jesse", name: "傑哥", role: "admin", status: "approved" }, tokenId: "tok1" });
  assert.deepEqual(touched, ["tok1"]);
});

test("1 小時內用過就不再寫最後使用時間", async () => {
  const { token, deps, touched } = await setup({ lastUsedAt: "2026-11-09T11:30:00Z" });
  assert.equal((await authenticateClaude(req({ authorization: `Bearer ${token}` }), deps)).ok, true);
  assert.deepEqual(touched, []);
});

test("401：沒帶、格式錯、不認得、已撤銷", async () => {
  const { token, deps } = await setup();
  const cases: Record<string, string>[] = [{}, { authorization: "Bearer jk_cl_short" }, { authorization: token }, { authorization: `Bearer ${newToken()}` }];
  for (const h of cases) assert.deepEqual(await authenticateClaude(req(h), deps), { ok: false, status: 401, error: NOT_LINKED }, JSON.stringify(h));
  const revoked = await setup({ revoked: true });
  assert.deepEqual(await authenticateClaude(req({ authorization: `Bearer ${revoked.token}` }), revoked.deps), { ok: false, status: 401, error: NOT_LINKED });
});

test("spec 情境：只有瀏覽器的登入 cookie、沒有 Bearer 金鑰 → 401", async () => {
  const { deps } = await setup();
  const r = await authenticateClaude(req({ cookie: "jk_session=whatever.signature" }), deps);
  assert.deepEqual(r, { ok: false, status: 401, error: NOT_LINKED });
});

test("403：財務夥伴、等待核准、已撤銷的使用者", async () => {
  for (const o of [{ role: "finance_partner" as const }, { status: "pending" as const, role: null }, { status: "revoked" as const }]) {
    const { token, deps } = await setup(o);
    assert.deepEqual(await authenticateClaude(req({ authorization: `Bearer ${token}` }), deps), { ok: false, status: 403, error: NO_ACCESS }, JSON.stringify(o));
  }
});

test("寫最後使用時間失敗不影響這次請求", async () => {
  const { token, deps } = await setup();
  deps.touch = async () => { throw new Error("db down"); };
  assert.equal((await authenticateClaude(req({ authorization: `Bearer ${token}` }), deps)).ok, true);
});
