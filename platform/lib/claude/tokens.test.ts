import { test } from "node:test";
import assert from "node:assert/strict";
import { hashSecret, isExpired, isLinkCode, isToken, linkCodeExpiry, newLinkCode, newToken } from "./tokens.ts";

test("連結碼與金鑰格式：jk_link_＋24 位、jk_cl_＋64 位十六進位，每次都不同", () => {
  const c = newLinkCode();
  const t = newToken();
  assert.match(c, /^jk_link_[0-9a-f]{24}$/);
  assert.match(t, /^jk_cl_[0-9a-f]{64}$/);
  assert.notEqual(newLinkCode(), c);
  assert.notEqual(newToken(), t);
  assert.ok(isLinkCode(c) && isToken(t));
  assert.ok(!isLinkCode(t) && !isToken(c));
  assert.ok(!isToken(`${t}0`) && !isToken(t.toUpperCase()));
});

test("雜湊：同一輸入相同、不同輸入不同、是 64 位小寫十六進位且不含明碼", async () => {
  const t = newToken();
  const h = await hashSecret(t);
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(await hashSecret(t), h);
  assert.notEqual(await hashSecret(newToken()), h);
  assert.ok(!h.includes(t.slice(6, 20)));
});

test("連結碼 10 分鐘到期：9 分 59 秒還有效、10 分 01 秒過期", () => {
  const issued = Date.parse("2026-11-09T12:00:00Z");
  const exp = linkCodeExpiry(issued);
  assert.equal(exp, "2026-11-09T12:10:00.000Z");
  assert.equal(isExpired(exp, issued + 9 * 60_000 + 59_000), false);
  assert.equal(isExpired(exp, issued + 10 * 60_000 + 1_000), true);
});
