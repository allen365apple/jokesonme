"use client";
// 最後更新：2026-11-19 15:12
// 誰幫忙的：Claude Code（Claude Opus 5.5）
// 修改摘要：區塊改讀資料庫並可在編輯模式新增、改名、刪除；區塊與區塊內工具改用拖曳把手排序（含上下鍵），放開後畫面先更新、背景存整份順序，失敗還原；拿掉上移／下移按鈕；編輯時工具單欄、空區塊也顯示。
//
// 工具箱的互動層（spec tools-directory）。卡片本身是外連（新分頁開工具原本的網址），
// 管理按鈕放在卡片連結外面；送出後伺服器會再檢查權限與欄位，失敗原因用中文顯示。
// 排序：useOptimistic 先顯示新順序，server action 成功後伺服器資料接手；失敗時 transition 結束就自動回到原本順序。
// 只能 import type from @/lib/tools：那支檔案會連資料庫，不能進瀏覽器。
import { useRouter } from "next/navigation";
import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import {
  archiveTool, createSection, createTool, deleteSection, renameSection, reorderSections, reorderTools, restoreTool, updateTool,
  type ToolResult,
} from "@/app/(app)/tools/actions";
import type { Tool, ToolSection } from "@/lib/tools";
import { applyOrder } from "@/lib/reorder";
import { IconClose, IconEdit, IconGrip, IconPlus, IconTrash } from "@/components/icons";
import EmojiPicker from "@/components/emoji-picker";
import { useSortable } from "@/components/use-sortable";

const ICON_STYLE = { fontSize: 26, lineHeight: "32px", width: 32, flex: "none", textAlign: "center" } as const;

type Board = { sections: ToolSection[]; tools: Tool[] };
type OrderChange = { kind: "sections"; ids: string[] } | { kind: "tools"; sectionId: string; ids: string[] };

/** 樂觀更新：先照新順序顯示（區塊照 ids 排；區內工具的 position 改成 1..n）。 */
function applyChange(cur: Board, c: OrderChange): Board {
  if (c.kind === "sections") return { ...cur, sections: applyOrder(cur.sections, c.ids) };
  const rank = new Map(c.ids.map((id, i) => [id, i + 1]));
  return {
    ...cur,
    tools: cur.tools.map((t) =>
      t.sectionId === c.sectionId && t.archivedAt === null && rank.has(t.id) ? { ...t, position: rank.get(t.id)! } : t,
    ),
  };
}

function byPosition(a: Tool, b: Tool) {
  return a.position - b.position || (a.id < b.id ? -1 : 1);
}

