// 最後更新：2026-11-19 04:26
// 誰幫忙的：Claude Code（Claude Opus 5.5）
// 修改摘要：勝隊獎勵文字改成「輸贏附帶」：控制台可選勝隊獎勵或輸隊懲罰，揭曉大標依類型顯示
import {
  DEFAULT_TEAMS,
  DEFAULT_STAKE,
  stakePreferences,
  stakeClause,
  ROSTER,
  member,
  validateTeams,
  outcome,
  chartScale,
  acceptsSnapshot,
  canHandleKey,
  stagePosition,
  canPositionStage,
  victorySoundPreferences,
} from "./core.mjs?v=13";
import {
  createStore,
  modeFromUrl,
  readLocal,
  writeLocal,
} from "./store.mjs?v=13";
import {
  $,
  escapeHtml as esc,
  membersMarkup,
  hydratePortraits,
  applyTeamColor,
  showConnection,
  resultLabel,
  toast,
  drawQr,
  celebrate,
  unlockAudio,
  stopSound,
  playCheer,
} from "./ui.mjs?v=12";

const mode = modeFromUrl();
let revealing = false,
  cancelReveal = null,
  testing = false,
  latestLive = null;
import { revealVotes } from "./reveal.mjs?v=14";
let store,
  state,
  sync,
  isAdmin = false,
  busy = false,
  teamSignature = "",
  connected = false;
let lastLeader = null,
  lastOvertakeAt = 0,
  pendingTransition = null,
  lastTransitionAt = 0;
const defaults = {
  font: 100,
  position: 0,
  volume: 30,
  sound: true,
  ...DEFAULT_STAKE,
  soundVersion: 2,
  effects: true,
  reduced: false,
  qr: true,
  qrSize: 130,
  qrSizeVersion: 1,
  qrPosition: 0,
  qrPositionVersion: 1,
};
let prefs = { ...defaults };
let editorTeams = structuredClone(DEFAULT_TEAMS);

/** Load one explicit session; invalid links never create a replacement show. */
async function init() {
  try {
    const saved = readLocal("preferences", {});
    if (saved.qrPositionVersion !== 1) {
      saved.qrPosition = 0;
      saved.qrPositionVersion = 1;
    }
    if (saved.qrSizeVersion !== 1) {
      if (saved.qrSize == null || Number(saved.qrSize) === 100)
        saved.qrSize = 130;
      saved.qrSizeVersion = 1;
    }
    prefs = {
      ...defaults,
      ...saved,
      ...victorySoundPreferences(saved),
      ...stakePreferences(saved),
    };
    delete prefs.prize;
    writeLocal("preferences", prefs);
    applyPreferences();
    $("#mode-label").textContent =
      mode === "demo" ? "排練・模擬票數" : "LIVE VOTE";
    $("#mode-label").classList.toggle("demo", mode === "demo");
    $("#demo-controls").hidden = mode !== "demo";
    $("#rehearsal-section").hidden = mode !== "demo";
    store = await createStore(mode);
    isAdmin = await store.admin();
    let id =
      mode === "live"
        ? (await store.current()).id
        : new URL(location.href).searchParams.get("session");
    if (!id && mode === "demo") {
      id = readLocal("last-demo-session");
      if (!id) id = (await store.create()).id;
    }
    if (id) await loadSession(id);
    else {
      $("#status-text").textContent = "尚未選擇場次";
      $("#status-detail").textContent = "按 C 開啟控制台，再建立新場次。";
    }
    $("#operator-note").textContent =
      mode === "demo"
        ? "排練只在這個瀏覽器同步，不接受其他手機投票。按 1／2 加票，Enter 開始或結束。"
        : "Enter 開放／截止 · F 全螢幕 · C 控制台 · Q QR · M 音效";
  } catch (error) {
    $("#status-text").textContent = "尚未準備完成";
    $("#status-detail").textContent = error.message;
    toast(error.message);
  } finally {
    updateControls();
    $("#stage").focus({ preventScroll: true });
  }
}

