"use client";
// 開發頁的互動層（spec dev-tickets）：卡片列表、票頁（輪到誰、按鈕、描述、歷史、開工指令）、發布與編輯表單。
// 按鈕只顯示伺服器算好的 allowedActions；送出後伺服器會再判斷一次，失敗原因用中文顯示。
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { actOnTicket, createTicket, type TicketResult } from "@/app/(app)/tickets/actions";
import { ACTION_LABEL, CATEGORIES, CATEGORY_LABEL, DESCRIPTION_TEMPLATE, STATUS_LABEL, TITLE_MAX, type TicketAction } from "@/lib/tickets/flow";
import type { TicketEvent, TicketView } from "@/lib/tickets/data";
import { formatTaipeiDateTime } from "@/lib/dates";
import { IconPlus } from "@/components/icons";

type Detail = { ticket: TicketView; events: TicketEvent[]; actions: TicketAction[]; next: string; kickoff: string | null };

const NEEDS_NOTE: TicketAction[] = ["reject", "wontfix"];
const EVENT_LABEL: Record<TicketEvent["action"], string> = { create: "開票", ...ACTION_LABEL };
// 主要按鈕（柿子紅）：輪到這個人的那一步
const PRIMARY: TicketAction[] = ["claim", "deliver", "accept"];

function withT(listHref: string, n: number): string {
  return `${listHref}${listHref.includes("?") ? "&" : "?"}t=${n}`;
}