export default function ToolsBoard({ sections, tools }: Board) {
  const router = useRouter();
  const [view, applyView] = useOptimistic<Board, OrderChange>({ sections, tools }, applyChange);
  const [form, setForm] = useState<{ tool?: Tool } | null>(null);
  const [sectionForm, setSectionForm] = useState<{ section?: ToolSection } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // 平常只看卡片；按「編輯」才出現拖曳把手、編輯／下架、區塊管理與「已下架」清單。
  const [editing, setEditing] = useState(false);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const announceTimer = useRef(0);

  useEffect(() => {
    if (error) noticeRef.current?.scrollIntoView({ block: "nearest" });
  }, [error]);
  useEffect(() => () => window.clearTimeout(announceTimer.current), []);

  /** polite live region：先清空再稍等一下才寫，焦點移回把手時的朗讀才不會蓋掉它。 */
  function announce(message: string) {
    const el = statusRef.current;
    if (!el) return;
    el.textContent = "";
    window.clearTimeout(announceTimer.current);
    announceTimer.current = window.setTimeout(() => {
      el.textContent = message;
    }, 500);
  }

  const listed = view.tools.filter((t) => t.archivedAt === null);
  const archived = view.tools.filter((t) => t.archivedAt !== null);
  const toolsOf = (sectionId: string) => listed.filter((t) => t.sectionId === sectionId).sort(byPosition);
  const sectionName = new Map(view.sections.map((s) => [s.id, s.name]));
  // 平常隱藏沒有工具的區塊；編輯時全部顯示（包括空的）。
  const shown = view.sections.filter((s) => editing || toolsOf(s.id).length > 0);

  function formData(fields: Record<string, string>) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    return fd;
  }

  function act(fn: (fd: FormData) => Promise<ToolResult>, fields: Record<string, string>) {
    setError(null);
    startTransition(async () => {
      const r = await fn(formData(fields));
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  }

  /** 排序：畫面立刻換成新順序，背景送整份順序；失敗時 transition 結束就回到原本順序並顯示原因。 */
  function saveOrder(fn: (fd: FormData) => Promise<ToolResult>, fields: Record<string, string>, change: OrderChange) {
    setError(null);
    startTransition(async () => {
      applyView(change);
      const r = await fn(formData(fields));
      if (!r.ok) setError(r.error);
    });
  }

  const sectionListRef = useRef<HTMLDivElement>(null);
  const sectionSort = useSortable({
    listRef: sectionListRef,
    ids: shown.map((s) => s.id),
    onReorder: (ids) => saveOrder(reorderSections, { ids: JSON.stringify(ids) }, { kind: "sections", ids }),
    announce,
  });

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
      {error ? <div ref={noticeRef} className="notice bad" role="alert">{error}</div> : null}
      <p ref={statusRef} className="visually-hidden" role="status" aria-live="polite" />

      {!editing && listed.length === 0 ? <p className="empty">目前沒有上架中的工具。按「新增工具」加第一個。</p> : null}

      <div ref={sectionListRef} className="tool-sections">
        {shown.map((s) => (
          <SectionBlock
            key={s.id}
            section={s}
            tools={toolsOf(s.id)}
            editing={editing}
            pending={pending}
            sort={sectionSort}
            announce={announce}
            onReorderTools={(ids) => saveOrder(reorderTools, { sectionId: s.id, ids: JSON.stringify(ids) }, { kind: "tools", sectionId: s.id, ids })}
            onEditTool={(t) => { setError(null); setForm({ tool: t }); }}
            onArchiveTool={(t) => act(archiveTool, { id: t.id })}
            onRename={() => { setError(null); setSectionForm({ section: s }); }}
            onDelete={() => act(deleteSection, { id: s.id })}
          />
        ))}
      </div>

      {editing ? (
        <div className="actions" style={{ marginTop: 0, marginBottom: 18 }}>
          <button className="btn btn-ghost" type="button" onClick={() => { setError(null); setSectionForm({}); }}>
            <IconPlus />新增區塊
          </button>
        </div>
      ) : null}

      {editing && archived.length ? (
        <details className="more-shows">
          <summary>已下架（{archived.length}）</summary>
          {archived.map((t) => (
            <div key={t.id} className="card row" style={{ alignItems: "center" }}>
              <span aria-hidden="true" style={ICON_STYLE}>{t.icon}</span>
              <span className="row-main">
                <span className="title">{t.name}</span>
                <span className="meta"><span>{sectionName.get(t.sectionId) ?? "原區塊已刪除，復原後放到第一個區塊"}</span></span>
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
          sections={view.sections}
          onClose={() => setForm(null)}
          onDone={() => { setForm(null); router.refresh(); }}
        />
      ) : null}

      {sectionForm ? (
        <SectionForm
          key={sectionForm.section?.id ?? "new"}
          section={sectionForm.section}
          onClose={() => setSectionForm(null)}
          onDone={() => { setSectionForm(null); router.refresh(); }}
        />
      ) : null}
    </>
  );
}

type Sortable = ReturnType<typeof useSortable>;

/** 一個區塊：標題列（編輯時有拖曳把手、改名、刪除）與區內工具（編輯時可拖曳排序）。 */
function SectionBlock({
  section, tools, editing, pending, sort, announce, onReorderTools, onEditTool, onArchiveTool, onRename, onDelete,
}: {
  section: ToolSection;
  tools: Tool[];
  editing: boolean;
  pending: boolean;
  sort: Sortable;
  announce: (message: string) => void;
  onReorderTools: (ids: string[]) => void;
  onEditTool: (t: Tool) => void;
  onArchiveTool: (t: Tool) => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const toolListRef = useRef<HTMLDivElement>(null);
  const toolSort = useSortable({ listRef: toolListRef, ids: tools.map((t) => t.id), onReorder: (ids) => onReorderTools(ids), announce });
  const headingId = `tools-${section.id}`;
  return (
    <section data-sort-id={section.id} aria-labelledby={headingId}>
      <div className="section">
        <div className="tool-section-title">
          {editing ? (
            <button className="tool-btn sort-handle" type="button" aria-label={`區塊「${section.name}」：拖曳或用上下鍵調整順序`} data-tip="拖曳或用上下鍵調整區塊順序"
              data-sort-handle={section.id} data-sort-label={section.name}
              onPointerDown={sort.onPointerDown} onPointerMove={sort.onPointerMove} onPointerUp={sort.onPointerUp}
              onPointerCancel={sort.onPointerCancel} onLostPointerCapture={sort.onPointerCancel} onKeyDown={sort.onKeyDown}>
              <IconGrip />
            </button>
          ) : null}
          <h2 id={headingId}>{section.name}</h2>
        </div>
        <span>
          {editing ? (
            <>
              <button className="tool-btn" type="button" disabled={pending} aria-label={`重新命名區塊「${section.name}」`} data-tip="重新命名" onClick={onRename}><IconEdit /></button>
              <button className="tool-btn" type="button" disabled={pending} aria-label={`刪除區塊「${section.name}」`} data-tip="刪除區塊（裡面要先沒有工具）" onClick={onDelete}><IconTrash /></button>
            </>
          ) : null}
          {tools.length} 個
        </span>
      </div>
      {editing && tools.length === 0 ? <p className="tool-empty">這個區塊還沒有工具。新增工具時選這一區，或把別區的工具編輯到這裡。</p> : null}
      <div ref={toolListRef} className={editing ? "tool-grid editing" : "tool-grid"}>
        {tools.map((t) => (
          <div key={t.id} data-sort-id={t.id} className={editing ? "card tool-card editing" : "card tool-card"}>
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
                  <button className="tool-btn sort-handle" type="button" aria-label={`「${t.name}」：拖曳或用上下鍵調整順序`} data-tip="拖曳或用上下鍵調整順序"
                    data-sort-handle={t.id} data-sort-label={t.name}
                    onPointerDown={toolSort.onPointerDown} onPointerMove={toolSort.onPointerMove} onPointerUp={toolSort.onPointerUp}
                    onPointerCancel={toolSort.onPointerCancel} onLostPointerCapture={toolSort.onPointerCancel} onKeyDown={toolSort.onKeyDown}>
                    <IconGrip />
                  </button>
                  <button className="tool-btn" type="button" disabled={pending} aria-label={`編輯「${t.name}」`} data-tip="編輯" onClick={() => onEditTool(t)}><IconEdit /></button>
                </div>
                <button className="tool-btn tool-close" type="button" disabled={pending} aria-label={`下架「${t.name}」`} data-tip="下架（可在「已下架」復原）" onClick={() => onArchiveTool(t)}><IconClose /></button>
              </>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

/** 新增（沒有 tool）或編輯（有 tool）。區塊選項照目前的區塊順序。 */
function ToolForm({ tool, sections, onClose, onDone }: { tool?: Tool; sections: ToolSection[]; onClose: () => void; onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const current = tool && sections.some((s) => s.id === tool.sectionId) ? tool.sectionId : sections[0]?.id;
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
          <EmojiPicker name="icon" defaultValue={tool?.icon ?? ""} autoFocus={!tool} />
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
              {sections.map((s) => (
                <label key={s.id} className="pick">
                  <input type="radio" name="sectionId" value={s.id} defaultChecked={s.id === current} />
                  <span>{s.name}</span>
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

/** 新增區塊（沒有 section）或重新命名（有 section）。 */
function SectionForm({ section, onClose, onDone }: { section?: ToolSection; onClose: () => void; onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="section-form-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="section-form-title">{section ? `重新命名「${section.name}」` : "新增區塊"}</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            if (section) f.set("id", section.id);
            setError(null);
            startTransition(async () => {
              const r = section ? await renameSection(f) : await createSection(f);
              if (!r.ok) setError(r.error);
              else onDone();
            });
          }}
        >
          <label className="field">
            <span>區塊名稱（最多 20 字）</span>
            <input className="input" name="name" defaultValue={section?.name ?? ""} autoComplete="off" autoFocus />
          </label>
          {error ? <div className="notice bad" role="alert">{error}</div> : null}
          <div className="actions">
            <button className="btn btn-primary" type="submit" disabled={pending}>{section ? "儲存" : "新增"}</button>
            <button className="btn btn-ghost" type="button" onClick={onClose}>取消</button>
          </div>
        </form>
      </div>
    </div>
  );
}
