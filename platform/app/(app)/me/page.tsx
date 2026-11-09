import Link from "next/link";
import TopBar from "@/components/top-bar";
import { IconChevron } from "@/components/icons";
import { getCurrentUser } from "@/lib/auth/current";
import { displayName } from "@/lib/auth/users";
import { redirect } from "next/navigation";
import { checkAccess } from "@/lib/auth/access";
import { listLinkedDevices } from "@/lib/claude/links";
import ClaudeLink from "@/components/claude-link";

const ROLE_LABEL = { admin: "管理員", member: "成員", finance_partner: "財務夥伴" } as const;

export default async function MePage() {
  const me = await getCurrentUser();
  if (!me || me.status !== "approved" || !me.role) redirect("/login");
  // 連結 Claude 只給能用開發頁的人（spec claude-ticket-tools「Link code issuance」）
  const canLink = checkAccess({ id: me.id, role: me.role, status: me.status }, "tickets").ok;
  const devices = canLink ? await listLinkedDevices(me.id) : [];
  return (
    <main className="page">
      <TopBar me={me} title={displayName(me)} sub={<>{ROLE_LABEL[me.role]}・LINE：{me.display_name}</>} />
      <div className="content">
        {me.role === "admin" ? (
          <>
            <section>
              <Link className="card link-row" href="/admin/users"><span className="row-main">登入核准</span><IconChevron className="chev" /></Link>
              <Link className="card link-row" href="/admin/template"><span className="row-main">月號模板</span><IconChevron className="chev" /></Link>
            </section>
          </>
        ) : null}
        {canLink ? <ClaudeLink devices={devices} /> : null}
        <form action="/api/auth/logout" method="post">
          <button className="btn btn-ghost btn-block" type="submit">登出</button>
        </form>
      </div>
    </main>
  );
}
