// 稅務預留同步：把某專案「應該有的自動預留」跟「現有的自動預留」對齊。
// 舊系統每次都整批刪掉重建；這裡只改有變的列，結果相同但操作紀錄乾淨。
// 正式路徑已改由資料庫函式 finance_sync_tax_reserve（0013_finance_rules.sql）在同一交易內處理；
// 這份 TypeScript 版本留給 scripts/check-tax-reserves.mts 核對資料庫結果用，兩邊規則必須一致。
import { groupKey, type ReserveGroup } from "./calc.ts";

export type ExistingReserve = { id: string; excludedMembers: string[]; amount: number; date: string };
export type ReservePlan = {
  inserts: ReserveGroup[];
  updates: { id: string; amount: number; date: string }[];
  removes: string[]; // 軟刪除
};

export function planReserveSync(existing: ExistingReserve[], desired: ReserveGroup[]): ReservePlan {
  const plan: ReservePlan = { inserts: [], updates: [], removes: [] };
  const byKey = new Map<string, ExistingReserve[]>();
  for (const e of existing) {
    const k = groupKey(e.excludedMembers);
    byKey.set(k, [...(byKey.get(k) ?? []), e]);
  }
  for (const d of desired) {
    const k = groupKey(d.excludedMembers);
    const list = byKey.get(k) ?? [];
    const keep = list.shift();
    byKey.set(k, list);
    if (!keep) plan.inserts.push(d);
    else if (keep.amount !== d.amount || keep.date !== d.date) plan.updates.push({ id: keep.id, amount: d.amount, date: d.date });
  }
  for (const leftovers of byKey.values()) for (const e of leftovers) plan.removes.push(e.id);
  return plan;
}
