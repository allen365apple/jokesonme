"use client";
// 最後更新：2026-11-19 14:30
// 誰幫忙的：Claude Code（Claude Opus 5.5）
// 修改摘要：工具箱表單的圖示選擇器：按「選圖示」展開可搜尋的 emoji 清單，也可以直接在欄位輸入。
//
// 內嵌展開（按鈕帶 aria-expanded／aria-controls），不另開彈出層：它本身就在彈出的表單裡，
// 再疊一層會有焦點與層級問題。欄位 name="icon" 照常隨表單送出。
import { useId, useRef, useState } from "react";
import { EMOJI_GROUPS, searchEmoji, type EmojiEntry } from "@/lib/emoji-list";

export default function EmojiPicker({ name, defaultValue, autoFocus }: { name: string; defaultValue: string; autoFocus?: boolean }) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const toggleRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const inputId = `${id}-input`;
  const panelId = `${id}-panel`;
  const results = searchEmoji(query);

  function pick(emoji: string) {
    setValue(emoji);
    setOpen(false);
    setQuery("");
    toggleRef.current?.focus();
  }

  const cell = (e: EmojiEntry) => (
    <button key={e.emoji} type="button" className="emoji-cell" aria-label={e.name} title={e.name} onClick={() => pick(e.emoji)}>
      {e.emoji}
    </button>
  );

  return (
    <div className="field">
      <label htmlFor={inputId} className="emoji-label">圖示（點按鈕挑一個 emoji，或直接輸入）</label>
      <div className="emoji-field">
        <button
          ref={toggleRef}
          type="button"
          className="btn btn-ghost emoji-toggle"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => {
            setOpen((v) => !v);
            requestAnimationFrame(() => searchRef.current?.focus());
          }}
        >
          <span className="emoji-preview" aria-hidden="true">{value || "🙂"}</span>
          {open ? "收起" : "選圖示"}
        </button>
        <input id={inputId} className="input" name={name} value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off" autoFocus={autoFocus} />
      </div>
      {open ? (
        <div
          id={panelId}
          className="emoji-panel"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setOpen(false);
              toggleRef.current?.focus();
            }
          }}
        >
          <input
            ref={searchRef}
            className="input"
            type="search"
            aria-label="搜尋 emoji"
            placeholder="搜尋，例如：麥克風、投票、笑、錢"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
          <div className="emoji-scroll">
            {results === null ? (
              EMOJI_GROUPS.map((g) => (
                <section key={g.key} aria-label={g.label}>
                  <p className="emoji-group-title">{g.label}</p>
                  <div className="emoji-grid">{g.items.map(cell)}</div>
                </section>
              ))
            ) : results.length ? (
              <div className="emoji-grid">{results.map(cell)}</div>
            ) : (
              <p className="emoji-empty">找不到「{query.trim()}」。可以換個字搜尋，或直接在上面的欄位貼上想要的 emoji。</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
