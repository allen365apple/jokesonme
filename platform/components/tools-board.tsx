"use client";
// 最後更新：2026-11-19 16:02
// 誰幫忙的：Claude Code（Claude Opus 5.5）
// 修改摘要：新增工具箱頁的互動層（三區卡片、新增／編輯表單、上下移、下架與復原）；卡片放進 .tool-grid（900px 以上兩欄）、編輯按鈕加上工具名稱；「新增工具」旁加「編輯」開關，按下才出現小 icon（編輯／上下移）、右上角下架叉叉與已下架清單
//
// 工具箱的互動層（spec tools-directory）。卡片本身是外連（新分頁開工具原本的網址），
// 管理按鈕放在卡片連結下方；送出後伺服器會再檢查權限與欄位，失敗原因用中文顯示。
// 只能 import type from @/lib/tools：那支檔案會連資料庫，不能進瀏覽器。
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { archiveTool, createTool, moveTool, restoreTool, updateTool, type ToolResult } from "@/app/(app)/tools/actions";
import type { Tool, ToolSection } from "@/lib/tools";
import { IconArrowDown, IconArrowUp, IconClose, IconEdit, IconPlus } from "@/components/icons";

const SECTIONS: { key: ToolSection; label: string }[] = [
  { key: "internal", label: "團隊內部工具" },
  { key: "live", label: "現場演出工具" },
  { key: "other", label: "其他" },
];
const SECTION_LABEL = Object.fromEntries(SECTIONS.map((s) => [s.key, s.label])) as Record<ToolSection, string>;

const ICON_STYLE = { fontSize: 26, lineHeight: "32px", width: 32, flex: "none", textAlign: "center" } as const;

