// 外掛比對版本用（change claude-ticket-tools）。不需要金鑰。
import { json } from "@/lib/claude/http";
import { API_VERSION } from "@/lib/claude/tokens";

export async function GET(): Promise<Response> {
  return json({ api: API_VERSION });
}
