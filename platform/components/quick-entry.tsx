"use client";
// 非 Oen 項目的快速輸入：選一個來源快捷鍵就帶好分類與欄位；ACCUPASS 可填結算編號防重複。走 quickEntry → finance_save_transaction / finance_import_transactions。
import { useState, useTransition } from "react";
import { quickEntry, type ActionResult } from "@/app/(app)/finance/actions";
import type { PickerData } from "@/lib/shows";

type Preset = { key: string; label: string; kind: "income" | "expense"; category: string; hint: string; amount?: number; accupass?: boolean };
const PRESETS: Preset[] = [
  { key: "venue", label: "場地", kind: "expense", category: "場地租借", hint: "場地租金，可填墊款人" },
  { key: "edit", label: "剪輯", kind: "expense", category: "剪輯製作", hint: "影片剪輯費" },
  { key: "staff", label: "工作人員／技術費", kind: "expense", category: "工作人員", hint: "月號技術費在演出隔天出款；8 人分" },
  { key: "sponsor", label: "品牌贊助", kind: "income", category: "品牌贊助", hint: "備註寫廠商" },
  { key: "accupass", label: "ACCUPASS", kind: "income", category: "演出票房", hint: "票房＋手續費兩列；填結算編號可防重複", accupass: true },
  { key: "other", label: "其他", kind: "expense", category: "行政雜支", hint: "任何分類" },
];

export default function QuickEntry(props: {
  shows: { id: string; name: string; performanceDate: string | null; kind: string }[]; picker: PickerData; members: readonly string[];
  incomeCategories: readonly string[]; expenseCategories: readonly string[]; me: string; today: string;
}) {
  const [preset, setPreset] = useState<Preset>(PRESETS[0]);
  const [kind, setKind] = useState<"income" | "expense">(PRESETS[0].kind);
  const [fund, setFund] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [formKey, setFormKey] = useState(0);
  const categories = kind === "income" ? props.incomeCategories : props.expenseCategories;
  const pick = (p: Preset) => { setPreset(p); setKind(p.kind); setFund(false); setFormKey((k) => k + 1); };
  const defaultShow = props.picker.next?.id ?? props.shows[0]?.id ?? "";

  return (
    <div className="quick-entry">
      <div className="filter-chips" role="group" aria-label="來源">
        {PRESETS.map((p) => <button key={p.key} type="button" className={preset.key === p.key ? "on" : ""} onClick={() => pick(p)}>{p.label}</button>)}
      </div>
      <p className="meta" style={{ marginBottom: 10 }}>{preset.hint}</p>
      {msg ? <div className={`notice${msg.ok ? "" : " bad"}`} role="status">{msg.text}</div> : null}
      <form
        key={formKey}
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          setMsg(null);
          start(async () => {
            const r = await quickEntry(fd).catch((): ActionResult => ({ ok: false, error: "沒有存成功，請再試一次" }));
            if (r.ok) { setMsg({ ok: true, text: "已登記" }); setFormKey((k) => k + 1); } else setMsg({ ok: false, text: r.error });
          });
        }}
      >
        <input type="hidden" name="kind" value={kind} />
        <div className="two-col tight">
          <label className="field">
            <span>專案</span>
            <select className="select" name="show_id" required defaultValue={defaultShow}>
              {props.shows.map((s) => <option key={s.id} value={s.id}>{s.performanceDate ? `${s.performanceDate.slice(5).replace("-", "/")}・` : ""}{s.name}{s.kind !== "performance" ? "（科目）" : ""}</option>)}
            </select>
          </label>
          <label className="field">
            <span>分類</span>
            <select className="select" name="category" defaultValue={preset.category} onChange={(e) => { const c = e.target.value; if (props.incomeCategories.includes(c)) setKind("income"); else setKind("expense"); }}>
              <optgroup label="支出">{props.expenseCategories.map((c) => <option key={c} value={c}>{c}</option>)}</optgroup>
              <optgroup label="收入">{props.incomeCategories.map((c) => <option key={c} value={c}>{c}</option>)}</optgroup>
            </select>
          </label>
          <label className="field">
            <span>{preset.accupass ? "票房金額" : "金額（不用加正負號）"}</span>
            <input className="input" name="amount" type="number" inputMode="decimal" min="1" step="any" required defaultValue={preset.amount ?? ""} />
          </label>
          {preset.accupass ? (
            <>
              <label className="field"><span>ACCUPASS 手續費（選填）</span><input className="input" name="fee" type="number" inputMode="decimal" min="0" step="any" /></label>
              <label className="field"><span>ACCUPASS 結算編號（填了就防重複）</span><input className="input" name="accupass_key" maxLength={120} pattern="[\w#:.\-]{1,120}" placeholder="例：2026-11-A001" /></label>
            </>
          ) : null}
          <label className="field"><span>日期</span><input className="input" name="date" type="date" required defaultValue={props.today} /></label>
          <label className="field"><span>備註</span><input className="input" name="notes" maxLength={200} placeholder={preset.key === "sponsor" ? "廠商名稱" : ""} /></label>
        </div>
        {kind === "expense" && !preset.accupass ? (
          <label className="check-line"><input type="checkbox" name="paid_by_fund" value="1" checked={fund} onChange={(e) => setFund(e.target.checked)} />由共同基金支付</label>
        ) : null}
        {kind === "expense" && !fund && !preset.accupass ? (
          <label className="field">
            <span>墊款人（沒有人墊就留空）</span>
            <select className="select" name="advanced_by" defaultValue="">
              <option value="">沒有人墊款</option>
              {props.members.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
        ) : null}
        {!fund ? (
          <fieldset className="field" style={{ border: 0, padding: 0, margin: "0 0 14px" }}>
            <span>分配給（取消勾選 = 這筆不算他的）</span>
            <div className="picks">
              {props.members.map((m) => <label key={m} className="pick"><input type="checkbox" name="included" value={m} defaultChecked /><span>{m}</span></label>)}
            </div>
          </fieldset>
        ) : null}
        <input type="hidden" name="recorded_by" value={props.me} />
        <div className="actions">
          <button className="btn btn-primary" type="submit" disabled={pending}>{pending ? "登記中…" : "登記"}</button>
          <span className="toolbar-note">{categories.includes(preset.category) ? "" : ""}登記人：{props.me}</span>
        </div>
      </form>
    </div>
  );
}
