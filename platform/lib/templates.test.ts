import { test } from "node:test";
import assert from "node:assert/strict";
import { planTemplateTodos, templateTodosAllowed } from "./templates.ts";

test("spec 範例：演出日 10/24 的截止日計算與預設負責人對應", () => {
  const items = [
    { id: "a", title: "確認卡司", offsetDays: -21, defaultAssignee: "傑哥", sortOrder: 1 },
    { id: "b", title: "前一天確認", offsetDays: -1, defaultAssignee: "大弋", sortOrder: 2 },
    { id: "c", title: "剪輯說明", offsetDays: 7, defaultAssignee: null, sortOrder: 3 },
  ];
  const plan = planTemplateTodos(items, "2026-10-24", new Map([["傑哥", "U_jesse"]]));
  assert.deepEqual(plan.map((p) => [p.dueDate, p.assigneeUserId]), [["2026-10-03", "U_jesse"], ["2026-10-23", null], ["2026-10-31", null]]);
});

test("已演出的場次不產生模板待辦（儲存過去的月號不會冒出過期待辦）", () => {
  const items = [{ id: "a", title: "確認卡司", offsetDays: -21, defaultAssignee: null, sortOrder: 1 }, { id: "c", title: "剪輯說明", offsetDays: 7, defaultAssignee: null, sortOrder: 3 }];
  assert.equal(templateTodosAllowed("2026-10-24", "2026-11-03"), false);
  assert.equal(templateTodosAllowed("2026-11-03", "2026-11-03"), true);
  assert.equal(templateTodosAllowed("2026-11-21", "2026-11-03"), true);
  assert.deepEqual(planTemplateTodos(items, "2026-10-24", new Map(), "2026-11-03"), []);
  assert.equal(planTemplateTodos(items, "2026-11-21", new Map(), "2026-11-03").length, 2);
  assert.equal(planTemplateTodos(items, "2026-10-24", new Map()).length, 2); // 沒給 today 維持舊行為（既有測試）
});
