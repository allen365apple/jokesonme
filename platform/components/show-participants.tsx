"use client";
// 收支紀錄頁：這個專案「誰分票房」的設定（spec 業務規則：專場收支只由參與者分攤；平台手續費永遠 8 人分）。
import { useState, useTransition } from "react";
import { setShowParticipants, type ActionResult } from "@/app/(app)/finance/actions";

export default function ShowParticipants(props: {
  showId: string; showName: string; members: readonly string[];
  /** 目前設定（null = 未設定）與推測結果 */
  configured: string[] | null; inferred: { included: string[]; sourceLabel: string; needsReview: boolean };
  rowCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const current = props.configured ? props.members.filter((m) => !props.configured!.includes(m)) : props.inferred.included;
  const label = current.length === props.members.length ? "全員" : current.join("、");

  return (
    <>
      <div className="toolbar" style={{ flexWrap: "wrap" }}>
        <span className="toolbar-note">
          參與成員：<b>{label}</b>
          {props.configured ? null : <>（{props.inferred.sourceLabel}）</>}
          {!props.configured && props.inferred.needsReview ? <span className="badge unsettled" style={{ marginLeft: 6 }}>專場尚未設定，請確認</span> : null}
        </span>
        <button className="btn btn-ghost btn-sm" type="button" onClick={() => setOpen(true)}>設定參與成員</button>
      </div>
      {msg ? <div className="notice" role="status">{msg.text}</div> : null}
      {open ? (
        <div className="sheet-backdrop" onClick={() => setOpen(false)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="participants-title" onClick={(e) => e.stopPropagation()}>
            <h2 id="participants-title">參與成員・{props.showName}</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                start(async () => {
                  let r: ActionResult;
                  try {
                    r = await setShowParticipants(fd);
                  } catch {
                    r = { ok: false, error: "沒有存成功，請再試一次" };
                  }
                  if (r.ok) {
                    setOpen(false);
                    setMsg({ ok: true, text: "已更新參與成員，稅務預留已重算" });
                  } else {
                    setMsg({ ok: false, text: r.error });
                  }
                });
              }}
            >
              <input type="hidden" name="show_id" value={props.showId} />
              <fieldset className="field" style={{ border: 0, padding: 0, margin: "0 0 14px" }}>
                <span>這個專案的票房、周邊、退款分給誰（平台手續費一律 8 人分，不受影響）</span>
                <div className="picks">
                  {props.members.map((m) => (
                    <label key={m} className="pick">
                      <input type="checkbox" name="included" value={m} defaultChecked={current.includes(m)} />
                      <span>{m}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="check-line">
                <input type="checkbox" name="apply" value="1" defaultChecked />
                同時套用到這個專案現有的 {props.rowCount} 筆收支（之後匯入的也會用這個設定）
              </label>
              <div className="actions">
                <button className="btn btn-primary" type="submit" disabled={pending}>{pending ? "儲存中…" : "儲存"}</button>
                <button className="btn btn-ghost" type="button" onClick={() => setOpen(false)}>取消</button>
              </div>
            </form>
            {props.configured ? (
              <form
                style={{ marginTop: 16 }}
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  start(async () => {
                    const r = await setShowParticipants(fd).catch((): ActionResult => ({ ok: false, error: "沒有存成功，請再試一次" }));
                    if (r.ok) {
                      setOpen(false);
                      setMsg({ ok: true, text: "已清除設定，改回自動推測" });
                    } else setMsg({ ok: false, text: r.error });
                  });
                }}
              >
                <input type="hidden" name="show_id" value={props.showId} />
                <input type="hidden" name="clear" value="1" />
                <div className="actions"><button className="btn btn-danger" type="submit" disabled={pending}>清除設定（現有收支不變）</button></div>
              </form>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
