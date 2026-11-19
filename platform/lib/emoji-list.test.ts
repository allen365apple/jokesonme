// 最後更新：2026-11-19 14:30
// 誰幫忙的：Claude Code（Claude Opus 5.5）
// 修改摘要：新增工具箱圖示選擇器的 emoji 清單與搜尋單元測試。
import { test } from "node:test";
import assert from "node:assert/strict";
import { EMOJI_GROUPS, searchEmoji } from "./emoji-list.ts";

test("every entry has an emoji and a Chinese name, and emoji are unique across groups", () => {
  const all = EMOJI_GROUPS.flatMap((g) => g.items);
  assert.ok(all.length >= 200, `only ${all.length} emoji`);
  for (const e of all) {
    assert.ok(e.emoji.length > 0 && e.name.length > 0, JSON.stringify(e));
    assert.ok(e.name !== e.emoji, `missing name for ${e.emoji}`);
  }
  assert.equal(new Set(all.map((e) => e.emoji)).size, all.length);
});

test("empty query means show all groups", () => {
  assert.equal(searchEmoji(""), null);
  assert.equal(searchEmoji("   "), null);
});

test("search matches Chinese keywords", () => {
  const mic = searchEmoji("麥克風")!.map((e) => e.emoji);
  assert.ok(mic.includes("🎤"));
  assert.ok(mic.includes("🎙️"));
  assert.ok(searchEmoji("投票")!.some((e) => e.emoji === "🗳️"));
  assert.ok(searchEmoji("笑")!.some((e) => e.emoji === "😂"));
});

test("search is case-insensitive for latin keywords and accepts a pasted emoji", () => {
  assert.ok(searchEmoji("ai")!.some((e) => e.emoji === "🤖"));
  assert.deepEqual(searchEmoji("🦦")!.map((e) => e.emoji), ["🦦"]);
});

test("no match returns an empty list", () => {
  assert.deepEqual(searchEmoji("完全不存在的關鍵字"), []);
});