/** Switching to a historical session stops the prior subscription first. */
async function loadSession(id) {
  const initial = await store.read(id);
  sync?.stop();
  state = null;
  teamSignature = "";
  lastLeader = null;
  pendingTransition = null;
  const url = new URL(location.href);
  if (mode === "live") {
    url.search = "";
    url.hash = "";
  } else {
    url.searchParams.set("rehearsal", "1");
    url.searchParams.set("session", id);
  }
  history.replaceState(null, "", url);
  render(initial);
  updateQr();
  sync = store.subscribe(id, render, (status) => {
    connected = status !== "error";
    showConnection(status);
    updateControls();
  });
}

/** Apply versioned server snapshots; counters remain exact integers throughout animation. */
function render(next) {
  if (testing) {
    if (acceptsSnapshot(latestLive || state, next)) latestLive = next;
    return;
  }
  if (!acceptsSnapshot(state, next)) return;
  const previous = state;
  if (previous && previous.id !== next.id) {
    $("#burst").replaceChildren();
    cancelReveal?.();
    cancelReveal = null;
    revealing = false;
    $("#qr-block").hidden = !prefs.qr;
  }
  state = next;
  if (next.status === pendingTransition) pendingTransition = null;
  const signature = JSON.stringify(next.teams);
  if (signature !== teamSignature) {
    renderTeams();
    teamSignature = signature;
  }
  if (previous?.status === "open" && next.status === "closed" && !revealing) {
    revealing = true;
    renderStatus();
    updateControls();
    cancelReveal = revealVotes(next, prefs, () => {
      revealing = false;
      render(state);
      celebrate(next, prefs);
      if (outcome(next.counts) !== "empty") playCheer(prefs);
    });
    return;
  }
  if (revealing) {
    updateControls();
    return;
  }
  if (next.status !== "closed") {
    $("#qr-block").hidden = !prefs.qr;
    document.querySelector("#stage").classList.remove("reveal-complete");
  } else $("#qr-block").hidden = true;
  const scale = chartScale(next.counts, next.expected),
    winner = outcome(next.counts);
  next.teams.forEach((team, i) => {
    const root = $(`#team-${i}`);
    const shown = next.status === "closed" ? next.counts[i] : 0;
    root.querySelector(".score-value").textContent = shown;
    root
      .querySelector(".chart")
      .setAttribute(
        "aria-label",
        next.status === "closed"
          ? `${team.name} ${shown} 票，共同刻度 ${scale}`
          : "票數將於截止後揭曉",
      );
    root.querySelector(".bar").style.transform = `scaleY(${shown / scale})`;
    root.querySelector(".scale-value").textContent = `共同刻度 ${scale}`;
    root.classList.toggle(
      "winner",
      next.status === "closed" && (winner === i || winner === "tie"),
    );
    root.classList.toggle(
      "loser",
      next.status === "closed" && typeof winner === "number" && winner !== i,
    );
    root.querySelector(".team-status").textContent =
      next.status === "closed"
        ? winner === i
          ? "WINNER"
          : winner === "tie"
            ? "平手"
            : "FINAL"
        : next.status === "open"
          ? "VOTING"
          : "CHALLENGER";
    if (
      next.status === "closed" &&
      previous &&
      previous.counts[i] !== next.counts[i]
    ) {
      root.querySelector(".score").classList.remove("pop");
      requestAnimationFrame(() =>
        root.querySelector(".score").classList.add("pop"),
      );
    }
  });
  renderStatus();
  updateControls();
}

function renderTeams() {
  state.teams.forEach((team, i) => {
    const root = $(`#team-${i}`);
    applyTeamColor(root, team);
    root.dataset.side = i ? "02" : "01";
    root.innerHTML = `<div class="team-topline" hidden><span class="team-status">CHALLENGER</span></div><h2 class="team-name ${team.name.length > 5 ? "long-name" : ""}">${esc(team.name)}</h2>${membersMarkup(team.members)}<div class="chart" role="img" aria-label="${esc(team.name)}得票數"><div class="bar-track"></div><div class="bar"></div><div class="score"><span class="score-value">0</span><small>票</small></div></div><span class="scale-value" hidden></span>`;
    hydratePortraits(root);
  });
}

