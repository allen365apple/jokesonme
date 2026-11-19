// 最後更新：2026-11-19 15:09
// 誰幫忙的：Claude Code（Claude Opus 5.5）
// 修改摘要：新增拖曳排序純函式（落點、目標索引、陣列搬移、依 id 重排）的單元測試。
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOrder, dropSlot, moveItem, slotToIndex } from "./reorder.ts";

// 三個高 40px、間隔 10px 的項目：中點 20、70、120
const mids = [20, 70, 120];

test("落點：指標在第一個中點以上就是 0，超過最後一個中點就是最後", () => {
  assert.equal(dropSlot(mids, -500), 0);
  assert.equal(dropSlot(mids, 0), 0);
  assert.equal(dropSlot(mids, 19), 0);
  assert.equal(dropSlot(mids, 20), 1); // 剛好在中點上算過了中點
  assert.equal(dropSlot(mids, 69), 1);
  assert.equal(dropSlot(mids, 71), 2);
  assert.equal(dropSlot(mids, 121), 3);
  assert.equal(dropSlot(mids, 9999), 3);
  assert.equal(dropSlot([], 10), 0);
});

test("落點換成目標索引：自己前後的落點都是原位", () => {
  assert.equal(slotToIndex(1, 1), 1); // 自己上方的縫
  assert.equal(slotToIndex(1, 2), 1); // 自己下方的縫
  assert.equal(slotToIndex(1, 0), 0);
  assert.equal(slotToIndex(1, 3), 2);
  assert.equal(slotToIndex(0, 3), 2);
  assert.equal(slotToIndex(2, 0), 0);
});

test("spec「Drop a tool」：看我摸牌拖到看我戀愛上面", () => {
  const list = ["看我戀愛", "看我笑話現場投票", "看我摸牌"];
  const from = 2;
  const to = slotToIndex(from, dropSlot(mids, 5));
  assert.deepEqual(moveItem(list, from, to), ["看我摸牌", "看我戀愛", "看我笑話現場投票"]);
});

test("陣列搬移：往前、往後、原位與超出範圍都不改原陣列", () => {
  const list = ["a", "b", "c", "d"];
  assert.deepEqual(moveItem(list, 0, 2), ["b", "c", "a", "d"]);
  assert.deepEqual(moveItem(list, 3, 0), ["d", "a", "b", "c"]);
  assert.deepEqual(moveItem(list, 1, 1), list);
  assert.deepEqual(moveItem(list, -1, 2), list);
  assert.deepEqual(moveItem(list, 1, 4), list);
  assert.deepEqual(list, ["a", "b", "c", "d"]);
});

test("依 id 重排：照 ids 順序，沒列到的接在後面", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  assert.deepEqual(applyOrder(items, ["c", "a", "b", "d"]).map((x) => x.id), ["c", "a", "b", "d"]);
  assert.deepEqual(applyOrder(items, ["d", "b"]).map((x) => x.id), ["d", "b", "a", "c"]);
  assert.deepEqual(applyOrder(items, ["x", "c"]).map((x) => x.id), ["c", "a", "b", "d"]);
});
