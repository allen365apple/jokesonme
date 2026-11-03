"use client";
// 待確認佇列的互動：每演出一張卡（可展開逐列），核准整卡或勾選的列；改派演出／分類；略過；人工標為已入帳。
import { useState, useTransition } from "react";
import { approveInbox, markInboxHistorical, reassignInbox, skipInbox, unskipInbox, type ActionResult } from "@/app/(app)/finance/actions";
import { formatMonthDay, todayInTaipei } from "@/lib/dates";

export type InboxLineView = {
  id: number; itemText: string | null; lineType: string; qty: number; txCategory: string | null; gross: number; fee: number; refund: number; net: number;
  reconBatch: string | null; mapConfidence: string; mapNote: string | null;
  chargeNo: string; paidAt: string | null; status: string; payoutStatus: string; chargeType: string; eventName: string | null;
};
export type InboxShowView = { id: string; name: string; series: string | null; performanceDate: string | null; included: string[]; sourceLabel: string; needsReview: boolean };
export type InboxGroupView = {
  showId: string | null; show: InboxShowView | null; lines: InboxLineView[];
  totals: { lines: number; qty: number; gross: number; fee: number; refund: number; net: number };
  unpaid: number; noCashflow: number; guessed: number; nonSuccess: number; existingBoxOffice: number; existingBoxOfficeRows: number;
};
type ShowOpt = { id: string; name: string; performanceDate: string | null; kind: string };