function showOvertake(winner) {
  if (state.status !== "open" || typeof winner !== "number") return;
  if (
    lastLeader !== null &&
    lastLeader !== winner &&
    Date.now() - lastOvertakeAt > 5000 &&
    prefs.effects
  ) {
    const root = $(`#team-${winner}`);
    root.classList.add("overtake");
    root.querySelector(".team-status").textContent = "反超！";
    lastOvertakeAt = Date.now();
    setTimeout(() => {
      root.classList.remove("overtake");
      if (state.status === "open") renderStatus();
    }, 2200);
  }
  lastLeader = winner;
}

/** Render only confirmed results; all editable labels use text nodes. */
function renderHeadline(total) {
  const title = $("#headline-title");
  if (state.status === "open") {
    const progress = document.createElement("span");
    progress.className = "vote-progress";
    progress.textContent = `目前已有 ${total} 人投票`;
    title.replaceChildren("投給今天最有趣的隊伍！", progress);
  } else if (state.status === "closed") {
    const winner = outcome(state.counts);
    if (typeof winner !== "number") {
      title.textContent = winner === "tie" ? "兩隊平手！" : "本輪沒有有效選票";
      return;
    }
    const clause = stakeClause(prefs, winner);
    title.replaceChildren(
      ...teamLabel(state.teams[winner]),
      "獲勝" + (clause ? clause.joiner : ""),
    );
    if (clause?.team != null)
      title.append(...teamLabel(state.teams[clause.team]));
    if (clause) title.append(clause.text);
  } else title.textContent = "今天哪一隊最有趣？投票吧！";
}

/** 隊名首字用隊色，其餘照常；用文字節點，隊名不會被當成 HTML。 */
function teamLabel(team) {
  const first = document.createElement("span");
  first.className = "winner-name";
  first.style.color = team.color;
  first.textContent = Array.from(team.name)[0];
  return [first, Array.from(team.name).slice(1).join("")];
}

const STAKE_COPY = {
  penalty: {
    label: "輸隊懲罰文字",
    placeholder: "要……（前面自動接輸隊名稱；留空只顯示勝隊）",
  },
  reward: { label: "勝隊獎勵文字", placeholder: "將獲得……（留空只顯示勝隊）" },
};

function syncStakeFields() {
  const copy = STAKE_COPY[prefs.stakeType] || STAKE_COPY.penalty;
  $("#stake-type").value = prefs.stakeType;
  $("#stake-label").textContent = copy.label;
  $("#stake-text").placeholder = copy.placeholder;
  if ($("#stake-text").value !== prefs.stake)
    $("#stake-text").value = prefs.stake;
}

function renderStatus() {
  if (!state) return;
  if (revealing) {
    $("#headline-title").textContent = "投票結束";
    $("#status-tag").textContent = "REVEAL";
    $("#status-text").textContent = "公布結果";
    $("#status-detail").textContent = "";
    return;
  }
  const total = state.counts.reduce((a, b) => a + b, 0);
  $("#status-tag").textContent =
    state.status === "open"
      ? "VOTING LIVE"
      : state.status === "closed"
        ? "FINAL RESULT"
        : "READY TO LAUGH";
  $("#status-text").textContent =
    pendingTransition === "closed"
      ? "正在確認最終票數⋯"
      : pendingTransition === "open"
        ? "正在開放投票⋯"
        : state.status === "closed"
          ? "公布結果"
          : state.status === "open"
            ? "開始投票"
            : "準備投票";
  renderHeadline(total);
  $("#status-detail").textContent =
    state.status === "ready"
      ? "先選好你的笑點，等主持人一聲令下。"
      : state.status === "closed"
        ? `已收到 ${total} 票 · 本輪投票已截止`
        : "投票進行中，結束後揭曉票數。";
}

