// 最後更新：2026-11-19 04:26
// 誰幫忙的：Claude Code（Claude Opus 5.5）
// 修改摘要：core.mjs 有改，快取版本號跟著加一，避免瀏覽器拿到舊檔
import { acceptsSnapshot, outcome } from "./core.mjs?v=13";
import { createStore, modeFromUrl } from "./store.mjs?v=13";
import {
  $,
  escapeHtml as esc,
  membersMarkup,
  hydratePortraits,
  applyTeamColor,
  showConnection,
  resultLabel,
} from "./ui.mjs?v=12";

const mode = modeFromUrl();
let id = new URL(location.href).searchParams.get("session");
let store,
  state,
  sync,
  selection = null,
  voted = null,
  busy = false,
  identityReady = false,
  connected = false,
  signature = "";

/** Restore browser identity and authoritative receipt before enabling a vote. */
async function init() {
  $("#mode-label").textContent =
    mode === "demo" ? "排練・不計正式票" : "現場投票";
  $("#mode-label").classList.toggle("demo", mode === "demo");
  try {
    store = await createStore(mode, true);
    if (mode === "live") {
      const initial = await store.current();
      id = initial.id;
      render(initial);
      history.replaceState(null, "", new URL("./vote.html", location.href));
    }
    if (!id) throw new Error("請重新掃描現場 QR Code。");
    render(await store.read(id));
    await restoreIdentity();
    sync = store.subscribe(id, render, (status) => {
      connected = status !== "error";
      showConnection(status);
      updateButton();
    });
  } catch (error) {
    showError(error.message);
    $("#vote-status").textContent = "暫時無法投票";
  }
}

async function restoreIdentity() {
  await store.identity();
  voted = await store.myVote(id);
  identityReady = true;
  renderReceipt();
  updateButton();
}

/** Do not reveal live counts before submission; the projector still receives them. */
function render(next) {
  if (!acceptsSnapshot(state, next)) return;
  if (state?.id !== next.id) {
    id = next.id;
    voted = null;
    selection = null;
  }
  if (Object.hasOwn(next, "my_vote")) {
    if (!selection || selection === voted) selection = next.my_vote;
    voted = next.my_vote;
  }
  state = next;
  const nextSignature = JSON.stringify(next.teams);
  if (signature !== nextSignature) {
    $("#vote-teams").innerHTML = next.teams
      .map(
        (team, i) =>
          `<button class="team-choice" data-team="${esc(team.id)}" type="button" aria-pressed="false"><span class="vote-action">投給</span><h2 class="team-name ${team.name.length > 5 ? "long-name" : ""}">${esc(team.name)}</h2>${membersMarkup(team.members)}<span class="choice-indicator" aria-hidden="true"></span><span class="choice-score" hidden></span></button>`,
      )
      .join("");
    next.teams.forEach((team, i) =>
      applyTeamColor(document.querySelectorAll(".team-choice")[i], team),
    );
    hydratePortraits($("#vote-teams"));
    signature = nextSignature;
  }
  $("#status-tag").textContent =
    next.status === "open"
      ? "VOTING LIVE"
      : next.status === "closed"
        ? "FINAL"
        : "GET READY";
  $("#vote-status").textContent =
    next.status === "closed"
      ? "投票結束，請看大螢幕揭曉！"
      : next.status === "open"
        ? "選隊後，按下投票。"
        : "等待開放投票";
  document.querySelectorAll(".team-choice").forEach((button, i) => {
    const score = button.querySelector(".choice-score");
    score.hidden = true;
    score.textContent = `${next.counts[i]} 票`;
  });
  renderReceipt();
  updateButton();
}

function renderReceipt() {
  if (!state) return;
  const team = state.teams.find((t) => t.id === voted);
  $("#receipt").hidden = !team;
  if (team)
    $("#receipt").innerHTML = `<strong>已投給${esc(team.name)} ✓</strong>`;
}

function updateButton() {
  const eligible =
    identityReady && connected && state?.status === "open" && !busy;
  document.querySelectorAll(".team-choice").forEach((button) => {
    button.disabled = !eligible;
    const chosen = button.dataset.team === (selection || voted);
    button.setAttribute("aria-pressed", String(chosen));
    button.querySelector(".choice-indicator").textContent = chosen ? "✓" : "";
    button.querySelector(".vote-action").textContent =
      button.dataset.team === voted ? "已投給" : "投給";
  });
  $("#submit-vote").disabled = !eligible || !selection || selection === voted;
  $("#submit-vote").textContent = busy
    ? "正在確認你的選票⋯"
    : state?.status === "closed"
      ? "本場投票已結束"
      : state?.status === "ready"
        ? "等待開放投票"
        : selection === voted && voted
          ? "已投票 ✓"
          : voted
            ? "確認改投"
            : "投票";
  const selected = state?.teams.find((t) => t.id === selection);
  const receipt = state?.teams.find((t) => t.id === voted);
  $("#selection-label").textContent =
    state?.status === "closed"
      ? receipt
        ? `已投給${receipt.name}，投票已截止。`
        : "投票已截止"
      : selected && selection !== voted
        ? `已選${selected.name}，按下${voted ? "確認改投" : "投票"}送出。`
        : receipt
          ? `已投給${receipt.name} ✓　截止前都能改投。`
          : "先選一隊，再按投票。";
}

function showError(message) {
  $("#vote-error").textContent = message;
  $("#vote-error").hidden = false;
  $("#retry-button").hidden = false;
}

async function submit() {
  if (
    busy ||
    !selection ||
    selection === voted ||
    !connected ||
    !identityReady ||
    state?.status !== "open"
  )
    return;
  busy = true;
  updateButton();
  $("#vote-error").hidden = true;
  const submittedRound = id;
  try {
    const result = await store.vote(id, selection);
    if (id === submittedRound && acceptsSnapshot(state, result.session)) {
      selection = result.team;
      voted = result.team;
      render({ ...result.session, my_vote: result.team });
    }
    $("#retry-button").hidden = true;
  } catch (error) {
    showError(`${error.message} 請按「重新確認」，先查詢這一票是否已收到。`);
    // An uncertain request may have committed. Disable another submission until reconciled.
    identityReady = false;
  } finally {
    busy = false;
    renderReceipt();
    updateButton();
  }
}

async function retry() {
  if (busy) return;
  busy = true;
  updateButton();
  try {
    if (!store) {
      await init();
      return;
    }
    await restoreIdentity();
    render(await store.read(id));
    connected = true;
    if (!sync)
      sync = store.subscribe(id, render, (status) => {
        connected = status !== "error";
        showConnection(status);
        updateButton();
      });
    $("#vote-error").hidden = true;
    $("#retry-button").hidden = true;
    sync.refresh();
  } catch (error) {
    showError(error.message);
  } finally {
    busy = false;
    updateButton();
  }
}

$("#vote-teams").addEventListener("click", (e) => {
  const button = e.target.closest("[data-team]");
  if (!button || button.disabled) return;
  selection = button.dataset.team;
  updateButton();
});
$("#submit-vote").addEventListener("click", submit);
$("#retry-button").addEventListener("click", retry);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && store && identityReady && !busy)
    restoreIdentity().catch((error) => showError(error.message));
});
window.addEventListener("storage", () => {
  if (store && identityReady && !busy)
    restoreIdentity().catch((error) => showError(error.message));
});
window.addEventListener("pagehide", () => sync?.stop());
init();
