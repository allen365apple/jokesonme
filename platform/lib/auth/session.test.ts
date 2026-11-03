import { test } from "node:test";
import assert from "node:assert/strict";
import { safeNextPath, signSession, verifySession, SESSION_DAYS } from "./session.ts";

const S = "test-secret";
const now = 1_790_000_000;

test("簽了能驗、拿回 userId", async () => {
  const v = await signSession(S, "U123", now);
  assert.equal(await verifySession(S, v, now + 10), "U123");
});

test("竄改內容或簽章都失敗", async () => {
  const v = await signSession(S, "U123", now);
  const [body, sig] = v.split(".");
  const forged = Buffer.from(JSON.stringify({ uid: "U_admin", exp: now + 999999 })).toString("base64url");
  assert.equal(await verifySession(S, `${forged}.${sig}`, now), null);
  assert.equal(await verifySession(S, `${body}.${sig.slice(0, -1)}x`, now), null);
  assert.equal(await verifySession("other-secret", v, now), null);
});

test("30 天後過期", async () => {
  const v = await signSession(S, "U123", now);
  assert.equal(await verifySession(S, v, now + SESSION_DAYS * 86400 - 1), "U123");
  assert.equal(await verifySession(S, v, now + SESSION_DAYS * 86400), null);
});

test("空值、亂碼回 null", async () => {
  assert.equal(await verifySession(S, undefined, now), null);
  assert.equal(await verifySession(S, "garbage", now), null);
  assert.equal(await verifySession("", "a.b", now), null);
});

test("next 只接受站內路徑", () => {
  assert.equal(safeNextPath("/todos?f=mine"), "/todos?f=mine");
  assert.equal(safeNextPath("https://evil.com"), "/");
  assert.equal(safeNextPath("//evil.com"), "/");
  assert.equal(safeNextPath(null), "/");
});
