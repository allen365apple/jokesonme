"use client";
// 財務總覽右下角的「＋」（change finance-overview-quick-add）：先選這筆記在哪個專案（演出或非演出科目），
// 再打開演出詳細頁同一個新增收支面板（TxSheet）。存檔走 saveTransaction，伺服器 revalidate 後總覽數字跟著更新。
import { useState, useTransition } from "react";
import { saveTransaction, type ActionResult } from "@/app/(app)/finance/actions";
import ShowPicker from "@/components/show-picker";
import { TxSheet } from "@/components/tx-board";
import { IconPlus } from "@/components/icons";
import type { PickerData } from "@/lib/shows";

type Target = { id: string; name: string };

export default function FinanceQuickAdd(props: {
  picker: PickerData; ledgers: Target[]; members: readonly string[];
  incomeCategories: readonly string[]; expenseCategories: readonly string[]; me: string; today: string;
}) {
  const [step, setStep] = useState<"pick" | Target | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const performances = [...(props.picker.next ? [props.picker.next] : []), ...props.picker.upcoming, ...props.picker.more];
  const choose = (id: string | null) => {
    const t = performances.find((s) => s.id === id) ?? props.ledgers.find((s) => s.id === id);
    if (t) setStep({ id: t.id, name: t.name });
  };

  return (
    <>
      {msg ? <div className="notice" role="status">{msg.text}</div> : null}
      <button className="fab" type="button" aria-label="新增收支" disabled={pending} onClick={() => { setMsg(null); setStep("pick"); }}><IconPlus /></button>

      {step === "pick" ? (
        <div className="sheet-backdrop" onClick={() => setStep(null)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="quick-add-title" onClick={(e) => e.stopPropagation()}>
            <h2 id="quick-add-title">新增收支・記在哪裡？</h2>
            <div className="section"><b>演出</b></div>
            <ShowPicker data={props.picker} value={null} onChange={choose} allowNone={false} />
            {props.ledgers.length ? (
              <>
                <div className="section" style={{ marginTop: 16 }}><b>非演出科目</b><span>會員、頻道、周邊、共同基金…</span></div>
                <div className="pick-chips">
                  {props.ledgers.map((l) => <button key={l.id} type="button" className="pick-chip" onClick={() => choose(l.id)}><span>{l.name}</span></button>)}
                </div>
              </>
            ) : null}
            <div className="actions" style={{ marginTop: 16 }}>
              <button className="btn btn-ghost" type="button" onClick={() => setStep(null)}>取消</button>
            </div>
          </div>
        </div>
      ) : null}

      {step && step !== "pick" ? (
        <TxSheet
          key={step.id}
          showId={step.id}
          showName={step.name}
          members={props.members}
          incomeCategories={props.incomeCategories}
          expenseCategories={props.expenseCategories}
          me={props.me}
          today={props.today}
          onBack={() => setStep("pick")}
          onClose={() => setStep(null)}
          onDelete={() => setStep(null)}
          onSave={(fd) => {
            const target = step;
            setStep(null);
            start(async () => {
              const r = await saveTransaction(fd).catch((): ActionResult => ({ ok: false, error: "剛剛的收支沒有存成功，請再按一次＋重新填寫" }));
              setMsg(r.ok ? { ok: true, text: `已新增到「${target.name}」` } : { ok: false, text: r.error });
            });
          }}
        />
      ) : null}
    </>
  );
}