function updateControls() {
  const button = $("#toggle-vote");
  button.disabled =
    !store || !isAdmin || !state || busy || revealing || testing || !connected;
  button.innerHTML = `<kbd>Enter</kbd> ${busy ? "正在確認⋯" : state?.status === "open" ? "結束投票" : state?.status === "closed" ? "清票並開始下一輪" : "開始投票"}`;
  document.querySelectorAll("[data-sim],[data-batch]").forEach((b) => {
    b.disabled = !state || state.status !== "open" || busy;
  });
}

/** Failed requests never optimistically advance status; retry preserves the intended transition. */
async function transition() {
  if (revealing || testing) return;
  if (
    !state ||
    !isAdmin ||
    busy ||
    !connected ||
    Date.now() - lastTransitionAt < 650
  )
    return;
  lastTransitionAt = Date.now();
  unlockAudio();
  busy = true;
  pendingTransition ||=
    state.status === "ready"
      ? "open"
      : state.status === "closed"
        ? "restart"
        : "closed";
  updateControls();
  renderStatus();
  try {
    const target = pendingTransition;
    let next;
    if (target === "restart" && mode === "demo") {
      next = await store.create({
        title: state.title,
        teams: state.teams,
        expected: state.expected,
      });
      next = await store.open(next.id);
      await loadSession(next.id);
    } else
      next = await store[
        target === "open" ? "open" : target === "restart" ? "restart" : "close"
      ](state.id);
    pendingTransition = null;
    render(next);
  } catch (error) {
    toast(`${error.message} 尚未確認完成，請確認連線後重試。`);
    sync?.refresh();
  } finally {
    busy = false;
    renderStatus();
    updateControls();
  }
}

function updateQr() {
  if (!state) return;
  const url = new URL("./vote.html", location.href);
  const qrHidden = !prefs.qr || state.status === "closed";
  $("#qr-block").hidden = qrHidden;
  if (mode === "demo") {
    url.searchParams.set("rehearsal", "1");
    url.searchParams.set("session", state.id);
  }
  $("#audience-link").href = url.href;
  if (mode === "demo") {
    $("#qr").textContent = "DEMO\n同瀏覽器排練";
    $("#qr-title").textContent = "試投一票";
    $("#qr-caption").textContent = "僅同一瀏覽器，不跨裝置。";
  } else if (["localhost", "127.0.0.1", "[::1]"].includes(location.hostname)) {
    $("#qr").textContent = "本機網址\n手機無法掃碼連入";
    $("#qr-title").textContent = "本機驗證";
    $("#qr-caption").textContent = "發布後自動產生正式 QR。";
  } else drawQr(url.href, $("#qr"));
}

function applyPreferences() {
  document.documentElement.style.setProperty("--scale", prefs.font / 100);
  document.documentElement.style.setProperty("--qr-scale", prefs.qrSize / 100);
  document.documentElement.style.setProperty(
    "--qr-y-offset",
    `${prefs.qrPosition}vh`,
  );
  document.documentElement.style.setProperty(
    "--stage-offset",
    `${prefs.position}vh`,
  );
  document.body.classList.toggle("reduced-motion", prefs.reduced);
  if (!revealing && !testing)
    $("#qr-block").hidden = state?.status === "closed" || !prefs.qr;
  $("#mute-button").setAttribute(
    "aria-expanded",
    String(!$("#sound-popover").hidden),
  );
  $("#mute-button").classList.toggle("sound-muted", !prefs.sound);
  $("#qr-button").setAttribute(
    "aria-expanded",
    String(!$("#qr-popover").hidden),
  );
  $("#qr-visibility").setAttribute("aria-pressed", String(prefs.qr));
  $("#qr-visibility").setAttribute(
    "aria-label",
    prefs.qr ? "隱藏 QR Code" : "顯示 QR Code",
  );
  $("#qr-visibility").title = prefs.qr ? "隱藏 QR Code" : "顯示 QR Code";
  $("#qr-visibility .eye-slash").hidden = prefs.qr;
  [
    ["font-scale", "font", "font-value", "%"],
    ["top-space", "position", "space-value", "vh"],
    ["volume", "volume", "volume-value", "%"],
    ["qr-size", "qrSize", "qr-size-value", "%"],
    ["qr-position", "qrPosition", "qr-position-value", "vh"],
  ].forEach(([id, key, out, unit]) => {
    $("#" + id).value = prefs[key];
    const prefix = key === "qrPosition" && prefs[key] > 0 ? "+" : "";
    $("#" + out).textContent = prefix + prefs[key] + unit;
  });
  $("#sound-enabled").checked = prefs.sound;
  syncStakeFields();
  $("#victory-audio").volume = Math.max(0, Math.min(100, prefs.volume)) / 100;
  $("#effects-enabled").checked = prefs.effects;
  $("#motion-reduced").checked = prefs.reduced;
  if (!prefs.sound) stopSound();
}

