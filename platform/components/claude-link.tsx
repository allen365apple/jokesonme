"use client";
// 「我的」頁的「連結 Claude」區塊（change claude-ticket-tools）：產生連結碼、安裝外掛的指令、已連結的電腦與撤銷。
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { generateLinkCode, revokeDevice } from "@/app/(app)/me/actions";
import { formatTaipeiDateTime } from "@/lib/dates";

export type DeviceView = { id: string; deviceName: string; createdAt: string; lastUsedAt: string | null };

// 桌面版 Claude 的安裝方式：請 Code 分頁裡的 Claude 改設定檔（Jesse 2026-11-09 實際裝成功的做法）
const INSTALL_PROMPT =
  "請幫我安裝看我笑話外掛：先備份 ~/.claude/settings.json，然後在 extraKnownMarketplaces 加上 \"jokesonme\"（source 是 github，repo 是 jokesonme-studio/jokesonme-plugins），在 enabledPlugins 加上 \"jokesonme@jokesonme\": true，其他設定都不要動。";

function CopyLine({ text, wrap = false }: { text: string; wrap?: boolean }) {
  const [state, setState] = useState<"idle" | "done" | "select">("idle");
  return (
    <div className="cl-line">
      {state === "select" ? (
        <textarea className="input cl-code cl-wrap" readOnly value={text} rows={wrap ? 4 : 1} ref={(el) => el?.select()} aria-label="請按 ⌘C 複製" />
      ) : (
        <code className={`cl-code${wrap ? " cl-wrap" : ""}`}>{text}</code>
      )}
      <button
        className="btn btn-ghost"
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setState("done");
          } catch {
            setState("select"); // 瀏覽器不讓網頁寫剪貼簿：把文字選起來讓人自己複製
          }
        }}
      >
        {state === "done" ? "已複製" : "複製"}
      </button>
    </div>
  );
}

export default function ClaudeLink({ devices }: { devices: DeviceView[] }) {
  const router = useRouter();
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <section className="card cl">
      <h2 className="cl-title">連結 Claude</h2>
      <p className="cl-hint">連結後，在任何資料夾跟 Claude 說「幫我開一張票」，Claude 會先跟你確認內容再開，票記在你名下。每台電腦各連一次。</p>
      {error ? <div className="notice bad" role="alert">{error}</div> : null}

      <ol className="cl-steps">
        <li>
          <b>第一次用：在 Claude 桌面版安裝看我笑話外掛</b>
          打開 Claude 桌面版的 Code 分頁，把下面這段話貼給 Claude。它改好設定後，開一個新對話，問「我連好看我笑話了嗎？」，看到連結說明就是裝好了。
          <CopyLine text={INSTALL_PROMPT} wrap />
        </li>
        <li>
          <b>產生連結碼，把出現的那句話貼給 Claude</b>
          {code ? (
            <>
              <CopyLine text={`連結看我笑話，代碼 ${code.code}`} />
              <p className="cl-hint">這個碼 {formatTaipeiDateTime(code.expiresAt)} 前有效，只能用一次。</p>
            </>
          ) : (
            <div>
              <button
                className="btn btn-primary"
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    setError(null);
                    const r = await generateLinkCode();
                    if (r.ok) setCode({ code: r.code, expiresAt: r.expiresAt });
                    else setError(r.error);
                  })
                }
              >
                產生連結碼
              </button>
            </div>
          )}
        </li>
      </ol>

      <h3 className="cl-sub">已連結的電腦</h3>
      {devices.length === 0 ? (
        <p className="cl-hint">還沒有連結任何電腦。</p>
      ) : (
        <ul className="cl-devices">
          {devices.map((d) => (
            <li key={d.id}>
              <span className="row-main">
                <b>{d.deviceName}</b>
                <small>連結於 {formatTaipeiDateTime(d.createdAt)}・{d.lastUsedAt ? `最後使用 ${formatTaipeiDateTime(d.lastUsedAt)}` : "還沒用過"}</small>
              </span>
              <button
                className="btn btn-ghost"
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    setError(null);
                    const f = new FormData();
                    f.set("id", d.id);
                    const r = await revokeDevice(f);
                    if (!r.ok) setError(r.error ?? "沒有撤銷成功，請再試一次");
                    router.refresh();
                  })
                }
              >
                撤銷
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
