// 連結碼換金鑰（spec claude-ticket-tools「Link exchange」）。不需要金鑰；碼本身就是一次性憑證。
import { fail, json, readJson, str } from "@/lib/claude/http";
import { exchangeLinkCode } from "@/lib/claude/links";

export async function POST(request: Request): Promise<Response> {
  const body = await readJson(request);
  try {
    const r = await exchangeLinkCode(str(body.code), str(body.device));
    return r.ok ? json({ token: r.token, name: r.name }) : fail(400, r.error);
  } catch (err) {
    console.error("[claude] link failed", err);
    return fail(500, "看我笑話平台出了點問題，請稍後再試");
  }
}
