import { readLocal, writeLocal } from "./store.mjs?v=13";

/** Fixed room, no Auth signup. UUID is a practical browser identifier, not proof of personhood. */
export class FixedStore {
  mode = "live";
  constructor(client, audience) {
    this.client = client;
    this.audience = audience;
  }
  async rpc(name, args = {}) {
    const { data, error } = await this.client.rpc("jlv_live_" + name, args);
    if (error) throw new Error(error.message || "連線失敗，請重試。");
    return data;
  }
  async identity() {
    const work = () => {
      let id = readLocal("live-browser-id");
      if (!id) {
        id = crypto.randomUUID();
        writeLocal("live-browser-id", id);
      }
      return id;
    };
    return navigator.locks
      ? navigator.locks.request("jlv-browser-identity", work)
      : work();
  }
  async admin() {
    return true;
  }
  async read() {
    const r = await this.rpc("state", {
      p_device: this.audience ? await this.identity() : null,
    });
    this.receipt = { id: r.session.id, team: r.team };
    return { ...r.session, my_vote: r.team };
  }
  async current() {
    return this.read();
  }
  async myVote(id) {
    await this.read();
    return this.receipt?.id === id ? this.receipt.team : null;
  }
  async vote(id, team) {
    const result = await this.rpc("vote", {
      p_round: id,
      p_device: await this.identity(),
      p_team: team,
    });
    this.receipt = { id: result.session.id, team: result.team };
    return result;
  }
  async command(id, operation, settings = null) {
    const key = id + ":" + operation;
    if (this.pending?.key !== key)
      this.pending = { key, id: crypto.randomUUID() };
    const result = await this.rpc("command", {
      p_secret: null,
      p_round: id,
      p_operation: operation,
      p_command: this.pending.id,
      p_settings: settings,
    });
    this.pending = null;
    return result;
  }
  async open(id) {
    return this.command(id, "open");
  }
  async close(id) {
    return this.command(id, "close");
  }
  async restart(id) {
    return this.command(id, "restart");
  }
  async save(id, settings) {
    return this.command(id, "save", settings);
  }
  async history() {
    return this.rpc("history", { p_secret: null });
  }
  subscribe(id, onChange, onConnection) {
    let stopped = false,
      timer,
      active = false,
      queued = false,
      realtime = false,
      failures = 0,
      last;
    const deliver = (s) => {
      if (
        !stopped &&
        (!last ||
          s.round > last.round ||
          (s.round === last.round && s.version >= last.version))
      ) {
        last = s;
        onChange(s);
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
              ? 2000 * 2 ** Math.min(3, failures)
              : realtime
                ? 10000
                : 1800,
          ) +
            Math.random() * 700,
        );
    };
    const poll = async () => {
      if (stopped) return;
      if (active) {
        queued = true;
        return;
      }
      active = true;
      try {
        deliver(await this.read());
        failures = 0;
        if (!stopped) onConnection(realtime ? "live" : "polling");
      } catch {
        failures++;
        if (!stopped) onConnection("error");
      } finally {
        active = false;
        schedule();
        if (queued && !stopped) {
          queued = false;
          queueMicrotask(poll);
        }
      }
    };
    const channel = this.client
      .channel("jlv-fixed-" + (this.audience ? "phone" : "screen"))
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: this.audience ? "jlv_live_signal" : "jlv_live_room",
          filter: "id=eq.main",
        },
        (payload) => {
          if (this.audience) poll();
          else {
            deliver(payload.new.snapshot);
            onConnection("live");
          }
        },
      )
      .subscribe((status) => {
        if (stopped) return;
        realtime = status === "SUBSCRIBED";
        poll();
      });
    const visible = () => {
        if (!document.hidden) poll();
      },
      offline = () => onConnection("error");
    window.addEventListener("online", poll);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", visible);
    poll();
    return {
      refresh: poll,
      stop: () => {
        stopped = true;
        clearTimeout(timer);
        this.client.removeChannel(channel);
        window.removeEventListener("online", poll);
        window.removeEventListener("offline", offline);
        document.removeEventListener("visibilitychange", visible);
      },
    };
  }
}
