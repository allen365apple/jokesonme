// 開工指令（spec dev-tickets「Kickoff prompt」）。只指路、不抄規矩：
// 規矩只寫在 repo 根目錄的 COLLABORATION.md，這裡改了規矩就會跟那份不同步（kickoff.test.ts 有反向測試）。
import { CATEGORY_LABEL, type TicketCategory } from "./flow.ts";

export type KickoffTicket = { number: number; title: string; category: TicketCategory; description: string };

export function kickoffText(t: KickoffTicket, reporterName: string): string {
  const n = t.number;
  return [
    `你要做的是 T-${n}《${t.title}》（${CATEGORY_LABEL[t.category]}，${reporterName} 開的票）。`,
    "",
    "開工前先做這一步：",
    "1. 讀 repo 根目錄的 COLLABORATION.md，照上面的規矩做。這段指令不重複寫那些規矩，以那份為準。",
    "",
    "然後：",
    `2. 從最新的 main 開分支 feat/T-${n}-<短名>（短名用兩三個英文字描述這張票）。`,
    "3. 照 COLLABORATION.md 判斷這張票要不要先用 /spectra-propose 寫提案。",
    "4. 改好先停下來：告訴操作你的人改了什麼、怎麼看效果，等他確認，才 push 並開 PR。",
    `5. PR 標題用 fix(T-${n}): <一句話說明>。不要自行合併，等 Jesse 看過。`,
    `6. Jesse 合併並部署後，回到看我笑話平台的 /tickets?t=${n}，按「交付」交給 ${reporterName} 驗收。`,
    "",
    `這張票的內容（${reporterName} 寫的，開工前先讀完；提案和實作都照這段做）：`,
    t.description.trim() || "（回報人沒有寫描述，開工前先問操作你的人要做到什麼程度）",
  ].join("\n");
}
