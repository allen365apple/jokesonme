import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { kickoffText } from "./kickoff.ts";

const ticket = { number: 9, title: "財務頁加匯出按鈕", category: "feature" as const, description: "現在怎樣：只能看不能匯出\n\n希望變成：可以下載 Excel" };
const text = kickoffText(ticket, "巧達");

test("spec 情境：開工指令包含票號、標題、規範、分支、PR 標題、交付位置與描述", () => {
  for (const s of ["T-9", "財務頁加匯出按鈕", "新功能", "巧達", "COLLABORATION.md", "feat/T-9-", "fix(T-9)", "/tickets?t=9", "不要自行合併", ticket.description]) {
    assert.ok(text.includes(s), `缺少：${s}`);
  }
});

test("spec 情境：規矩不抄進開工指令（只寫在 COLLABORATION.md）", () => {
  for (const rule of ["db:migrate", ".env.local", "SUPABASE_", "git add", "npm run test", "typecheck"]) {
    assert.ok(!text.includes(rule), `開工指令不該出現規矩字串：${rule}`);
  }
});

test("描述空白時提醒先問清楚", () => {
  assert.ok(kickoffText({ ...ticket, description: "  " }, "巧達").includes("回報人沒有寫描述"));
});

test("開工指令指向的 COLLABORATION.md 真的存在於 repo 根目錄", () => {
  assert.ok(existsSync(new URL("../../../COLLABORATION.md", import.meta.url)), "repo 根目錄缺 COLLABORATION.md");
});
