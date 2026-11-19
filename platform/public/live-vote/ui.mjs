// 最後更新：2026-11-19 04:26
// 誰幫忙的：Claude Code（Claude Opus 5.5）
// 修改摘要：core.mjs 有改，快取版本號跟著加一，避免瀏覽器拿到舊檔
import { inkFor, safeAvatar, outcome } from "./core.mjs?v=13";

export const $ = (selector) => document.querySelector(selector);
/** Escape all names and other data before inserting presentational markup. */
export const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
/** Portrait fallback always retains a readable performer name. */
export function membersMarkup(members) {
  return `<span class="members">${members
    .map((m) => {
      let avatar = "";
      try {
        avatar = safeAvatar(m.avatar);
      } catch {
        /* invalid image gets name fallback */
      }
      return `<span class="member"><span class="portrait" style="--position:${Number(m.position) || 0}%"><span>${escapeHtml(m.name.slice(0, 1))}</span>${avatar ? `<img src="${escapeHtml(avatar)}" alt="" loading="eager" style="display:none">` : ""}</span><span class="member-name">${escapeHtml(m.name)}</span></span>`;
    })
    .join("")}</span>`;
}
/** Activate images without inline event handlers or broken-image icons. */
export function hydratePortraits(root) {
  root.querySelectorAll(".portrait img").forEach((img) => {
    const show = () => {
      img.style.display = "block";
      img.previousElementSibling.hidden = true;
    };
    img.addEventListener("load", show, { once: true });
    img.addEventListener(
      "error",
      () => {
        img.hidden = true;
      },
      { once: true },
    );
    if (img.complete && img.naturalWidth) show();
  });
}
/** Apply color only after hex validation; foreground follows WCAG contrast math. */
export function applyTeamColor(element, team) {
  const color = /^#[0-9a-f]{6}$/i.test(team.color) ? team.color : "#2854ed";
  element.style.setProperty("--team-color", color);
  element.style.setProperty("--team-ink", inkFor(color));
}
/** Translate transport status without implying that cached counts are current. */
export function showConnection(state) {
  const labels = {
    demo: "本機排練・不連線收票",
    live: "即時連線正常",
    polling: "備援同步中",
    error: "連線中斷，票數可能尚未更新",
  };
  $("#connection").textContent = labels[state] || "正在連線";
  $("#connection").dataset.state = state;
}
/** Final wording distinguishes ties and empty shows. */
export function resultLabel(session) {
  const winner = outcome(session.counts);
  return winner === "empty"
    ? "本場沒有有效票"
    : winner === "tie"
      ? "勢均力敵！"
      : `${session.teams[winner].name}獲勝！`;
}
let toastTimer;
/** Nonblocking message for stage operators. */
export function toast(message) {
  $("#toast").textContent = message;
  $("#toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    $("#toast").hidden = true;
  }, 6000);
}
/** Generate the QR locally, with a four-module quiet zone and no external QR service. */
export function drawQr(url, root) {
  if (!globalThis.qrcode) {
    root.textContent = "QR 載入失敗";
    return;
  }
  const qr = globalThis.qrcode(0, "M");
  qr.addData(url);
  qr.make();
  root.innerHTML = qr.createSvgTag({ cellSize: 3, margin: 12, scalable: true });
  root.querySelector("svg")?.setAttribute("aria-label", "本場觀眾投票 QR Code");
}
/** Winner particles originate at that team's bar, not over the readable scoreboard. */
export function celebrate(session, prefs) {
  const reduced =
    prefs.reduced || matchMedia("(prefers-reduced-motion: reduce)").matches;
  const winner = outcome(session.counts);
  if (!prefs.effects || reduced || winner === "empty") return;
  const root = $("#burst");
  root.replaceChildren();
  const bounds = root.getBoundingClientRect();
  const winners = winner === "tie" ? [0, 1] : [winner];
  winners.forEach((index) => {
    const bar = $(`#team-${index}`).getBoundingClientRect();
    for (let n = 0; n < 240; n++) {
      const particle = document.createElement("i");
      particle.className = "confetti";
      Object.assign(particle.style, {
        left: `${bar.x + bar.width * (n % 2 ? 0.82 : 0.18) - bounds.x}px`,
        top: `${bar.y + bar.height * 0.78 - bounds.y}px`,
        background: [
          session.teams[index].color,
          "#fff",
          "#e8ff8a",
          "#ffd166",
          "#ff61bd",
        ][n % 5],
        animation: "none",
        width: `${5 + Math.random() * 8}px`,
        height: `${n % 4 === 0 ? 32 : 8 + Math.random() * 12}px`,
        borderRadius: n % 5 === 0 ? "50%" : "0",
      });
      particle.style.setProperty("--dx", `${(Math.random() - 0.5) * 440}px`);
      particle.style.setProperty("--dy", `${80 + Math.random() * 220}px`);
      particle.style.setProperty("--spin", `${Math.random() * 900}deg`);
      root.append(particle);
      const dx = (Math.random() - 0.5) * Math.max(900, bounds.width),
        rise = bar.height * (0.7 + Math.random() * 0.9),
        spin = (Math.random() - 0.5) * 2200;
      particle
        .animate(
          [
            { transform: "translate(0,0) rotate(0deg)", opacity: 1 },
            {
              transform: `translate(${dx * 0.4}px,${-rise}px) rotate(${spin * 0.4}deg)`,
              opacity: 1,
              offset: 0.35,
            },
            {
              transform: `translate(${dx}px,${bounds.height * 0.7}px) rotate(${spin}deg)`,
              opacity: 0,
            },
          ],
          {
            duration: 3300 + Math.random() * 1700,
            delay: (n % 3) * 320 + Math.random() * 180,
            easing: "cubic-bezier(.18,.6,.45,1)",
            fill: "both",
          },
        )
        .finished.then(() => particle.remove())
        .catch(() => particle.remove());
    }
  });
}
let victoryAudioUnlocked = false;
/** Unlock the supplied victory clip only after a deliberate operator gesture. */
export async function unlockAudio() {
  const audio = $("#victory-audio");
  if (!audio || victoryAudioUnlocked) return;
  audio.muted = true;
  try {
    await audio.play();
    audio.pause();
    audio.currentTime = 0;
    victoryAudioUnlocked = true;
  } catch {
    /* The next operator gesture can retry if playback is still restricted. */
  } finally {
    audio.muted = false;
  }
}
/** Immediately stop the victory clip when the operator mutes the sound. */
export function stopSound() {
  const audio = $("#victory-audio");
  if (!audio) return;
  audio.pause();
  audio.currentTime = 0;
}
/** Play the single supplied victory clip at the operator's selected volume. */
export function playCheer(prefs) {
  const audio = $("#victory-audio");
  if (!prefs.sound || !audio) return;
  stopSound();
  audio.volume = Math.max(0, Math.min(100, prefs.volume)) / 100;
  audio.play().catch(() => {});
}
