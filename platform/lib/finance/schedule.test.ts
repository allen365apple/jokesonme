import { test } from "node:test";
import assert from "node:assert/strict";
import { daysUntil, financeSchedule, hasTechFee, nextMonthlyDate, nextProcessingLabel, nextTechFee } from "./schedule.ts";

test("每月 N 號：今天之前就跳下個月、今天剛好算今天、12 月跨年", () => {
  assert.equal(nextMonthlyDate("2026-11-03", 7), "2026-11-07");
  assert.equal(nextMonthlyDate("2026-11-07", 7), "2026-11-07");
  assert.equal(nextMonthlyDate("2026-11-08", 7), "2026-12-07");
  assert.equal(nextMonthlyDate("2026-12-11", 10), "2027-01-10");
  assert.equal(nextMonthlyDate("2026-02-28", 31), "2026-02-28"); // 防呆：超過月底取月底
});

test("剩餘天數", () => {
  assert.equal(daysUntil("2026-11-03", "2026-11-07"), 4);
  assert.equal(daysUntil("2026-11-03", "2026-11-03"), 0);
});

test("技術費只有看我笑話月號與 After Party；多場次取最晚一場的隔天", () => {
  const shows = [
    { name: "看我笑話｜第 2 季 11 月號", type: "monthly", series: "看我笑話", performanceDate: "2026-11-21" },
    { name: "看我笑話 After Party", type: "other", series: "看我笑話", performanceDate: "2026-11-14" },
    { name: "現代問題維修中心｜11 月號", type: "other", series: "現代問題維修中心", performanceDate: "2026-11-07" },
    { name: "2026 又兔了喜劇專場", type: "special", series: "專場", performanceDate: "2026-11-05" },
    { name: "看我笑話｜第 2 季 10 月號", type: "monthly", series: "看我笑話", performanceDate: "2026-10-24" },
    { name: "共同基金支出", type: "other", series: "看我笑話", performanceDate: null, kind: "ledger" },
  ];
  assert.equal(hasTechFee(shows[0]), true);
  assert.equal(hasTechFee(shows[1]), true);
  assert.equal(hasTechFee(shows[2]), false);
  assert.equal(hasTechFee(shows[3]), false);
  assert.equal(hasTechFee(shows[5]), false);
  assert.deepEqual(nextTechFee("2026-11-03", shows), { date: "2026-11-15", showName: "看我笑話 After Party" });
  // 10/24 月號的隔天是 10/25，已過 → 不算；今天剛好是出款日 → 算
  assert.deepEqual(nextTechFee("2026-10-25", shows), { date: "2026-10-25", showName: "看我笑話｜第 2 季 10 月號" });
  assert.equal(nextTechFee("2026-12-01", shows), null);
});

test("三顆 chip：日期與剩餘天數", () => {
  const s = financeSchedule("2026-11-03", [{ name: "看我笑話｜第 2 季 11 月號", type: "monthly", series: "看我笑話", performanceDate: "2026-11-21" }]);
  assert.deepEqual(s.map((e) => [e.key, e.date, e.days]), [["oen", "2026-11-07", 4], ["payout", "2026-11-10", 7], ["tech", "2026-11-22", 19]]);
  assert.equal(s[2].showName, "看我笑話｜第 2 季 11 月號");
  const none = financeSchedule("2026-11-03", []);
  assert.deepEqual([none[2].date, none[2].days], [null, null]);
});

test("列的狀態標籤", () => {
  const t = "2026-11-03";
  assert.equal(nextProcessingLabel({ kind: "oen_unpaid" }, t), "Oen 撥款後 11/7 入帳");
  assert.equal(nextProcessingLabel({ kind: "oen_pending" }, t), "確認後 11/10 計入分潤");
  assert.equal(nextProcessingLabel({ kind: "booked" }, t), "11/10 分潤");
  assert.equal(nextProcessingLabel({ kind: "member_unsettled", member: "柏文" }, t), "11/10 出款");
  assert.equal(nextProcessingLabel({ kind: "member_unsettled", member: "傑哥" }, t), "12/31 年底一次領");
  assert.equal(nextProcessingLabel({ kind: "tech_fee", performanceDate: "2026-11-21" }, t), "演出隔天 11/22 出款");
  assert.equal(nextProcessingLabel({ kind: "paid", date: "2026-10-10" }, t), "10/10 已付");
});