function rememberPreferences() {
  applyPreferences();
  try {
    writeLocal("preferences", prefs);
  } catch {
    toast("瀏覽器無法儲存偏好，這次設定仍然有效。");
  }
}

function openSettings() {
  if (testing) return;
  if ($("#settings-dialog").open) {
    $("#settings-dialog").close();
    return;
  }
  $("#settings-message").textContent = "";
  $("#settings-mode").textContent =
    mode === "demo"
      ? "排練模式：只有本瀏覽器的模擬資料，不會影響正式投票。"
      : "公開控制：任何取得此網址的人都能開始、截止、重開投票及修改隊伍。";
  $("#session-form").elements.title.value = state?.title || "看我笑話・現場 PK";
  $("#session-form").elements.expected.value = state?.expected || 150;
  editorTeams = structuredClone(state?.teams || DEFAULT_TEAMS);
  renderEditors();
  const editable = isAdmin && (!state || state.status !== "open");
  $("#session-fields").disabled = !editable;
  $("#save-settings").disabled = !editable || !state;
  $("#new-session").disabled = !isAdmin || state?.status === "open";
  $("#new-session").hidden = mode === "live";
  $("#edit-hint").textContent =
    state?.status === "open"
      ? "投票中鎖定"
      : state?.status === "closed"
        ? "儲存後套用到下一輪"
        : "投票開放前可修改";
  $("#settings-dialog").showModal();
  loadHistory();
}

function renderEditors() {
  $("#team-editors").innerHTML = editorTeams
    .map(
      (team, i) =>
        `<div class="team-editor" data-editor="${i}"><h4>${i ? "右隊" : "左隊"}</h4><div class="form-row"><label>隊名<input data-field="team-name" value="${esc(team.name)}" maxlength="12" required></label><label>顏色<input type="color" data-field="color" value="${esc(team.color)}"></label></div><div class="member-editors">${team.members.map((m, j) => memberEditorMarkup(m, i, j)).join("")}</div><button type="button" data-add="${i}" ${team.members.length >= 8 ? "disabled" : ""}>＋ 加入成員</button></div>`,
    )
    .join("");
}

function memberEditorMarkup(m, i, j) {
  return `<div class="member-editor" data-member="${j}"><label class="member-source">選用頭像<select data-field="source"><option value="">自訂成員／圖片</option>${ROSTER.map((name) => `<option value="${esc(name)}" ${m.avatar === member(name).avatar ? "selected" : ""}>${esc(name)}</option>`).join("")}</select></label><label>顯示名字<input data-field="name" value="${esc(m.name)}" maxlength="16" required></label><label>裁切位置<input data-field="position" type="number" min="0" max="100" value="${m.position}"></label><label class="avatar-input">圖片網址或既有路徑<input data-field="avatar" value="${esc(m.avatar)}" placeholder="無圖片時顯示名字"></label><div class="member-controls"><button type="button" data-move="${i}:${j}:-1" ${j === 0 ? "disabled" : ""}>往前</button><button type="button" data-move="${i}:${j}:1" ${j === editorTeams[i].members.length - 1 ? "disabled" : ""}>往後</button><button type="button" data-remove="${i}:${j}" ${editorTeams[i].members.length === 1 ? "disabled" : ""}>移出本隊</button></div></div>`;
}