const money = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(Math.round(n)).toLocaleString()}`;
const LINE_TYPE: Record<string, string> = { ticket: "票", membership: "會員", merch: "周邊", adjustment: "調整", other: "其他" };

export default function OenInbox(props: {
  groups: InboxGroupView[]; skipped: { id: number; chargeNo: string; itemText: string | null; net: number; note: string | null; showName: string | null }[];
  shows: ShowOpt[]; members: readonly string[]; incomeCategories: readonly string[]; today: string;
}) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult>, okText: string) => {
    setMsg(null);
    start(async () => {
      const r = await fn().catch((): ActionResult => ({ ok: false, error: "沒有處理成功，請再試一次" }));
      setMsg(r.ok ? { ok: true, text: okText } : { ok: false, text: r.error });
    });
  };
  const total = props.groups.reduce((s, g) => s + g.totals.lines, 0);

  return (
    <>
      {msg ? <div className={`notice${msg.ok ? "" : " bad"}`} role="status">{msg.text}</div> : null}
      {total === 0 ? <p className="empty">目前沒有待確認的 Oen 明細。下次 Oen 金流進明細後會出現在這裡。</p> : null}
      {props.groups.map((g) => (
        <InboxCard key={g.showId ?? "none"} g={g} shows={props.shows} members={props.members} incomeCategories={props.incomeCategories} run={run} pending={pending} />
      ))}
      {props.skipped.length ? (
        <details className="more-shows">
          <summary>已略過（{props.skipped.length}）</summary>
          {props.skipped.map((l) => (
            <div key={l.id} className="card inbox-line">
              <span className="row-main">
                <span className="title">{l.itemText || l.chargeNo}</span>
                <span className="meta"><span>Oen {l.chargeNo}</span>{l.showName ? <span>{l.showName}</span> : null}{l.note ? <span>{l.note}</span> : null}</span>
              </span>
              <span className="amount">{money(l.net)}</span>
              <button className="btn btn-ghost btn-sm" type="button" disabled={pending} onClick={() => { const fd = new FormData(); fd.append("line_id", String(l.id)); run(() => unskipInbox(fd), "已復原為待確認"); }}>復原</button>
            </div>
          ))}
        </details>
      ) : null}
    </>
  );
}

function InboxCard({ g, shows, members, incomeCategories, run, pending }: {
  g: InboxGroupView; shows: ShowOpt[]; members: readonly string[]; incomeCategories: readonly string[];
  run: (fn: () => Promise<ActionResult>, okText: string) => void; pending: boolean;
}) {
  const [open, setOpen] = useState(!g.showId || g.lines.length <= 6);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [panel, setPanel] = useState<"reassign" | "skip" | "historical" | "approve" | null>(null);
  const chosen = selected.size ? [...selected] : g.lines.map((l) => l.id);
  const chosenLabel = selected.size ? `勾選的 ${selected.size} 筆` : `全部 ${g.lines.length} 筆`;
  const chosenNet = g.lines.filter((l) => chosen.includes(l.id)).reduce((s, l) => s + l.net, 0);
  const withIds = (fd: FormData) => { for (const id of chosen) fd.append("line_id", String(id)); return fd; };
  const toggle = (id: number) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const warnDup = g.existingBoxOfficeRows > 0 && (g.unpaid > 0 || g.noCashflow > 0);

  return (
    <section className="inbox-card">
      <div className="section">
        <h2>{g.show ? g.show.name : "對不到演出"}</h2>
        <span>{g.totals.lines} 列・{g.totals.qty} 張</span>
      </div>
      <div className="inbox-sum">
        <div><small>收取</small><b>{money(g.totals.gross)}</b></div>
        <div><small>手續費</small><b>{money(-g.totals.fee)}</b></div>
        <div><small>退款</small><b>{money(-g.totals.refund)}</b></div>
        <div><small>淨額</small><b>{money(g.totals.net)}</b></div>
      </div>
      <div className="meta inbox-flags">
        {g.show ? <span>參與成員：<b>{g.show.included.length === members.length ? "全員" : g.show.included.join("、")}</b>（{g.show.sourceLabel}）</span> : <span>請先改派到正確的演出</span>}
        {g.show?.needsReview ? <span className="badge unsettled">專場尚未設定參與成員</span> : null}
        {g.unpaid ? <span className="badge partial">未撥款 {g.unpaid}</span> : null}
        {g.noCashflow ? <span className="badge partial">無金流 {g.noCashflow}</span> : null}
        {g.guessed ? <span className="badge partial">推測對應 {g.guessed}</span> : null}
        {g.nonSuccess ? <span className="badge unsettled">狀態非成功 {g.nonSuccess}</span> : null}
      </div>
      {warnDup ? (
        <div className="notice">
          這場帳上已有 {g.existingBoxOfficeRows} 筆票房／周邊／會員列，合計 <b>{money(g.existingBoxOffice)}</b>；這裡待確認淨額 <b>{money(g.totals.net)}</b>。
          未撥款與無金流列是否早已入帳尚待 Jesse 確認，核准前請先比對，避免重複。
        </div>
      ) : null}
      <button className="btn btn-ghost btn-sm" type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}>{open ? "收起逐列" : `展開逐列（${g.lines.length}）`}</button>
      {open ? (
        <div className="inbox-lines">
          {g.lines.map((l) => (
            <label key={l.id} className="inbox-line">
              <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggle(l.id)} aria-label={`選取 ${l.chargeNo}`} />
              <span className="row-main">
                <span className="title">{l.itemText || l.eventName || l.chargeType}</span>
                <span className="meta">
                  <span className="tag">{LINE_TYPE[l.lineType] ?? l.lineType}{l.qty > 1 ? ` ×${l.qty}` : ""}</span>
                  {l.txCategory ? <span className="tag">{l.txCategory}</span> : <span className="badge unsettled">未分類</span>}
                  <span>Oen {l.chargeNo}</span>
                  <span>{l.paidAt ? formatMonthDay(todayInTaipei(new Date(l.paidAt))) : "未付款"}</span>
                  <span>{l.status}・{l.payoutStatus}{l.reconBatch ? `（批次 ${l.reconBatch.slice(5).replace("-", "/")}）` : ""}</span>
                  {l.mapConfidence !== "確定" ? <span className="badge partial">{l.mapConfidence}</span> : null}
                  {l.fee ? <span>手續費 {money(-l.fee)}</span> : null}
                  {l.refund ? <span>退款 {money(-l.refund)}</span> : null}
                </span>
              </span>
              <span className={`amount ${l.net >= 0 ? "pos" : "neg"}`}>{money(l.net)}</span>
            </label>
          ))}
        </div>
      ) : null}
      <div className="actions">
        {g.show ? <button className="btn btn-primary btn-sm" type="button" disabled={pending} onClick={() => setPanel("approve")}>核准{selected.size ? `勾選的 ${selected.size} 筆` : "整卡"}</button> : null}
        <button className="btn btn-ghost btn-sm" type="button" disabled={pending} onClick={() => setPanel("reassign")}>改指派演出</button>
        <button className="btn btn-ghost btn-sm" type="button" disabled={pending} onClick={() => setPanel("skip")}>略過</button>
        <button className="btn btn-ghost btn-sm" type="button" disabled={pending} onClick={() => setPanel("historical")}>標為早已入帳</button>
      </div>

      {panel ? (
        <div className="sheet-backdrop" onClick={() => setPanel(null)}>
          <div className="sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            {panel === "approve" && g.show ? (
              <form onSubmit={(e) => { e.preventDefault(); const fd = withIds(new FormData(e.currentTarget)); setPanel(null); run(() => approveInbox(fd), "已核准並寫入收支，稅務預留已重算"); }}>
                <h2>核准{chosenLabel}・{g.show.name}</h2>
                <p className="meta" style={{ marginBottom: 12 }}>會依每列建立票房／會員／周邊收入、平台手續費與退款列（Oen 來源鍵防重複），淨額 {money(chosenNet)}。日期用撥款批次日，未撥款用付款日。</p>
                <fieldset className="field" style={{ border: 0, padding: 0, margin: "0 0 14px" }}>
                  <span>票房／周邊／退款分給誰（平台手續費一律 8 人分）</span>
                  <div className="picks">
                    {members.map((m) => (
                      <label key={m} className="pick"><input type="checkbox" name="included" value={m} defaultChecked={g.show!.included.includes(m)} /><span>{m}</span></label>
                    ))}
                  </div>
                </fieldset>
                <div className="actions">
                  <button className="btn btn-primary" type="submit" disabled={pending}>核准並寫入</button>
                  <button className="btn btn-ghost" type="button" onClick={() => setPanel(null)}>取消</button>
                </div>
              </form>
            ) : null}
            {panel === "reassign" ? (
              <form onSubmit={(e) => { e.preventDefault(); const fd = withIds(new FormData(e.currentTarget)); setPanel(null); run(() => reassignInbox(fd), "已改派"); }}>
                <h2>改指派{chosenLabel}</h2>
                <label className="field">
                  <span>演出／專案</span>
                  <select className="select" name="show_id" required defaultValue={g.showId ?? ""}>
                    <option value="" disabled>選擇演出</option>
                    {shows.map((s) => <option key={s.id} value={s.id}>{s.performanceDate ? `${s.performanceDate.slice(5).replace("-", "/")}・` : ""}{s.name}{s.kind !== "performance" ? "（科目）" : ""}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span>分類（不改就留空）</span>
                  <select className="select" name="category" defaultValue="">
                    <option value="">維持原分類</option>
                    {incomeCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <div className="actions">
                  <button className="btn btn-primary" type="submit" disabled={pending}>改派</button>
                  <button className="btn btn-ghost" type="button" onClick={() => setPanel(null)}>取消</button>
                </div>
              </form>
            ) : null}
            {panel === "skip" ? (
              <form onSubmit={(e) => { e.preventDefault(); const fd = withIds(new FormData(e.currentTarget)); setPanel(null); run(() => skipInbox(fd), "已略過（可在「已略過」復原）"); }}>
                <h2>略過{chosenLabel}</h2>
                <label className="field"><span>原因（選填）</span><input className="input" name="reason" maxLength={200} placeholder="例：測試訂單、已手動登記" /></label>
                <div className="actions">
                  <button className="btn btn-primary" type="submit" disabled={pending}>略過</button>
                  <button className="btn btn-ghost" type="button" onClick={() => setPanel(null)}>取消</button>
                </div>
              </form>
            ) : null}
            {panel === "historical" ? (
              <form onSubmit={(e) => { e.preventDefault(); const fd = withIds(new FormData(e.currentTarget)); setPanel(null); run(() => markInboxHistorical(fd), "已標為早已入帳，不會建立收支"); }}>
                <h2>標為早已入帳・{chosenLabel}</h2>
                <p className="meta" style={{ marginBottom: 12 }}>只有在確認帳上已經有這些金額（例如舊匯入）時才用；不會建立任何收支列。</p>
                <label className="field"><span>說明（選填）</span><input className="input" name="note" maxLength={200} placeholder="例：11/3 Jesse 確認 10 月已入帳" /></label>
                <div className="actions">
                  <button className="btn btn-primary" type="submit" disabled={pending}>標為早已入帳</button>
                  <button className="btn btn-ghost" type="button" onClick={() => setPanel(null)}>取消</button>
                </div>
              </form>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
