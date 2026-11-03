import { requirePage } from "@/lib/auth/current";
import { listShows, pickableShows, seriesOf, toPickerData } from "@/lib/shows";
import { listTransactions } from "@/lib/finance/data";
import { listPendingLines, listSkippedLines } from "@/lib/finance/oen";
import { groupInbox } from "@/lib/finance/inbox";
import { inferParticipants, SOURCE_LABEL } from "@/lib/finance/participants";
import { INCOME_CATEGORIES, MANUAL_EXPENSE_CATEGORIES, MEMBERS } from "@/lib/finance/calc";
import { nextProcessingLabel, OEN_LEDGER_DAY } from "@/lib/finance/schedule";
import { todayInTaipei } from "@/lib/dates";
import { displayName } from "@/lib/auth/users";
import FinanceHead from "@/components/finance-head";
import OenInbox from "@/components/oen-inbox";
import QuickEntry from "@/components/quick-entry";

// 待確認（取代手動 CSV 匯入）：oen_charge_lines 尚未連到 transactions 的列，依演出分組；核准／改派／略過。下方是非 Oen 項目的快速輸入。
export default async function InboxPage() {
  const me = await requirePage("finance", "/finance/inbox");
  const actor = `user:${me.id}` as const;
  const [pending, skipped, shows, txs] = await Promise.all([listPendingLines(actor), listSkippedLines(actor, 50), listShows(actor), listTransactions(actor)]);
  const today = todayInTaipei();
  const byShow = new Map<string, typeof txs>();
  for (const t of txs) byShow.set(t.showId, [...(byShow.get(t.showId) ?? []), t]);
  const order = new Map(shows.map((s, i) => [s.id, i]));
  const groups = groupInbox(pending, byShow, (id) => order.get(id) ?? 9999);
  const showInfo = (id: string) => {
    const s = shows.find((x) => x.id === id);
    if (!s) return null;
    const p = inferParticipants(s, byShow.get(id) ?? []);
    return { id: s.id, name: s.name, series: s.kind === "performance" ? seriesOf(s) : null, performanceDate: s.performanceDate, included: p.included, sourceLabel: SOURCE_LABEL[p.source], needsReview: p.needsReview };
  };
  const picker = toPickerData(pickableShows(shows, today));
  const financeShows = shows.map((s) => ({ id: s.id, name: s.name, performanceDate: s.performanceDate, kind: s.kind }));

  return (
    <main className="page">
      <FinanceHead
        me={me}
        active="inbox"
        title="待確認"
        sub={`每月 ${OEN_LEDGER_DAY} 號 Oen 金流自動進明細；${nextProcessingLabel({ kind: "oen_pending" }, today)}`}
        pendingCount={pending.length}
      />
      <div className="content">
        <OenInbox
          groups={groups.map((g) => ({
            showId: g.showId,
            show: g.showId ? showInfo(g.showId) : null,
            totals: g.totals, unpaid: g.unpaid, noCashflow: g.noCashflow, guessed: g.guessed, nonSuccess: g.nonSuccess,
            existingBoxOffice: g.existingBoxOffice, existingBoxOfficeRows: g.existingBoxOfficeRows,
            lines: g.lines.map((l) => ({
              id: l.id, itemText: l.itemText, lineType: l.lineType, qty: l.qty, txCategory: l.txCategory, gross: l.gross, fee: l.fee, refund: l.refund, net: l.net,
              reconBatch: l.reconBatch, mapConfidence: l.mapConfidence, mapNote: l.mapNote,
              chargeNo: l.charge.chargeNo, paidAt: l.charge.paidAt, status: l.charge.status, payoutStatus: l.charge.payoutStatus, chargeType: l.charge.chargeType, eventName: l.charge.eventName,
            })),
          }))}
          skipped={skipped.map((l) => ({ id: l.id, chargeNo: l.charge.chargeNo, itemText: l.itemText, net: l.net, note: l.bookingNote, showName: shows.find((s) => s.id === l.showId)?.name ?? null }))}
          shows={financeShows}
          members={MEMBERS}
          incomeCategories={INCOME_CATEGORIES}
          today={today}
        />
        <section id="quick">
          <div className="section"><h2>新增非 Oen 項目</h2><span>場地、剪輯、工作人員、贊助、ACCUPASS…</span></div>
          <QuickEntry shows={financeShows} picker={picker} members={MEMBERS} incomeCategories={INCOME_CATEGORIES} expenseCategories={MANUAL_EXPENSE_CATEGORIES} me={displayName(me)} today={today} />
        </section>
      </div>
    </main>
  );
}