function collectEditors() {
  return [...document.querySelectorAll("[data-editor]")].map((root) => ({
    name: root.querySelector("[data-field=team-name]").value,
    color: root.querySelector("[data-field=color]").value,
    members: [...root.querySelectorAll("[data-member]")].map((row) => ({
      name: row.querySelector("[data-field=name]").value,
      avatar: row.querySelector("[data-field=avatar]").value,
      position: Number(row.querySelector("[data-field=position]").value),
    })),
  }));
}

function settingsValue() {
  return {
    title: $("#session-form").elements.title.value,
    expected: Number($("#session-form").elements.expected.value),
    teams: validateTeams(collectEditors()),
  };
}

/** Panel actions report errors locally and serialize double clicks. */
async function panelAction(work) {
  if (busy) return;
  busy = true;
  updateControls();
  $("#settings-message").textContent = "處理中⋯";
  try {
    await work();
  } catch (error) {
    $("#settings-message").textContent = error.message;
  } finally {
    busy = false;
    updateControls();
  }
}

async function loadHistory() {
  if (!isAdmin || !store) return;
  try {
    const rows = await store.history();
    $("#history-list").innerHTML = rows
      .slice(0, 20)
      .map(
        (s) =>
          `<div>第 ${s.round || "-"} 輪 · ${s.counts.join(" : ")} · 已結束</div>`,
      )
      .join("");
  } catch (error) {
    $("#settings-message").textContent = error.message;
  }
}

async function simulate(index, amount = 1) {
  if (testing || mode !== "demo" || !state || state.status !== "open" || busy)
    return;
  busy = true;
  updateControls();
  try {
    render(await store.simulate(state.id, index, amount));
  } catch (error) {
    toast(error.message);
  } finally {
    busy = false;
    updateControls();
  }
}

async function fullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
    $("#stage").focus({ preventScroll: true });
  } catch {
    toast("這個瀏覽器未開放全螢幕，請使用瀏覽器全螢幕功能。");
  }
}

/** Local preview only: no store commands or ballot writes are issued. */
function openTest() {
  if (!state || busy || revealing || testing) return;
  state.teams.forEach(
    (team, i) => ($("#test-name-" + i).textContent = team.name),
  );
  $("#test-dialog").showModal();
}

/** Paint a synthetic snapshot without replacing the authoritative live state. */
function paintTest(snapshot) {
  const live = state;
  testing = false;
  state = null;
  render(snapshot);
  state = live;
  testing = true;
  $("#mode-label").textContent = "測試模式・不計正式票";
  updateControls();
}

function startTest(counts) {
  if (!state || counts.some((n) => !Number.isInteger(n) || n < 0 || n > 10000))
    return;
  $("#test-dialog").close();
  unlockAudio();
  cancelReveal?.();
  $("#burst").replaceChildren();
  latestLive = state;
  const preview = { ...structuredClone(state), status: "closed", counts };
  paintTest({ ...preview, status: "ready", counts: [0, 0] });
  $("#exit-test").hidden = false;
  $("#status-text").textContent = "測試模式・即將揭曉";
  cancelReveal = revealVotes(preview, prefs, () => {
    paintTest(preview);
    $("#status-text").textContent = "測試結果・" + resultLabel(preview);
    celebrate(preview, prefs);
    if (outcome(counts) !== "empty") playCheer(prefs);
  });
}

function exitTest() {
  if (!testing) return;
  cancelReveal?.();
  cancelReveal = null;
  $("#burst").replaceChildren();
  $("#exit-test").hidden = true;
  testing = false;
  const live = latestLive || state;
  latestLive = null;
  state = null;
  $("#mode-label").textContent = mode === "demo" ? "排練模式" : "現場投票";
  render(live);
  $("#stage").focus({ preventScroll: true });
}

