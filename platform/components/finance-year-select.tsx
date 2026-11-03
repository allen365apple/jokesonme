"use client";
import { useRouter } from "next/navigation";

/** 財務分析頁的年份切換：所有「年度」數字都只算選到的台北日曆年。 */
export default function FinanceYearSelect({ years, value, query }: { years: string[]; value: string; query?: string }) {
  const router = useRouter();
  return (
    <select
      className="select"
      aria-label="選擇年度"
      value={value}
      onChange={(e) => router.push(`/finance/analytics?year=${e.target.value}${query ? `&${query}` : ""}`)}
    >
      {years.map((y) => <option key={y} value={y}>{y} 年</option>)}
    </select>
  );
}
