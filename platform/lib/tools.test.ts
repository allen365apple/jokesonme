// 最後更新：2026-11-19 15:09
// 誰幫忙的：Claude Code（Claude Opus 5.5）
// 修改摘要：區塊改成資料後，改測區塊 id 格式，並新增區塊名稱 validateSectionName 的邊界測試。
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateSectionName, validateToolInput } from "./tools.ts";

const SECTION = "6f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f";
const base = { icon: "🎲", name: "骰子機", description: "現場擲骰子", url: "https://example.com/dice", sectionId: SECTION };
const v = (over: Record<string, string> = {}) => validateToolInput({ ...base, ...over });
const URL_ERROR = "網址要用 http:// 或 https:// 開頭";

test("合格的輸入通過，並修剪前後空白", () => {
  assert.deepEqual(v({ name: "  骰子機  ", url: " https://example.com/dice " }), {
    ok: true,
    value: { sectionId: SECTION, icon: "🎲", name: "骰子機", description: "現場擲骰子", url: "https://example.com/dice" },
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

test("區塊 id 要是 uuid 格式，大小寫不拘、存成小寫", () => {
  assert.equal(v({ sectionId: SECTION.toUpperCase() }).ok, true);
  const r = v({ sectionId: ` ${SECTION.toUpperCase()} ` });
  assert.equal(r.ok && r.value.sectionId, SECTION);
  for (const sectionId of ["", "live", "internal", "123", `${SECTION}x`, "6f1c2d3e4a5b4c6d8e7f9a0b1c2d3e4f"]) {
    assert.deepEqual(v({ sectionId }), { ok: false, error: "請選擇工具要放在哪一區" }, sectionId);
  }
});

test("區塊名稱：修剪後 1／20 字通過，0／21 字擋下", () => {
  const err = { ok: false, error: "區塊名稱請填 1 到 20 個字" };
  assert.deepEqual(validateSectionName("  公開資訊  "), { ok: true, value: "公開資訊" });
  assert.deepEqual(validateSectionName("字"), { ok: true, value: "字" });
  assert.equal(validateSectionName("字".repeat(20)).ok, true);
  assert.equal(validateSectionName("🎤".repeat(20)).ok, true); // emoji 一個算一個字
  assert.deepEqual(validateSectionName("字".repeat(21)), err);
  assert.deepEqual(validateSectionName(""), err);
  assert.deepEqual(validateSectionName("   "), err);
  assert.deepEqual(validateSectionName(null), err);
  assert.deepEqual(validateSectionName(undefined), err);
});

test("缺欄位不會丟錯，回白話錯誤", () => {
  assert.equal(validateToolInput({}).ok, false);
});