function bindEvents() {
  $("#preview-sound").addEventListener("click", async () => {
    await unlockAudio();
    playCheer({ ...prefs, sound: true });
  });
  $(".header-right").append($(".operator-bar"));
  $("#test-button").addEventListener("click", openTest);
  $("#close-test").addEventListener("click", () => $("#test-dialog").close());
  $("#test-dialog").addEventListener("close", () =>
    $("#stage").focus({ preventScroll: true }),
  );
  $("#exit-test").addEventListener("click", exitTest);
  $("#test-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    if (!form.reportValidity()) return;
    startTest([
      Number(form.elements.left.value),
      Number(form.elements.right.value),
    ]);
  });
  $("#toggle-vote").addEventListener("click", transition);
  $("#settings-button").addEventListener("click", openSettings);
  $("#close-settings").addEventListener("click", () =>
    $("#settings-dialog").close(),
  );
  $("#settings-dialog").addEventListener("close", () =>
    $("#stage").focus({ preventScroll: true }),
  );
  $("#settings-dialog").addEventListener("click", (e) => {
    if (e.target === $("#settings-dialog")) {
      const r = e.target.getBoundingClientRect();
      if (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      )
        e.target.close();
    }
  });
  $("#fullscreen-button").hidden = !document.fullscreenEnabled;
  $("#fullscreen-button").addEventListener("click", fullscreen);
  $("#qr-button").addEventListener("click", () => {
    $("#sound-popover").hidden = true;
    $("#mute-button").setAttribute("aria-expanded", "false");
    const popover = $("#qr-popover");
    popover.hidden = !popover.hidden;
    $("#qr-button").setAttribute("aria-expanded", String(!popover.hidden));
    if (!popover.hidden) $("#qr-size").focus({ preventScroll: true });
  });
  $("#qr-visibility").addEventListener("click", () => {
    prefs.qr = !prefs.qr;
    rememberPreferences();
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".qr-control") && !$("#qr-popover").hidden) {
      $("#qr-popover").hidden = true;
      $("#qr-button").setAttribute("aria-expanded", "false");
    }
    if (!e.target.closest(".sound-control") && !$("#sound-popover").hidden) {
      $("#sound-popover").hidden = true;
      $("#mute-button").setAttribute("aria-expanded", "false");
    }
  });
  $("#mute-button").addEventListener("click", () => {
    unlockAudio();
    $("#qr-popover").hidden = true;
    $("#qr-button").setAttribute("aria-expanded", "false");
    const popover = $("#sound-popover");
    popover.hidden = !popover.hidden;
    $("#mute-button").setAttribute("aria-expanded", String(!popover.hidden));
    if (!popover.hidden) $("#volume").focus({ preventScroll: true });
  });
  document
    .querySelectorAll("[data-sim]")
    .forEach((b) =>
      b.addEventListener("click", () => simulate(Number(b.dataset.sim))),
    );
  document
    .querySelectorAll("[data-batch]")
    .forEach((b) =>
      b.addEventListener("click", () => simulate(Number(b.dataset.batch), 10)),
    );
  document.addEventListener("keydown", (e) => {
    if (
      e.key.toLowerCase() === "m" &&
      e.target.closest?.(".sound-control") &&
      !e.repeat &&
      !e.isComposing &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey &&
      !$("#settings-dialog").open &&
      !$("#test-dialog").open
    ) {
      e.preventDefault();
      $("#mute-button").click();
      return;
    }
    if (e.key === "Escape" && !$("#sound-popover").hidden) {
      e.preventDefault();
      $("#sound-popover").hidden = true;
      $("#mute-button").setAttribute("aria-expanded", "false");
      $("#mute-button").focus({ preventScroll: true });
      return;
    }
    if (e.key === "Escape" && !$("#qr-popover").hidden) {
      e.preventDefault();
      $("#qr-popover").hidden = true;
      $("#qr-button").setAttribute("aria-expanded", "false");
      $("#qr-button").focus({ preventScroll: true });
      return;
    }
    const modalOpen = $("#settings-dialog").open || $("#test-dialog").open;
    if (canPositionStage(e, modalOpen)) {
      e.preventDefault();
      prefs.position = stagePosition(prefs.position, e.key);
      applyPreferences();
      return;
    }
    if (testing) {
      if (
        !e.repeat &&
        !e.isComposing &&
        (e.key === "Escape" || e.key.toLowerCase() === "t")
      ) {
        e.preventDefault();
        exitTest();
      }
      return;
    }
    if (e.key === "Enter" && e.repeat && e.target === $("#toggle-vote")) {
      e.preventDefault();
      return;
    }
    if (
      !canHandleKey(
        e,
        $("#settings-dialog").open || $("#test-dialog").open,
        busy,
      )
    )
      return;
    const actions = {
      Enter: transition,
      f: fullscreen,
      c: openSettings,
      t: openTest,
      q: () => $("#qr-button").click(),
      m: () => $("#mute-button").click(),
      1: () => simulate(0),
      2: () => simulate(1),
    };
    const action = actions[e.key] || actions[e.key.toLowerCase()];
    if (action) {
      e.preventDefault();
      action();
    }
  });
  bindPreferences();
  bindEditor();
  bindForms();
  window.addEventListener("pagehide", () => sync?.stop());
}

