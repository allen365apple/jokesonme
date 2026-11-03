import { redirect } from "next/navigation";

// 舊網址：分析頁已併入財務總覽（2026-11-03 改版）
export default async function AnalyticsRedirect({ searchParams }: PageProps<"/finance/analytics">) {
  const sp = await searchParams;
  redirect(typeof sp.year === "string" ? `/finance?year=${encodeURIComponent(sp.year)}` : "/finance");
}
