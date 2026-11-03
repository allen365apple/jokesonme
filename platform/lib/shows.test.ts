import { test } from "node:test";
import assert from "node:assert/strict";
import { guessSeries, pickableShows, type Show } from "./shows.ts";

const s = (name: string, date: string | null, o: Partial<Show> = {}): Show => ({
  id: name, name, type: "other", kind: "performance", series: null, performanceDate: date, status: "active", defaultExcludedMembers: null, ...o,
});
const names = (l: Show[]) => l.map((x) => x.name);

test("spec 情境：混合清單", () => {
  const p = pickableShows([s("10 月號", "2026-10-24"), s("11 月號", "2026-11-21"), s("9 月號", "2026-09-26"), s("《直球》", null), s("看我笑話會員", null, { kind: "ledger" })], "2026-10-03");
  assert.equal(p.next?.name, "10 月號");
  assert.deepEqual(names(p.upcoming), ["10 月號", "11 月號"]);
  assert.deepEqual(names(p.more), ["9 月號", "《直球》"]);
});

test("形狀一：全部沒日期 → 沒有 next，more 依名稱", () => {
  const p = pickableShows([s("乙", null), s("甲", null)], "2026-10-03");
  assert.equal(p.next, null);
  assert.deepEqual(p.upcoming, []);
  assert.deepEqual(names(p.more), [...["乙", "甲"].sort((a, b) => a.localeCompare(b, "zh-Hant"))]);
});

test("形狀二：已歸檔的進 more，依日期降冪", () => {
  const p = pickableShows([s("10/24", "2026-10-24"), s("11/21", "2026-11-21"), s("9/26", "2026-09-26"), s("8/22", "2026-08-22", { status: "archived" }), s("12/19 歸檔", "2026-12-19", { status: "archived" })], "2026-10-03");
  assert.equal(p.next?.name, "10/24");
  assert.deepEqual(names(p.upcoming), ["10/24", "11/21"]);
  assert.deepEqual(names(p.more), ["12/19 歸檔", "9/26", "8/22"]);
});

test("形狀三：只有 ledger → 全空", () => {
  assert.deepEqual(pickableShows([s("共同基金支出", null, { kind: "ledger" })], "2026-10-03"), { next: null, upcoming: [], more: [] });
});

test("當天演出仍算 next", () => {
  assert.equal(pickableShows([s("今天", "2026-10-03")], "2026-10-03").next?.name, "今天");
});

test("類別推測（只給畫面用）：現代問題維修中心、專場、其餘看我笑話", () => {
  assert.equal(guessSeries({ name: "現代問題維修中心｜11 月號", type: "other" }), "現代問題維修中心");
  assert.equal(guessSeries({ name: "2026 又兔了喜劇專場", type: "other" }), "專場");
  assert.equal(guessSeries({ name: "《直球》", type: "special" }), "專場");
  assert.equal(guessSeries({ name: "看我笑話｜第 2 季 11 月號", type: "monthly" }), "看我笑話");
});
