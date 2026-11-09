import { test } from "node:test";
import assert from "node:assert/strict";
import { devLoginEnabled } from "./dev-login.ts";

// spec「Development sign-in shortcut」範例表
test("三個條件都成立才啟用，任一個不成立都關閉", () => {
  const rows: [Parameters<typeof devLoginEnabled>[0], boolean][] = [
    [{ NODE_ENV: "development", DEV_LOGIN: "1", JK_ENV: "development" }, true],
    [{ NODE_ENV: "production", DEV_LOGIN: "1", JK_ENV: "development" }, false],
    [{ NODE_ENV: "development", JK_ENV: "development" }, false],
    [{ NODE_ENV: "development", DEV_LOGIN: "1" }, false],
  ];
  for (const [env, expected] of rows) assert.equal(devLoginEnabled(env), expected, JSON.stringify(env));
});

test("值要完全相符：DEV_LOGIN=true、JK_ENV=dev 都不算", () => {
  assert.equal(devLoginEnabled({ NODE_ENV: "development", DEV_LOGIN: "true", JK_ENV: "development" }), false);
  assert.equal(devLoginEnabled({ NODE_ENV: "development", DEV_LOGIN: "1", JK_ENV: "dev" }), false);
});
