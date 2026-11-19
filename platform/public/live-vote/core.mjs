// 最後更新：2026-11-19 04:26
// 誰幫忙的：Claude Code（Claude Opus 5.5）
// 修改摘要：新增輸贏附帶（勝隊獎勵／輸隊懲罰）的預設值、舊設定換新與揭曉文字組法；預設隊名為攻隊／受隊
export const ROSTER = [
  "傑哥",
  "芭樂",
  "竹節蟲",
  "兔子",
  "柏文",
  "大弋",
  "巧達",
  "又又",
  "林靖",
];
export const DEFAULT_TEAMS = [
  {
    id: "blue",
    name: "攻隊",
    color: "#2854ed",
    members: ROSTER.slice(0, 4).map(member),
  },
  {
    id: "orange",
    name: "受隊",
    color: "#ff7836",
    members: ROSTER.slice(4, 8).map(member),
  },
];
/** Build a reusable local portrait record; unknown names get a text fallback. */
export function member(name) {
  return {
    name,
    avatar: ROSTER.includes(name)
      ? `../love-improv/profiles/thumbs/${name}.jpg`
      : "",
    position: 35,
  };
}
/** Validate user-controlled teams before either storage adapter accepts them. */
export function validateTeams(teams) {
  if (!Array.isArray(teams) || teams.length !== 2)
    throw new Error("請設定兩支隊伍。");
  const result = teams.map((team, i) => {
    const name = String(team.name || "").trim();
    if (!name || name.length > 12) throw new Error("隊名請填寫 1～12 個字。");
    if (!/^#[0-9a-f]{6}$/i.test(team.color))
      throw new Error("隊伍顏色格式不正確。");
    if (
      !Array.isArray(team.members) ||
      team.members.length < 1 ||
      team.members.length > 8
    )
      throw new Error("每隊請設定 1～8 位成員。");
    const members = team.members.map((m) => {
      const n = String(m.name || "").trim();
      if (!n || n.length > 16) throw new Error("成員名稱請填寫 1～16 個字。");
      const avatar = safeAvatar(m.avatar);
      return {
        name: n,
        avatar,
        position: Math.max(0, Math.min(100, Number(m.position) || 0)),
      };
    });
    return {
      id: i === 0 ? "blue" : "orange",
      name,
      color: team.color,
      members,
    };
  });
  if (result[0].name === result[1].name)
    throw new Error("兩隊請使用不同名稱，讓觀眾容易辨認。");
  return result;
}
/** Accept local portrait paths or HTTPS images, never script/data URLs. */
export function safeAvatar(value) {
  const url = String(value || "");
  if (!url) return "";
  const prefix = "../love-improv/profiles/";
  if (
    url.startsWith(prefix) &&
    !url.slice(prefix.length).includes("..") &&
    !/%2e|%2f|%5c|\\/i.test(url)
  )
    return url;
  try {
    if (new URL(url).protocol === "https:") return url;
  } catch {
    /* local/invalid input */
  }
  throw new Error("頭像請使用 HTTPS 圖片網址，或選擇現有演員。");
}
/** A blank session never inherits votes from an earlier show. */
export function newSession(id, settings = {}) {
  return {
    id,
    title: String(settings.title || "看我笑話・現場 PK")
      .trim()
      .slice(0, 60),
    teams: validateTeams(settings.teams || structuredClone(DEFAULT_TEAMS)),
    expected: Math.max(
      1,
      Math.min(10000, Math.round(Number(settings.expected) || 150)),
    ),
    status: "ready",
    counts: [0, 0],
    version: 1,
    created_at: new Date().toISOString(),
    opened_at: null,
    closed_at: null,
  };
}
/** Return winner index, tie, or empty; never declare a zero-vote winner. */
export function outcome(counts) {
  if (counts[0] + counts[1] === 0) return "empty";
  return counts[0] === counts[1] ? "tie" : counts[0] > counts[1] ? 0 : 1;
}
/** Both bars share an absolute scale; expected attendance is not a voting cap. */
export function chartScale(counts, expected = 150) {
  return Math.max(expected, Math.ceil(Math.max(...counts) / 50) * 50, 1);
}
/** Only accept monotonic versions within one explicit session. */
export function acceptsSnapshot(current, incoming) {
  if (
    current &&
    Number.isInteger(current.round) &&
    Number.isInteger(incoming?.round) &&
    incoming.round > current.round
  )
    return true;
  return (
    !!incoming &&
    (!current ||
      (current.id === incoming.id && incoming.version >= current.version))
  );
}
/** Keyboard guard shared by the actual UI and automated regression tests. */
export function canHandleKey(event, modalOpen, busy) {
  const tag = event.target?.tagName?.toLowerCase();
  return (
    !event.repeat &&
    !event.isComposing &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !modalOpen &&
    !busy &&
    !["input", "textarea", "select", "button", "a"].includes(tag) &&
    !event.target?.isContentEditable
  );
}
/** Apply a demo action. The real backend enforces the same constraints in SQL. */
export function reduceDemo(record, action) {
  const next = structuredClone(record);
  const s = next.session;
  if (action.type === "vote" && next.votes[action.user] === action.team)
    return next;
  if (action.type === "open" && s.status === "ready") {
    s.status = "open";
    s.opened_at = new Date().toISOString();
  } else if (action.type === "close" && s.status === "open") {
    s.status = "closed";
    s.closed_at = new Date().toISOString();
  } else if (action.type === "vote" && s.status === "open") {
    const i = s.teams.findIndex((t) => t.id === action.team);
    if (i < 0 || !action.user) throw new Error("無效的選票。");
    const previous = s.teams.findIndex((t) => t.id === next.votes[action.user]);
    if (previous >= 0) s.counts[previous] -= 1;
    next.votes[action.user] = action.team;
    s.counts[i] += 1;
  } else if (action.type === "simulate" && s.status === "open") {
    if (
      ![0, 1].includes(action.index) ||
      !Number.isInteger(action.amount) ||
      action.amount < 1 ||
      action.amount > 10
    )
      throw new Error("無效的模擬票數。");
    s.counts[action.index] += action.amount;
  } else if (action.type === "settings" && s.status === "ready") {
    const settings = newSession(s.id, action.settings);
    Object.assign(s, {
      teams: settings.teams,
      title: settings.title,
      expected: settings.expected,
    });
  } else if (
    (action.type === "open" && s.status === "open") ||
    (action.type === "close" && s.status === "closed")
  )
    return next;
  else
    throw new Error(
      s.status === "closed" ? "本場投票已結束。" : "目前狀態不允許這個操作。",
    );
  s.version += 1;
  return next;
}
/** Choose legible foreground for any configured team color. */
export function inkFor(hex) {
  const rgb = hex
    .slice(1)
    .match(/../g)
    .map((v) => parseInt(v, 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const l = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  return l > 0.179 ? "#111111" : "#ffffff";
}

/** Shift the complete projection in viewport units; Home restores its origin. */
export function canPositionStage(event, modalOpen) {
  return (
    ["ArrowUp", "ArrowDown", "Home"].includes(event.key) &&
    !modalOpen &&
    !event.isComposing &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !["INPUT", "TEXTAREA", "SELECT"].includes(event.target?.tagName) &&
    !event.target?.isContentEditable
  );
}

/** Clamp projection movement so Home always provides a predictable recovery. */
export function stagePosition(position, key) {
  if (key === "Home") return 0;
  return Math.max(
    -80,
    Math.min(
      80,
      position + (key === "ArrowUp" ? -2 : key === "ArrowDown" ? 2 : 0),
    ),
  );
}

/** Enable the new fanfare once, then preserve deliberate mute choices. */
export function victorySoundPreferences(saved = {}) {
  return {
    sound: saved.soundVersion === 2 ? saved.sound !== false : true,
    soundVersion: 2,
  };
}

/** 輸贏附帶的本場預設：輸的那隊要穿囚服拍照。 */
export const DEFAULT_STAKE = Object.freeze({
  stakeType: "penalty",
  stake: "要穿囚服拍照！",
  stakeVersion: 1,
});

/** 舊版只有「勝隊獎勵文字」：第一次載入新版時換成本場預設，之後保留控制台手動改的內容。 */
export function stakePreferences(saved = {}) {
  if (saved.stakeVersion !== 1) return { ...DEFAULT_STAKE };
  return {
    stakeType: saved.stakeType === "reward" ? "reward" : "penalty",
    stake: typeof saved.stake === "string" ? saved.stake : "",
    stakeVersion: 1,
  };
}

/**
 * 揭曉大標「勝隊獲勝」後面要接什麼；沒有文字時回 null，只顯示勝隊。
 * 勝隊獎勵：「攻隊獲勝，將獲得……」；輸隊懲罰：「攻隊獲勝！受隊要……」，team 是輸隊的索引。
 */
export function stakeClause(prefs, winner) {
  const text = String(prefs?.stake ?? "").trim();
  if (!text) return null;
  return prefs.stakeType === "reward"
    ? { joiner: "，", team: null, text }
    : { joiner: "！", team: 1 - winner, text };
}
