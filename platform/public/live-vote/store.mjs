// 最後更新：2026-11-19 04:26
// 誰幫忙的：Claude Code（Claude Opus 5.5）
// 修改摘要：core.mjs 有改，快取版本號跟著加一，避免瀏覽器拿到舊檔
import { CONFIG } from "./config.mjs?v=12";
import { FixedStore } from "./room-store.mjs?v=13";
import {
  acceptsSnapshot,
  newSession,
  reduceDemo,
  validateTeams,
} from "./core.mjs?v=13";

const PREFIX = "jokes-live-vote-v1:";
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Storage failure is actionable: silently losing browser identity permits duplicate votes. */
export function readLocal(key, fallback = null) {
  const value = localStorage.getItem(PREFIX + key);
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    throw new Error("本機設定無法讀取，請換用一般瀏覽模式。");
  }
}
/** Persist only nonsecret preferences/demo data through this helper. */
export function writeLocal(key, value) {
  localStorage.setItem(PREFIX + key, JSON.stringify(value));
}
/** Explicit URLs keep stale QR codes on their original sessions. */
export function modeFromUrl(url = new URL(location.href)) {
  if (CONFIG.fixedRoom)
    return url.searchParams.get("rehearsal") === "1" ? "demo" : "live";
  const requested = url.searchParams.get("mode");
  return requested === "demo"
    ? "demo"
    : requested === "live" || CONFIG.supabaseUrl
      ? "live"
      : "demo";
}
/** Create either a local rehearsal adapter or a Supabase adapter; never auto-fallback live to demo. */
export async function createStore(mode, audience = false) {
  if (mode === "demo") return new DemoStore();
  if (!CONFIG.supabaseUrl || !CONFIG.publishableKey)
    throw new Error(
      "正式後端尚未設定。請先完成 README 的 Supabase 設定；排練不會收到正式選票。",
    );
  if (
    !/^https:\/\//.test(CONFIG.supabaseUrl) ||
    !CONFIG.publishableKey.startsWith("sb_publishable_")
  )
    throw new Error(
      "請只設定 HTTPS Supabase 網址與 sb_publishable_ 公開金鑰。",
    );
  const { createClient } = await loadSdk();
  const client = createClient(CONFIG.supabaseUrl, CONFIG.publishableKey, {
    auth: {
      storageKey: PREFIX + (audience ? "audience-auth" : "admin-auth"),
      persistSession: true,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (url, options = {}) =>
        fetch(url, {
          ...options,
          signal: options.signal || AbortSignal.timeout(12000),
        }),
    },
  });
  return CONFIG.fixedRoom
    ? new FixedStore(client, audience)
    : new LiveStore(client, audience);
}

/** Load the pinned local SDK only for real voting, without a third-party runtime CDN. */
async function loadSdk() {
  if (globalThis.supabase) return globalThis.supabase;
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = new URL("./vendor/supabase.js", import.meta.url).href;
    const timer = setTimeout(
      () => reject(new Error("連線程式載入逾時，請重新整理。")),
      10000,
    );
    script.onload = () => {
      clearTimeout(timer);
      resolve();
    };
    script.onerror = () => {
      clearTimeout(timer);
      reject(new Error("連線程式未載入，請確認 vendor/supabase.js 存在。"));
    };
    document.head.append(script);
  });
  return globalThis.supabase;
}

/** Same-origin rehearsal only. Web Locks serialize multi-tab changes when supported. */
class DemoStore {
  mode = "demo";
  async identity() {
    return this.lock("identity", async () => {
      let id = readLocal("demo-user");
      if (!id) {
        id = crypto.randomUUID();
        writeLocal("demo-user", id);
      }
      return id;
    });
  }
  async lock(key, work) {
    if (navigator.locks) return navigator.locks.request(PREFIX + key, work);
    return work();
  }
  async admin() {
    return true;
  }
  async create(settings) {
    const id = crypto.randomUUID();
    const session = newSession(id, settings);
    writeLocal("session:" + id, { session, votes: {} });
    writeLocal("last-demo-session", id);
    return session;
  }
  async read(id) {
    const record = readLocal("session:" + id);
    if (!record)
      throw new Error(
        "找不到這場排練。排練只能在同一瀏覽器開啟，不支援跨手機收票。",
      );
    return record.session;
  }
  async change(id, action) {
    return this.lock(id, async () => {
      const record = readLocal("session:" + id);
      if (!record) throw new Error("找不到場次。");
      const next = reduceDemo(record, action);
      writeLocal("session:" + id, next);
      window.dispatchEvent(new Event("demo-change"));
      return next.session;
    });
  }
  async vote(id, team) {
    const user = await this.identity();
    const session = await this.change(id, { type: "vote", user, team });
    return { session, team: await this.myVote(id) };
  }
  async myVote(id) {
    return readLocal("session:" + id)?.votes[await this.identity()] || null;
  }
  async open(id) {
    return this.change(id, { type: "open" });
  }
  async close(id) {
    return this.change(id, { type: "close" });
  }
  async save(id, settings) {
    return this.change(id, { type: "settings", settings });
  }
  async simulate(id, index, amount) {
    return this.change(id, { type: "simulate", index, amount });
  }
  async history() {
    return Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX + "session:"))
      .map((k) => JSON.parse(localStorage.getItem(k)).session)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  subscribe(id, onChange, onConnection) {
    const update = () =>
      this.read(id)
        .then(onChange)
        .catch(() => onConnection("error"));
    window.addEventListener("storage", update);
    window.addEventListener("demo-change", update);
    onConnection("demo");
    update();
    return {
      refresh: update,
      stop() {
        window.removeEventListener("storage", update);
        window.removeEventListener("demo-change", update);
      },
    };
  }
}

