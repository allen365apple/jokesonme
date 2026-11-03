import Link from "next/link";
import TopBar from "@/components/top-bar";
import type { UserRow } from "@/lib/auth/users";

// Google Sheet 的「財務預估」分頁（預估留在 Sheet 編輯，2026-10-03 Jesse 決定）
export const FORECAST_URL = "https://docs.google.com/spreadsheets/d/1sM-ST9lTjvCk7a0ppjSX48-zvhSOc16oYXEaVp3qisI/edit";

export type FinanceTab = "overview" | "shows" | "inbox" | "log";

// 財務各頁共用頁首：頂列＋分頁（2026-11-03 改版：總覽／演出收支／待確認／紀錄；匯入頁已移除，改由待確認佇列取代）
export default function FinanceHead({ me, active, title, sub, pendingCount, actions }: {
  me: UserRow; active: FinanceTab; title: string; sub?: React.ReactNode; pendingCount?: number; actions?: React.ReactNode;
}) {
  const tab = (key: FinanceTab, href: string, label: string, count?: number) => (
    <Link className={active === key ? "on" : ""} href={href} aria-current={active === key ? "page" : undefined}>
      {label}{count ? <span className="count">{count}</span> : null}
    </Link>
  );
  return (
    <>
      <TopBar me={me} title={title} sub={sub} actions={actions} />
      <nav className="seg-tabs" aria-label="財務分頁">
        {tab("overview", "/finance", "總覽")}
        {tab("shows", "/finance/shows", "演出收支")}
        {tab("inbox", "/finance/inbox", "待確認", pendingCount)}
        {tab("log", "/finance/log", "紀錄")}
      </nav>
    </>
  );
}
