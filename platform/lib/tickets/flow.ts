// 開發票的狀態規則（spec dev-tickets「Ticket status transitions」）。純函式，網頁按鈕與 server action 共用同一套判斷。
// 寫入由資料庫函式 dev_ticket_apply 比對 expectStatus／expectOwner 後原子完成（「Conflict-safe claiming」）。
import type { Role } from "../auth/access.ts";

export type TicketStatus = "open" | "in_progress" | "review" | "done" | "wontfix";
export type TicketCategory = "feature" | "bug" | "process" | "data";
export type TicketAction = "claim" | "unclaim" | "deliver" | "accept" | "reject" | "wontfix" | "reopen" | "edit";

export const STATUS_LABEL: Record<TicketStatus, string> = {
  open: "待處理",
  in_progress: "處理中",
  review: "待驗收",
  done: "已完成",
  wontfix: "不做",
};

export const CATEGORY_LABEL: Record<TicketCategory, string> = {
  feature: "新功能",
  bug: "修 Bug",
  process: "改善流程",
  data: "修正資料",
};

export const ACTION_LABEL: Record<TicketAction, string> = {
  claim: "認領",
  unclaim: "取消認領",
  deliver: "交付",
  accept: "驗收通過",
  reject: "退回",
  wontfix: "不做",
  reopen: "重新開放",
  edit: "編輯",
};

export const CATEGORIES = Object.keys(CATEGORY_LABEL) as TicketCategory[];
export const ACTIVE_STATUSES: readonly TicketStatus[] = ["open", "in_progress", "review"];
export const TITLE_MAX = 120;

/** 新票描述預填的四段（spec「Description template」）。 */
export const DESCRIPTION_TEMPLATE = "現在怎樣：\n\n希望變成：\n\n做完看得到什麼（驗收）：\n\n誰會用、誰看得到：\n";

export type TicketState = { status: TicketStatus; reporterId: string; ownerId: string | null };
export type TicketActor = { id: string; role: Role | null };
export type EditFields = { title: string; category: string; description: string };

export type Plan =
  | {
      ok: true;
      expectStatus: TicketStatus;
      expectOwner: string | null;
      patch: Record<string, string | null>;
      event: { actor_id: string; action: TicketAction; note: string };
    }
  | { ok: false; reason: string };

export function isCategory(v: string): v is TicketCategory {
  return (CATEGORIES as string[]).includes(v);
}

/** 標題 1–120 字（去頭尾空白後）。回傳錯誤訊息，沒問題回 null。 */
export function titleError(title: string): string | null {
  const t = title.trim();
  if (!t) return "請填標題";
  if ([...t].length > TITLE_MAX) return `標題最多 ${TITLE_MAX} 個字`;
  return null;
}

function no(reason: string): Plan {
  return { ok: false, reason };
}

export function planTransition(
  t: TicketState,
  action: TicketAction,
  actor: TicketActor,
  opts: { note?: string; edit?: EditFields } = {},
): Plan {
  if (actor.role !== "admin" && actor.role !== "member") return no("你沒有開發票的權限");
  const isAdmin = actor.role === "admin";
  const isReporter = actor.id === t.reporterId;
  const isOwner = t.ownerId !== null && actor.id === t.ownerId;
  const note = (opts.note ?? "").trim();
  const ok = (to: TicketStatus | null, patch: Record<string, string | null> = {}): Plan => ({
    ok: true,
    expectStatus: t.status,
    expectOwner: t.ownerId,
    patch: to ? { status: to, ...patch } : patch,
    event: { actor_id: actor.id, action, note },
  });
  const wrongStatus = () => no(`這張票現在是「${STATUS_LABEL[t.status]}」，不能${ACTION_LABEL[action]}`);

  switch (action) {
    case "claim":
      if (t.status !== "open") return wrongStatus();
      if (t.ownerId !== null) return no("這張票已經有人認領了");
      return ok("in_progress", { owner_id: actor.id });
    case "unclaim":
      if (t.status !== "in_progress") return wrongStatus();
      if (!isOwner && !isReporter && !isAdmin) return no("只有認領人、回報人或管理員可以取消認領");
      return ok("open", { owner_id: null });
    case "deliver":
      if (t.status !== "in_progress") return wrongStatus();
      if (!isOwner && !isAdmin) return no("只有認領人或管理員可以交付");
      return ok("review");
    case "accept":
    case "reject": {
      if (t.status !== "review") return wrongStatus();
      const canReview = isAdmin || (isReporter && !isOwner);
      if (!canReview) {
        return no(isOwner ? "認領人不能驗收自己做的票，請回報人或管理員驗收" : "只有回報人或管理員可以驗收");
      }
      if (action === "reject" && !note) return no("退回要寫原因");
      return ok(action === "accept" ? "done" : "in_progress");
    }
    case "wontfix":
      if (!(ACTIVE_STATUSES as TicketStatus[]).includes(t.status)) return wrongStatus();
      if (!isReporter && !isAdmin) return no("只有回報人或管理員可以把票標成不做");
      if (!note) return no("標成不做要寫原因");
      return ok("wontfix");
    case "reopen":
      if (t.status !== "wontfix") return wrongStatus();
      if (!isAdmin) return no("只有管理員可以重新開放");
      return ok("open", { owner_id: null });
    case "edit": {
      if (t.status !== "open" || t.ownerId !== null) return no("有人認領之後就不能編輯了");
      if (!isReporter && !isAdmin) return no("只有回報人或管理員可以編輯");
      const e = opts.edit;
      if (!e) return no("缺少要編輯的內容");
      const te = titleError(e.title);
      if (te) return no(te);
      if (!isCategory(e.category)) return no("請選分類");
      return ok(null, { title: e.title.trim(), category: e.category, description: e.description });
    }
  }
}

const PROBE_EDIT: EditFields = { title: "x", category: "feature", description: "" };

/** 這個人現在能按哪些按鈕（不檢查原因是否填寫，原因在送出時檢查）。 */
export function allowedActions(t: TicketState, actor: TicketActor): TicketAction[] {
  const all: TicketAction[] = ["claim", "unclaim", "deliver", "accept", "reject", "wontfix", "reopen", "edit"];
  return all.filter((a) => planTransition(t, a, actor, { note: "probe", edit: PROBE_EDIT }).ok);
}

/** 票頁頂端「現在輪到誰、下一步」。names 把 userId 轉成名字。 */
export function nextStep(t: TicketState, name: (id: string | null) => string): string {
  switch (t.status) {
    case "open":
      return "等人認領。認領後複製開工指令貼給 Claude 開工。";
    case "in_progress":
      return `輪到 ${name(t.ownerId)} 開發。PR 合併並部署後，回來按「交付」。`;
    case "review":
      return t.ownerId === t.reporterId
        ? "輪到管理員驗收（回報人自己做的票由管理員驗收）。"
        : `輪到 ${name(t.reporterId)} 驗收：通過就按「驗收通過」，有問題就「退回」並寫原因。`;
    case "done":
      return "已完成。";
    case "wontfix":
      return "這張票決定不做。";
  }
}
