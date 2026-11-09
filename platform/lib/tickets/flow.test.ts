import { test } from "node:test";
import assert from "node:assert/strict";
import { allowedActions, planTransition, titleError, type TicketAction, type TicketActor, type TicketState } from "./flow.ts";

const admin: TicketActor = { id: "U_jesse", role: "admin" };
const reporter: TicketActor = { id: "U_qiaoda", role: "member" };
const owner: TicketActor = { id: "U_bowen", role: "member" };
const other: TicketActor = { id: "U_guava", role: "member" };
const fin: TicketActor = { id: "U_fin", role: "finance_partner" };

const t = (status: TicketState["status"], ownerId: string | null = owner.id, reporterId = reporter.id): TicketState => ({ status, ownerId, reporterId });
const okOf = (s: TicketState, a: TicketAction, who: TicketActor, note = "原因") => planTransition(s, a, who, { note }).ok;

// spec「Ticket status transitions」動作表：每列 [狀態, 動作, 操作者, 預期]
const table: [TicketState, TicketAction, TicketActor, boolean, string][] = [
  [t("open", null), "claim", other, true, "member 認領沒人認領的票"],
  [t("open", null), "claim", admin, true, "admin 認領"],
  [t("open", null), "claim", fin, false, "財務夥伴不能認領"],
  [t("open", "U_x"), "claim", other, false, "已有人認領"],
  [t("in_progress"), "claim", other, false, "非 open 不能認領"],
  [t("in_progress"), "unclaim", owner, true, "認領人取消認領"],
  [t("in_progress"), "unclaim", reporter, true, "回報人取消認領"],
  [t("in_progress"), "unclaim", admin, true, "admin 取消認領"],
  [t("in_progress"), "unclaim", other, false, "旁人不能取消認領"],
  [t("in_progress"), "deliver", owner, true, "認領人交付"],
  [t("in_progress"), "deliver", admin, true, "admin 交付"],
  [t("in_progress"), "deliver", reporter, false, "回報人不能交付"],
  [t("open", null), "deliver", owner, false, "spec 情境：open 不能交付"],
  [t("review"), "accept", reporter, true, "spec 情境：回報人驗收"],
  [t("review"), "accept", owner, false, "spec 情境：認領人不能驗收自己的票"],
  [t("review"), "accept", other, false, "旁人不能驗收"],
  [t("review", admin.id, admin.id), "accept", admin, true, "spec 情境：admin 驗收自己開又自己做的票"],
  [t("review", owner.id, owner.id), "accept", owner, false, "回報人自己做的票，本人不能驗收"],
  [t("review", owner.id, owner.id), "accept", admin, true, "回報人自己做的票由 admin 驗收"],
  [t("review"), "reject", reporter, true, "回報人退回"],
  [t("review"), "reject", owner, false, "認領人不能退回"],
  [t("in_progress"), "accept", reporter, false, "非 review 不能驗收"],
  [t("open", null), "wontfix", reporter, true, "回報人標不做"],
  [t("review"), "wontfix", admin, true, "admin 在 review 標不做"],
  [t("in_progress"), "wontfix", owner, false, "認領人不能標不做"],
  [t("done"), "wontfix", admin, false, "已完成不能標不做"],
  [t("wontfix"), "reopen", admin, true, "admin 重新開放"],
  [t("wontfix"), "reopen", reporter, false, "非 admin 不能重新開放"],
];

test("spec 動作表逐列", () => {
  for (const [state, action, who, expected, label] of table) {
    assert.equal(okOf(state, action, who), expected, label);
  }
});

test("認領：狀態轉處理中、認領人變自己、期望值是看到的狀態", () => {
  const p = planTransition(t("open", null), "claim", other);
  assert.deepEqual(p, {
    ok: true,
    expectStatus: "open",
    expectOwner: null,
    patch: { status: "in_progress", owner_id: other.id },
    event: { actor_id: other.id, action: "claim", note: "" },
  });
});

test("取消認領與重新開放會清空認領人", () => {
  const u = planTransition(t("in_progress"), "unclaim", owner);
  assert.ok(u.ok && u.patch.owner_id === null && u.patch.status === "open");
  const r = planTransition(t("wontfix"), "reopen", admin);
  assert.ok(r.ok && r.patch.owner_id === null && r.patch.status === "open");
});

test("不做保留認領人", () => {
  const p = planTransition(t("in_progress"), "wontfix", reporter, { note: "改用別的做法" });
  assert.ok(p.ok);
  assert.equal("owner_id" in p.patch, false);
});

test("spec 情境：退回與不做沒寫原因會被擋", () => {
  const r = planTransition(t("review"), "reject", reporter, { note: "  " });
  assert.deepEqual(r, { ok: false, reason: "退回要寫原因" });
  const w = planTransition(t("open", null), "wontfix", reporter, { note: "" });
  assert.deepEqual(w, { ok: false, reason: "標成不做要寫原因" });
  const ok = planTransition(t("review"), "reject", reporter, { note: "手機版按鈕跑版" });
  assert.ok(ok.ok && ok.event.note === "手機版按鈕跑版");
});

test("spec 情境：認領人驗收自己的票，原因講清楚", () => {
  const p = planTransition(t("review"), "accept", owner);
  assert.deepEqual(p, { ok: false, reason: "認領人不能驗收自己做的票，請回報人或管理員驗收" });
});

test("編輯：只限 open 且沒人認領，只改標題分類描述", () => {
  const edit = { title: " 新標題 ", category: "bug", description: "內容" };
  const p = planTransition(t("open", null), "edit", reporter, { edit });
  assert.ok(p.ok);
  assert.deepEqual(p.patch, { title: "新標題", category: "bug", description: "內容" });
  assert.equal(planTransition(t("in_progress"), "edit", reporter, { edit }).ok, false);
  assert.equal(planTransition(t("open", null), "edit", other, { edit }).ok, false);
  assert.equal(planTransition(t("open", null), "edit", reporter, { edit: { ...edit, category: "oops" } }).ok, false);
});

test("標題長度上下界：120 字可以、121 字不行、空白不行", () => {
  assert.equal(titleError("字".repeat(120)), null);
  assert.equal(titleError("字".repeat(121)), "標題最多 120 個字");
  assert.equal(titleError("   "), "請填標題");
});

test("allowedActions：旁人看 review 的票沒有驗收、退回按鈕", () => {
  assert.deepEqual(allowedActions(t("review"), other), []);
  assert.deepEqual(allowedActions(t("review"), reporter), ["accept", "reject", "wontfix"]);
  assert.deepEqual(allowedActions(t("open", null), fin), []);
});
