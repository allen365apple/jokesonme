// 金鑰的主人是誰（spec claude-ticket-tools「Key scope and authentication」）。
import { json, withClaudeUser } from "@/lib/claude/http";
import { API_VERSION } from "@/lib/claude/tokens";

export async function GET(request: Request): Promise<Response> {
  return withClaudeUser(request, async (u) => json({ id: u.id, name: u.name, role: u.role, api: API_VERSION }));
}
