// 最後更新：2026-11-19 15:09
// 誰幫忙的：Claude Code（Claude Opus 5.5）
// 修改摘要：改讀 listToolbox（區塊與工具都從資料庫來），區塊順序照 tool_sections.position。
import { requirePage } from "@/lib/auth/current";
import { listToolbox } from "@/lib/tools";
import TopBar from "@/components/top-bar";
import ToolsBoard from "@/components/tools-board";

// 工具箱（spec tools-directory「Toolbox page lists tools by section」）：admin、member 可看可改；財務夥伴被導回財務首頁。
export default async function ToolsPage() {
  const me = await requirePage("tools", "/tools");
  const { sections, tools } = await listToolbox(`user:${me.id}`);
  return (
    <main className="page">
      <TopBar me={me} title="工具箱" sub="看我笑話的小工具，點卡片在新分頁打開" />
      <div className="content">
        <ToolsBoard sections={sections} tools={tools} />
      </div>
    </main>
  );
}
