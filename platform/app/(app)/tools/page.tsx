// 最後更新：2026-11-19 13:49
// 誰幫忙的：Claude Code（Claude Opus 5.5）
// 修改摘要：新增工具箱頁 /tools，依三區列出工具卡片與已下架清單。
import { requirePage } from "@/lib/auth/current";
import { listTools } from "@/lib/tools";
import TopBar from "@/components/top-bar";
import ToolsBoard from "@/components/tools-board";

// 工具箱（spec tools-directory「Toolbox page lists tools by section」）：admin、member 可看可改；財務夥伴被導回財務首頁。
export default async function ToolsPage() {
  const me = await requirePage("tools", "/tools");
  const tools = await listTools(`user:${me.id}`);
  return (
    <main className="page">
      <TopBar me={me} title="工具箱" sub="看我笑話的小工具，點卡片在新分頁打開" />
      <div className="content">
        <ToolsBoard tools={tools} />
      </div>
    </main>
  );
}
