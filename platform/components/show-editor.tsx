"use client";
// 演出頁的互動：編輯演出資訊（演出文件連結 2026-10-22 拿掉，spec show-planning-page REMOVED「Show document links」）。
import { useState, useTransition } from "react";
import { updateShow } from "@/app/(app)/shows/actions";
import { IconEdit } from "@/components/icons";
import { SHOW_SERIES } from "@/lib/shows";

export function ShowInfoButton({ show }: { show: { id: string; name: string; type: string; series: string | null; performanceDate: string | null; status: string } }) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <button className="icon-btn" type="button" onClick={() => setOpen(true)} aria-label="編輯演出資訊" title="編輯演出資訊"><IconEdit /></button>
      {open ? (
        <div className="sheet-backdrop" onClick={() => setOpen(false)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="show-edit" onClick={(e) => e.stopPropagation()}>
            <h2 id="show-edit">編輯演出資訊</h2>
            {err ? <div className="notice" role="alert">{err}</div> : null}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                start(async () => {
                  const r = await updateShow(fd).catch(() => ({ ok: false, error: "儲存失敗，請再試一次" }));
                  if (r.ok) setOpen(false);
                  else setErr(r.error ?? "儲存失敗");
                });
              }}
            >
              <input type="hidden" name="id" value={show.id} />
              <label className="field"><span>演出名稱</span><input className="input" name="name" required maxLength={100} defaultValue={show.name} /></label>
              <label className="field">
                <span>類型</span>
                <select className="select" name="type" defaultValue={show.type}>
                  <option value="monthly">月號</option>
                  <option value="special">專場</option>
                  <option value="other">其他</option>
                </select>
              </label>
              <label className="field">
                <span>類別（財務列表的分類與篩選）</span>
                <select className="select" name="series" defaultValue={show.series ?? ""} required>
                  <option value="" disabled>選擇類別</option>
                  {SHOW_SERIES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label className="field"><span>演出日期（月號必填；多場次填最晚一場）</span><input className="input" type="date" name="performance_date" defaultValue={show.performanceDate ?? ""} /></label>
              <label className="check-line">
                <input type="checkbox" name="archived" value="1" defaultChecked={show.status === "archived"} />
                已演出，歸檔（不再出現在「接下來」與下一場捷徑；財務頁仍看得到）
              </label>
              <div className="actions">
                <button className="btn btn-primary" type="submit" disabled={pending}>{pending ? "儲存中…" : "儲存"}</button>
                <button className="btn btn-ghost" type="button" onClick={() => setOpen(false)}>取消</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
