import { redirect } from "next/navigation";

// 舊網址：收支頁的下拉選單已改成演出收支列表＋詳細頁（2026-11-03 改版）
export default async function TransactionsRedirect({ searchParams }: PageProps<"/finance/transactions">) {
  const sp = await searchParams;
  redirect(typeof sp.show === "string" && sp.show ? `/finance/shows/${encodeURIComponent(sp.show)}` : "/finance/shows");
}
