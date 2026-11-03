import { test } from "node:test";
import assert from "node:assert/strict";
import { membershipByMonth, planOf, taipeiMonth } from "./members.ts";

const line = (paidAt: string, amount: number, status = "已入帳") => ({ paidAt, status, amount });

test("金額分方案：149 月繳、1699 年繳、其他", () => {
  assert.equal(planOf(149), "monthly");
  assert.equal(planOf(1699), "annual");
  assert.equal(planOf(100), "other");
});

test("台北月份：UTC 月底晚上在台北已是下個月", () => {
  assert.equal(taipeiMonth("2026-02-28T20:00:00Z"), "2026-03");
  assert.equal(taipeiMonth("2026-02-28T10:00:00Z"), "2026-02");
});

test("月訂閱 = 當月成功扣款數；年訂閱有效 = 12 個月內；失敗／退款不計；只算到 toMonth", () => {
  const lines = [
    line("2026-02-10T02:00:00Z", 149), line("2026-02-10T02:00:00Z", 149), line("2026-02-10T02:00:00Z", 1699),
    line("2026-03-10T02:00:00Z", 149), line("2026-03-10T02:00:00Z", 149, "付款成功"), line("2026-03-10T02:00:00Z", 149, "已退款"),
    line("2026-03-15T02:00:00Z", 1699), line("2026-03-15T02:00:00Z", 100),
    line("2026-12-01T02:00:00Z", 149),
  ];
  const rows = membershipByMonth(lines, "2026-04");
  assert.deepEqual(rows, [
    { month: "2026-02", monthly: 2, annualNew: 1, annualActive: 1, other: 0 },
    { month: "2026-03", monthly: 2, annualNew: 1, annualActive: 2, other: 1 },
    { month: "2026-04", monthly: 0, annualNew: 0, annualActive: 2, other: 0 },
  ]);
  // 2027-02：2026-02 的年繳滿 12 個月失效（2026-03 ~ 2027-02 的視窗不含 2026-02）；2026-03 的仍有效
  const later = membershipByMonth(lines, "2027-02");
  assert.equal(later.at(-1)?.annualActive, 1);
  assert.equal(later.find((r) => r.month === "2027-01")?.annualActive, 2);
  assert.deepEqual(membershipByMonth([], "2026-04"), []);
  assert.deepEqual(membershipByMonth([line("2026-05-01T02:00:00Z", 149)], "2026-04"), []);
});
