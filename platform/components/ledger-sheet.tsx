"use client";
// 財務分析頁的「新增結算」「新增代墊還款」面板。
import { useState, useTransition } from "react";
import { addRepayment, addSettlement, type ActionResult } from "@/app/(app)/finance/actions";

export default function LedgerButtons({ members, today }: { members: readonly string[]; today: string }) {
  const [open, setOpen] = useState<"settlement" | "repayment" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const title = open === "settlement" ? "新增結算（利潤分配，已收款）" : "新增代墊還款";

  return (
    <>
      {msg ? <div className="notice" role="status">{msg.text}</div> : null}
      <div className="actions" style={{ marginBottom: 12 }}>
        <button className="btn btn-primary" type="button" onClick={() => setOpen("settlement")}>新增結算</button>
        <button className="btn btn-ghost" type="button" onClick={() => setOpen("repayment")}>新增代墊還款</button>
      </div>
      {open ? (
        <div className="sheet-backdrop" onClick={() => setOpen(null)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="ledger-title" onClick={(e) => e.stopPropagation()}>
            <h2 id="ledger-title">{title}</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const which = open;
                start(async () => {
                  let r: ActionResult;
                  try {
                    r = which === "settlement" ? await addSettlement(fd) : await addRepayment(fd);
                  } catch {
                    r = { ok: false, error: "沒有存成功，請再試一次" };
                  }
                  if (r.ok) {
                    setOpen(null);
                    setMsg({ ok: true, text: which === "settlement" ? "已新增結算" : "已新增代墊還款" });
                  } else {
                    setMsg({ ok: false, text: r.error });
                  }
                });
              }}
            >
              <label className="field">
                <span>成員</span>
                <select className="select" name="member" required defaultValue="">
                  <option value="" disabled>選擇成員</option>
                  {members.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </label>
              <label className="field">
                <span>{open === "settlement" ? "金額（利潤；沖回錯誤結算可填負數，並寫備註）" : "還款金額"}</span>
                <input className="input" name="amount" type="number" inputMode="decimal" min={open === "settlement" ? undefined : "1"} step="any" required />
              </label>
              <label className="field"><span>日期</span><input className="input" name="date" type="date" required defaultValue={today} /></label>
              <label className="field"><span>備註（選填）</span><input className="input" name="notes" maxLength={100} placeholder={open === "settlement" ? "例：10 月結算" : "例：10 月還款"} /></label>
              <div className="actions">
                <button className="btn btn-primary" type="submit" disabled={pending}>{pending ? "儲存中…" : "新增"}</button>
                <button className="btn btn-ghost" type="button" onClick={() => setOpen(null)}>取消</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