function bindPreferences() {
  $("#stake-type").addEventListener("change", (e) => {
    prefs.stakeType = e.target.value === "reward" ? "reward" : "penalty";
    rememberPreferences();
    if (!revealing && !testing && state) renderStatus();
  });
  $("#stake-text").addEventListener("input", (e) => {
    prefs.stake = e.target.value;
    rememberPreferences();
    if (!revealing && !testing && state) renderStatus();
  });
  [
    ["font-scale", "font"],
    ["top-space", "position"],
    ["volume", "volume"],
    ["qr-size", "qrSize"],
    ["qr-position", "qrPosition"],
  ].forEach(([id, key]) =>
    $("#" + id).addEventListener("input", (e) => {
      prefs[key] = Number(e.target.value);
      rememberPreferences();
    }),
  );
  [
    ["sound-enabled", "sound"],
    ["effects-enabled", "effects"],
    ["motion-reduced", "reduced"],
  ].forEach(([id, key]) =>
    $("#" + id).addEventListener("change", (e) => {
      unlockAudio();
      prefs[key] = e.target.checked;
      rememberPreferences();
    }),
  );
}

function bindEditor() {
  $("#team-editors").addEventListener("change", (e) => {
    if (e.target.dataset.field !== "source") return;
    const name = e.target.value;
    if (!name) return;
    const row = e.target.closest("[data-member]"),
      m = member(name);
    row.querySelector("[data-field=name]").value = m.name;
    row.querySelector("[data-field=avatar]").value = m.avatar;
  });
  $("#team-editors").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    editorTeams = collectEditors();
    if (b.dataset.add !== undefined)
      editorTeams[Number(b.dataset.add)].members.push(member("新成員"));
    if (b.dataset.remove) {
      const [i, j] = b.dataset.remove.split(":").map(Number);
      editorTeams[i].members.splice(j, 1);
    }
    if (b.dataset.move) {
      const [i, j, delta] = b.dataset.move.split(":").map(Number);
      const list = editorTeams[i].members;
      [list[j], list[j + delta]] = [list[j + delta], list[j]];
    }
    renderEditors();
  });
}

function bindForms() {
  $("#session-form").addEventListener("submit", (e) => {
    e.preventDefault();
    panelAction(async () => {
      render(await store.save(state.id, settingsValue()));
      $("#settings-message").textContent =
        "已儲存，本場投影與手機畫面會同步更新。";
    });
  });
  $("#new-session").addEventListener("click", () =>
    panelAction(async () => {
      const settings =
        state && state.status !== "ready"
          ? { title: state.title, expected: state.expected, teams: state.teams }
          : settingsValue();
      const next = await store.create(settings);
      await loadSession(next.id);
      $("#settings-dialog").close();
      toast("已建立新場次，舊場紀錄仍然保留。");
    }),
  );
}

bindEvents();
init();
