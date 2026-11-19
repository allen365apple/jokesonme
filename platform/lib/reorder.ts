// 最後更新：2026-11-19 15:09
// 誰幫忙的：Claude Code（Claude Opus 5.5）
// 修改摘要：新增拖曳排序用的純函式：用項目中點算落點、落點換成目標位置、陣列搬移、依 id 順序重排。
//
// 拖曳排序的純函式（change tools-directory「Pointer-based drag with keyboard fallback」）。
// 不碰 DOM、不連資料庫，瀏覽器與伺服器都能 import，旁邊有 reorder.test.ts。

/**
 * 落點（插入位置，0..n）：指標在第一個「中點在指標下方」的項目之前；都不在下方就是最後。
 * midpoints 是各項目在版面上的中點（offsetTop + offsetHeight / 2），依目前順序排列。
 */
export function dropSlot(midpoints: number[], pointer: number): number {
  for (let i = 0; i < midpoints.length; i++) {
    if (midpoints[i] > pointer) return i;
  }
  return midpoints.length;
}

/** 把落點換成「拿掉自己之後」的目標索引；結果等於 from 代表放回原位（不用移動、不畫落點線）。 */
export function slotToIndex(from: number, slot: number): number {
  return slot > from ? slot - 1 : slot;
}

/** 回傳新陣列：把 from 的項目移到 to。索引超出範圍時原樣回傳一份。 */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const out = list.slice();
  if (from < 0 || from >= out.length || to < 0 || to >= out.length || from === to) return out;
  const [item] = out.splice(from, 1);
  out.splice(to, 0, item);
  return out;
}

/** 依 ids 的順序重排 items；不在 ids 裡的項目照原順序接在後面。 */
export function applyOrder<T extends { id: string }>(items: readonly T[], ids: readonly string[]): T[] {
  const rank = new Map(ids.map((id, i) => [id, i]));
  const known = items.filter((t) => rank.has(t.id)).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
  return [...known, ...items.filter((t) => !rank.has(t.id))];
}