/** All authority and vote validation remain in SQL, never in a client-supplied key. */
class LiveStore {
  mode = "live";
  constructor(client, audience) {
    this.client = client;
    this.audience = audience;
  }
  async rpc(name, args = {}) {
    const { data, error } = await this.client.rpc("jlv_" + name, args);
    if (error) throw new Error(error.message || "連線失敗，請稍後重試。");
    return data;
  }
  async identity() {
    const work = async () => {
      const { data, error } = await this.client.auth.getSession();
      if (error) throw error;
      if (data.session) return data.session.user.id;
      const result = await this.client.auth.signInAnonymously();
      if (result.error)
        throw new Error("無法建立投票身分，請確認網路或稍後重試。");
      return result.data.user.id;
    };
    return navigator.locks
      ? navigator.locks.request(PREFIX + "anonymous-login", work)
      : work();
  }
  async login(email, password) {
    const { error } = await this.client.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw new Error("登入失敗，請確認帳號與密碼。");
    if (!(await this.admin())) throw new Error("此帳號沒有投票管理權限。");
  }
  async logout() {
    const { error } = await this.client.auth.signOut();
    if (error) throw error;
  }
  async admin() {
    return this.rpc("is_admin");
  }
  async read(id) {
    if (!UUID.test(id || ""))
      throw new Error("投票連結缺少有效場次，請重新掃描現場 QR Code。");
    return this.rpc("get_session", { p_id: id });
  }
  async myVote(id) {
    return this.rpc("my_vote", { p_id: id });
  }
  async vote(id, team) {
    return this.rpc("vote", { p_id: id, p_team: team });
  }
  async create(settings) {
    return this.rpc("create_session", {
      p_settings: { ...settings, teams: validateTeams(settings.teams) },
    });
  }
  async save(id, settings) {
    return this.rpc("save_session", {
      p_id: id,
      p_settings: { ...settings, teams: validateTeams(settings.teams) },
    });
  }
  async open(id) {
    return this.rpc("set_status", { p_id: id, p_status: "open" });
  }
  async close(id) {
    return this.rpc("set_status", { p_id: id, p_status: "closed" });
  }
  async history() {
    return this.rpc("history");
  }
  subscribe(id, onChange, onConnection) {
    return liveSync(
      this.client,
      () => this.read(id),
      id,
      onChange,
      onConnection,
      this.audience,
    );
  }
}

/** Push only aggregates; polling verifies state with jitter/backoff when transport degrades. */
export function liveSync(
  client,
  read,
  id,
  onChange,
  onConnection,
  audience = false,
) {
  let stopped = false,
    realtime = false,
    timer,
    channel,
    current,
    inFlight = false,
    failures = 0,
    refreshAgain = false;
  const deliver = (state) => {
    if (!stopped && acceptsSnapshot(current, state)) {
      current = state;
      onChange(state);
    }
  };
  const schedule = () => {
    clearTimeout(timer);
    if (!stopped)
      timer = setTimeout(
        poll,
        Math.min(
          15000,
          failures
            ? 2000 * 2 ** Math.min(failures, 3)
            : realtime
              ? 12000
              : 1800,
        ) +
          Math.random() * 800,
      );
  };
  async function poll() {
    if (stopped) return;
    if (inFlight) {
      refreshAgain = true;
      return;
    }
    inFlight = true;
    try {
      deliver(await read());
      failures = 0;
      if (!stopped) onConnection(realtime ? "live" : "polling");
    } catch {
      failures++;
      if (!stopped) onConnection("error");
    } finally {
      inFlight = false;
      schedule();
      if (refreshAgain && !stopped) {
        refreshAgain = false;
        queueMicrotask(poll);
      }
    }
  }
  channel = client
    .channel("jlv:" + id)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: audience ? "jlv_signals" : "jlv_sessions",
        filter: "id=eq." + id,
      },
      (payload) => {
        if (audience) {
          poll();
          return;
        }
        deliver(payload.new);
        failures = 0;
        onConnection("live");
      },
    )
    .subscribe((status) => {
      if (stopped) return;
      realtime = status === "SUBSCRIBED";
      if (realtime) poll();
      else {
        onConnection("polling");
        schedule();
      }
    });
  const visible = () => {
    if (!document.hidden) poll();
  };
  const offline = () => onConnection("error");
  window.addEventListener("online", poll);
  window.addEventListener("offline", offline);
  document.addEventListener("visibilitychange", visible);
  poll();
  return {
    refresh: poll,
    stop() {
      stopped = true;
      clearTimeout(timer);
      client.removeChannel(channel);
      window.removeEventListener("online", poll);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", visible);
    },
  };
}
