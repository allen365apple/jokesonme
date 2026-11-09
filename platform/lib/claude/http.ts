// /api/claude/* 共用：驗證金鑰、回 JSON、把票整理成給 Claude 看的樣子（change claude-ticket-tools）。
import { authenticateClaude, type ClaudeUser } from "./auth.ts";
import { claudeAuthDeps } from "./links.ts";
import { CATEGORIES, CATEGORY_LABEL, STATUS_LABEL, type TicketCategory } from "../tickets/flow.ts";
import type { TicketView } from "../tickets/data.ts";

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

export function fail(status: number, error: string): Response {
  return json({ error }, status);
}

/** 驗證通過才執行 fn；驗證失敗直接回 401／403 與中文說明。 */
export async function withClaudeUser(request: Request, fn: (user: ClaudeUser) => Promise<Response>): Promise<Response> {
  try {
    const a = await authenticateClaude(request, claudeAuthDeps);
    if (!a.ok) return fail(a.status, a.error);
    return await fn(a.user);
  } catch (err) {
    console.error("[claude] request failed", err);
    return fail(500, "看我笑話平台出了點問題，請稍後再試");
  }
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const v = await request.json();
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** 分類可以給代碼（feature）或畫面上的名稱（新功能）。 */
export function toCategory(v: string): string {
  const s = v.trim();
  const byLabel = CATEGORIES.find((c) => CATEGORY_LABEL[c] === s);
  return byLabel ?? s;
}

export function ticketUrl(request: Request, number: number): string {
  return `${new URL(request.url).origin}/tickets?t=${number}`;
}

export function summarize(t: TicketView, name: (id: string | null) => string) {
  return {
    number: t.number,
    title: t.title,
    category: t.category,
    categoryLabel: CATEGORY_LABEL[t.category as TicketCategory],
    status: t.status,
    statusLabel: STATUS_LABEL[t.status],
    reporter: name(t.reporterId),
    owner: t.ownerId ? name(t.ownerId) : null,
  };
}
