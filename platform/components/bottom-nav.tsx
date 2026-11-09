"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconCalendar, IconHome, IconMic, IconMoney, IconNote, IconTicket } from "@/components/icons";

// 手機底部分頁列、電腦左側欄（spec mobile-first-ui「Icon navigation」）。
// 2026-11-03 改版：首頁／演出／財務／行事曆／筆記；待辦退出導覽（/todos 路由保留，從首頁「全部待辦」進）。「靈感」畫面上叫「筆記」，路徑不變。
// 2026-11-09 開發（change dev-tickets；原名「開發票」，11/09 改名避免誤會成發票）：只在電腦版左側欄出現（deskOnly），手機底部導覽不加，/tickets 仍可直接開。
const ITEMS = [
  { href: "/home", label: "首頁", Icon: IconHome, areas: ["admin", "member"] },
  { href: "/shows", label: "演出", Icon: IconMic, areas: ["admin", "member"] },
  { href: "/finance", label: "財務", Icon: IconMoney, areas: ["admin", "member", "finance_partner"] },
  { href: "/calendar", label: "行事曆", Icon: IconCalendar, areas: ["admin", "member"] },
  { href: "/ideas", label: "筆記", Icon: IconNote, areas: ["admin", "member"] },
  { href: "/tickets", label: "開發", Icon: IconTicket, areas: ["admin", "member"], deskOnly: true },
];

export default function BottomNav({ role }: { role: string }) {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="主要導覽">
      <div className="nav-inner">
        <div className="nav-brand">看我笑話</div>
        {ITEMS.filter((i) => i.areas.includes(role)).map(({ href, label, Icon, deskOnly }) => {
          const on = path.startsWith(href);
          return (
            <Link key={href} href={href} className={[on ? "on" : "", deskOnly ? "desk-only" : ""].filter(Boolean).join(" ") || undefined} aria-current={on ? "page" : undefined}>
              <Icon />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