export default function ToolsBoard({ tools }: { tools: Tool[] }) {
  const router = useRouter();
  const [form, setForm] = useState<{ tool?: Tool } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // 平常只看卡片；按「編輯」才出現每張卡的編輯／上下移／下架與「已下架」清單。
  const [editing, setEditing] = useState(false);

  const listed = tools.filter((t) => t.archivedAt === null);
  const archived = tools.filter((t) => t.archivedAt !== null);
  const bySection = (s: ToolSection) => listed.filter((t) => t.section === s).sort((a, b) => a.position - b.position);

  function act(fn: (fd: FormData) => Promise<ToolResult>, fields: Record<string, string>) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    setError(null);
    startTransition(async () => {
      const r = await fn(fd);
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  }

  return (
    <>
      <div className="actions" style={{ marginTop: 0, marginBottom: 12 }}>
        <button className="btn btn-primary" type="button" onClick={() => { setError(null); setForm({}); }}>
          <IconPlus />新增工具
        </button>
        <button className="btn btn-ghost" type="button" aria-pressed={editing} onClick={() => { setError(null); setEditing((v) => !v); }}>
          {editing ? "完成" : <><IconEdit />編輯</>}
        </button>
      </div>
      {error ? <div className="notice bad" role="alert">{error}</div> : null}

      {listed.length === 0 ? <p className="empty">目前沒有上架中的工具。按「新增工具」加第一個。</p> : null}

      {SECTIONS.map(({ key, label }) => {
        const list = bySection(key);
        if (!list.length) return null;
        return (
          <section key={key} aria-labelledby={`tools-${key}`}>
            <div className="section">
              <h2 id={`tools-${key}`}>{label}</h2>
              <span>{list.length} 個</span>
            </div>
            <div className="tool-grid">
              {list.map((t, i) => (
                <div key={t.id} className={editing ? "card tool-card editing" : "card tool-card"}>
                  <a className="row" href={t.url} target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "none" }}>
                    <span aria-hidden="true" style={ICON_STYLE}>{t.icon}</span>
                    <span className="row-main">
                      <span className="title">{t.name}</span>
                      {t.description ? <span className="meta">{t.description}</span> : null}
                    </span>
                  </a>
                  {editing ? (
                    <>
                      <div className="actions tool-actions">
                        <button className="tool-btn" type="button" disabled={pending} aria-label={`編輯「${t.name}」`} data-tip="編輯" onClick={() => { setError(null); setForm({ tool: t }); }}><IconEdit /></button>
                        <button className="tool-btn" type="button" disabled={pending || i === 0} aria-label={`把「${t.name}」往上移`} data-tip="往上移一格" onClick={() => act(moveTool, { id: t.id, dir: "up" })}><IconArrowUp /></button>
                        <button className="tool-btn" type="button" disabled={pending || i === list.length - 1} aria-label={`把「${t.name}」往下移`} data-tip="往下移一格" onClick={() => act(moveTool, { id: t.id, dir: "down" })}><IconArrowDown /></button>
                      </div>
                      <button className="tool-btn tool-close" type="button" disabled={pending} aria-label={`下架「${t.name}」`} data-tip="下架（可在「已下架」復原）" onClick={() => act(archiveTool, { id: t.id })}><IconClose /></button>
                    </>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        );
      })}

      {editing && archived.length ? (
        <details className="more-shows">
          <summary>已下架（{archived.length}）</summary>
          {archived.map((t) => (
            <div key={t.id} className="card row" style={{ alignItems: "center" }}>
              <span aria-hidden="true" style={ICON_STYLE}>{t.icon}</span>
              <span className="row-main">
                <span className="title">{t.name}</span>
                <span className="meta"><span>{SECTION_LABEL[t.section]}</span></span>
              </span>
              <button className="btn btn-ghost btn-sm" type="button" disabled={pending} aria-label={`復原「${t.name}」`} onClick={() => act(restoreTool, { id: t.id })}>復原</button>
            </div>
          ))}
        </details>
      ) : null}

      {form ? (
        <ToolForm
          key={form.tool?.id ?? "new"}
          tool={form.tool}
          onClose={() => setForm(null)}
          onDone={() => { setForm(null); router.refresh(); }}
        />
      ) : null}
    </>
  );
}

/** 新增（沒有 tool）或編輯（有 tool）。 */
function ToolForm({ tool, onClose, onDone }: { tool?: Tool; onClose: () => void; onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="tool-form-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="tool-form-title">{tool ? `編輯「${tool.name}」` : "新增工具"}</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            if (tool) f.set("id", tool.id);
            setError(null);
            startTransition(async () => {
              const r = tool ? await updateTool(f) : await createTool(f);
              if (!r.ok) setError(r.error);
              else onDone();
            });
          }}
        >
          <label className="field">
            <span>圖示（放一個 emoji）</span>
            <input className="input" name="icon" defaultValue={tool?.icon ?? ""} autoComplete="off" autoFocus={!tool} />
          </label>
          <label className="field">
            <span>名稱（最多 40 字）</span>
            <input className="input" name="name" defaultValue={tool?.name ?? ""} autoComplete="off" />
          </label>
          <label className="field">
            <span>一句話說明（最多 120 字，可以不填）</span>
            <textarea className="textarea" name="description" defaultValue={tool?.description ?? ""} rows={2} />
          </label>
          <label className="field">
            <span>網址（http:// 或 https:// 開頭）</span>
            <input className="input" name="url" type="text" inputMode="url" defaultValue={tool?.url ?? ""} placeholder="https://" autoComplete="off" autoCapitalize="off" spellCheck={false} />
          </label>
          <fieldset className="field" style={{ border: 0, padding: 0, margin: "0 0 14px" }}>
            <span>放在哪一區</span>
            <div className="picks">
              {SECTIONS.map((s) => (
                <label key={s.key} className="pick">
                  <input type="radio" name="section" value={s.key} defaultChecked={tool ? tool.section === s.key : s.key === "internal"} />
                  <span>{s.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {error ? <div className="notice bad" role="alert">{error}</div> : null}
          <div className="actions">
            <button className="btn btn-primary" type="submit" disabled={pending}>{tool ? "儲存" : "新增"}</button>
            <button className="btn btn-ghost" type="button" onClick={onClose}>取消</button>
          </div>
        </form>
      </div>
    </div>
  );
}
