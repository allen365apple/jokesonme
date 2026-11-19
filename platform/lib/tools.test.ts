// 最後更新：2026-11-19 13:49
// 誰幫忙的：Claude Code（Claude Opus 5.5）
// 修改摘要：新增工具箱欄位檢查 validateToolInput 的單元測試。
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateToolInput } from "./tools.ts";

const base = { icon: "🎲", name: "骰子機", description: "現場擲骰子", url: "https://example.com/dice", section: "live" };
const v = (over: Record<string, string> = {}) => validateToolInput({ ...base, ...over });
const URL_ERROR = "網址要用 http:// 或 https:// 開頭";

test("合格的輸入通過，並修剪前後空白", () => {
  assert.deepEqual(v({ name: "  骰子機  ", url: " https://example.com/dice " }), {
    ok: true,
    value: { section: "live", icon: "🎲", name: "骰子機", description: "現場擲骰子", url: "https://example.com/dice" },
  });
});

test("spec 網址表：https、http 通過", () => {
  assert.equal(v({ url: "https://allen365apple.github.io/jokes-on-me/" }).ok, true);
  assert.equal(v({ url: "http://example.com/a?b=1" }).ok, true);
});

test("spec 網址表：javascript:、ftp:、沒有開頭的網址擋下", () => {
  for (const url of ["javascript:alert(1)", "ftp://example.com/file", "example.com", "", "http:example.com", "https://"]) {
    assert.deepEqual(v({ url }), { ok: false, error: URL_ERROR }, url);
  }
});

test("名稱 0／41 字擋下，1／40 字通過", () => {
  assert.deepEqual(v({ name: "" }), { ok: false, error: "名稱請填 1 到 40 個字" });
  assert.deepEqual(v({ name: "   " }), { ok: false, error: "名稱請填 1 到 40 個字" });
  assert.deepEqual(v({ name: "字".repeat(41) }), { ok: false, error: "名稱請填 1 到 40 個字" });
  assert.equal(v({ name: "字" }).ok, true);
  assert.equal(v({ name: "字".repeat(40) }).ok, true);
});

test("圖示 0／9 字擋下，emoji 依字元數計算", () => {
  assert.equal(v({ icon: "" }).ok, false);
  assert.equal(v({ icon: "123456789" }).ok, false);
  assert.equal(v({ icon: "12345678" }).ok, true);
  assert.equal(v({ icon: "⚔️" }).ok, true);
  assert.equal(v({ icon: "🎲🎲🎲🎲🎲🎲🎲🎲" }).ok, true); // 8 個 emoji 是 8 個字，不是 16
});

test("說明 120 字通過、121 字擋下，可以留空", () => {
  assert.equal(v({ description: "字".repeat(120) }).ok, true);
  assert.deepEqual(v({ description: "字".repeat(121) }), { ok: false, error: "說明最多 120 個字" });
  assert.equal(v({ description: "" }).ok, true);
});

test("分區只能是 internal、live、other", () => {
  for (const section of ["internal", "live", "other"]) assert.equal(v({ section }).ok, true, section);
  for (const section of ["", "admin", "LIVE"]) assert.deepEqual(v({ section }), { ok: false, error: "請選擇工具要放在哪一區" }, section);
});

test("缺欄位不會丟錯，回白話錯誤", () => {
  assert.equal(validateToolInput({}).ok, false);
});