export default function TicketBoard(props: {
  tickets: TicketView[];
  names: Record<string, string>;
  detail: Detail | null;
  listHref: string;
  emptyText: string;
  initialNew: boolean;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(props.initialNew);
  const name = (id: string | null) => (id ? (props.names[id] ?? "成員") : "");

  return (
    <>
      {props.tickets.length === 0 ? (
        <p className="empty">{props.emptyText}</p>
      ) : (
        props.tickets.map((t) => (
          <Link key={t.id} className="card row tk-card" href={withT(props.listHref, t.number)} scroll={false}>
            <span className="row-main">
              <span className="title">
                <span className="tk-no">T-{t.number}</span> {t.title}
              </span>
              <span className="meta">
                <span className={`tag tk-status tk-${t.status}`}>{STATUS_LABEL[t.status]}</span>
                <span className="tag">{CATEGORY_LABEL[t.category]}</span>
                <span>{name(t.reporterId)} 開</span>
                {t.ownerId ? <span>{name(t.ownerId)} 做</span> : <span className="tag free">沒人認領</span>}
              </span>
            </span>
          </Link>
        ))
      )}

      <button className="fab" type="button" aria-label="開一張票" onClick={() => setCreating(true)}><IconPlus /></button>

      {creating ? (
        <TicketForm
          onClose={() => setCreating(false)}
          onDone={(n) => {
            setCreating(false);
            router.push(withT(props.listHref, n), { scroll: false });
          }}
        />
      ) : null}

      {props.detail ? (
        <TicketSheet
          detail={props.detail}
          name={name}
          onClose={() => router.push(props.listHref, { scroll: false })}
        />
      ) : null}
    </>
  );
}

/** 發布（沒有 ticket）或編輯（有 ticket）。 */
function TicketForm({ ticket, onClose, onDone }: { ticket?: TicketView; onClose: () => void; onDone: (n: number) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="tk-form-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="tk-form-title">{ticket ? `編輯 T-${ticket.number}` : "開一張票"}</h2>
        {error ? <div className="notice bad" role="alert">{error}</div> : null}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setError(null);
            startTransition(async () => {
              let r: TicketResult;
              if (ticket) {
                f.set("id", ticket.id);
                f.set("action", "edit");
                r = await actOnTicket(f);
              } else {
                r = await createTicket(f);
              }
              if (!r.ok) setError(r.error);
              else onDone(ticket ? ticket.number : (r.number ?? 0));
            });
          }}
        >
          <label className="field">
            <span>標題（最多 {TITLE_MAX} 字）</span>
            <input className="input" name="title" defaultValue={ticket?.title ?? ""} required maxLength={TITLE_MAX} autoFocus />
          </label>
          <fieldset className="field" style={{ border: 0, padding: 0, margin: "0 0 14px" }}>
            <span>分類</span>
            <div className="picks">
              {CATEGORIES.map((c) => (
                <label key={c} className="pick">
                  <input type="radio" name="category" value={c} defaultChecked={ticket ? ticket.category === c : c === "feature"} required />
                  <span>{CATEGORY_LABEL[c]}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="field">
            <span>描述（照四段寫，接手的人和 Claude 都會照這段做）</span>
            <textarea className="textarea tk-desc" name="description" defaultValue={ticket?.description ?? DESCRIPTION_TEMPLATE} rows={10} />
          </label>
          <div className="actions">
            <button className="btn btn-primary" type="submit" disabled={pending}>{ticket ? "儲存" : "發布"}</button>
            <button className="btn btn-ghost" type="button" onClick={onClose}>取消</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TicketSheet({ detail, name, onClose }: { detail: Detail; name: (id: string | null) => string; onClose: () => void }) {
  const { ticket: t } = detail;
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [noteFor, setNoteFor] = useState<TicketAction | null>(null);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState<"idle" | "done" | "select">("idle");
  const [pending, startTransition] = useTransition();

  function act(action: TicketAction, note = "") {
    if (NEEDS_NOTE.includes(action) && !note.trim()) {
      setError(action === "reject" ? "退回要寫原因" : "標成不做要寫原因");
      return;
    }
    setError(null);
    const f = new FormData();
    f.set("id", t.id);
    f.set("action", action);
    f.set("note", note);
    startTransition(async () => {
      const r = await actOnTicket(f);
      if (!r.ok) setError(r.error);
      else {
        setNoteFor(null);
        router.refresh();
      }
    });
  }

  async function copyKickoff(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied("done");
    } catch {
      setCopied("select"); // 複製被擋：改成把文字框選起來讓人自己複製
    }
  }

  if (editing) {
    return <TicketForm ticket={t} onClose={() => setEditing(false)} onDone={() => { setEditing(false); router.refresh(); }} />;
  }

  const buttons = detail.actions.filter((a) => a !== "edit");
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet tk-sheet" role="dialog" aria-modal="true" aria-labelledby="tk-title" onClick={(e) => e.stopPropagation()}>
        <div className="meta" style={{ marginTop: 0 }}>
          <span className={`tag tk-status tk-${t.status}`}>{STATUS_LABEL[t.status]}</span>
          <span className="tag">{CATEGORY_LABEL[t.category]}</span>
          <span>T-{t.number}</span>
        </div>
        <h2 id="tk-title">{t.title}</h2>
        <p className="tk-people">{name(t.reporterId)} 開的票{t.ownerId ? `・${name(t.ownerId)} 認領` : "・還沒人認領"}</p>

        <div className="notice tk-next"><b>下一步：</b>{detail.next}</div>
        {error ? <div className="notice bad" role="alert">{error}</div> : null}

        {buttons.length || detail.actions.includes("edit") ? (
          <div className="actions tk-actions">
            {buttons.map((a) =>
              NEEDS_NOTE.includes(a) ? (
                <button key={a} className="btn btn-ghost" type="button" disabled={pending} onClick={() => { setError(null); setNoteFor(noteFor === a ? null : a); }}>
                  {ACTION_LABEL[a]}…
                </button>
              ) : (
                <button key={a} className={`btn ${PRIMARY.includes(a) ? "btn-primary" : "btn-ghost"}`} type="button" disabled={pending} onClick={() => act(a)}>
                  {ACTION_LABEL[a]}
                </button>
              ),
            )}
            {detail.actions.includes("edit") ? <button className="btn btn-ghost" type="button" onClick={() => setEditing(true)}>編輯</button> : null}
          </div>
        ) : null}

        {noteFor ? (
          <form className="tk-note" onSubmit={(e) => { e.preventDefault(); act(noteFor, String(new FormData(e.currentTarget).get("note") ?? "")); }}>
            <label className="field">
              <span>{noteFor === "reject" ? "退回原因（回報人會看到，寫清楚哪裡要再改）" : "為什麼不做"}</span>
              <textarea className="textarea" name="note" rows={3} autoFocus />
            </label>
            <div className="actions">
              <button className="btn btn-primary" type="submit" disabled={pending}>確定{ACTION_LABEL[noteFor]}</button>
              <button className="btn btn-ghost" type="button" onClick={() => setNoteFor(null)}>取消</button>
            </div>
          </form>
        ) : null}

        {detail.kickoff ? (
          <section className="tk-kickoff">
            <div className="tk-kickoff-head">
              <b>開工指令</b>
              <button className="btn btn-ghost" type="button" onClick={() => copyKickoff(detail.kickoff!)}>
                {copied === "done" ? "已複製" : "複製開工指令"}
              </button>
            </div>
            {copied === "select" ? <p className="tk-hint">瀏覽器不讓網頁直接複製，下面的文字已經選好，請按 ⌘C／Ctrl+C。</p> : null}
            {copied === "select" ? (
              <textarea className="textarea" readOnly rows={8} defaultValue={detail.kickoff} ref={(el) => el?.select()} />
            ) : (
              <p className="tk-hint">貼給 Claude 就能照看我笑話的開發規範開工。</p>
            )}
          </section>
        ) : null}

        <div className="source tk-body"><small>描述</small>{t.description.trim() || "（沒有寫描述）"}</div>

        <section>
          <b className="tk-h">歷史紀錄</b>
          <ol className="tk-history">
            {detail.events.map((e) => (
              <li key={e.id}>
                <span>{formatTaipeiDateTime(e.at)}</span>
                <span><b>{name(e.actorId)}</b> {EVENT_LABEL[e.action]}{e.note ? `：${e.note}` : ""}</span>
              </li>
            ))}
          </ol>
        </section>

        <div className="actions" style={{ marginTop: 16 }}>
          <button className="btn btn-ghost" type="button" onClick={onClose}>關閉</button>
        </div>
      </div>
    </div>
  );
}
