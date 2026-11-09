// 開發資料庫的種子資料（spec local-dev-environment「Development seed data」）。
// 只在 JK_ENV=development 時執行；只新增或更新固定 id 的假資料，從不刪除任何資料。
// 最壞情況（連錯資料庫）也只是多出幾列假資料，可以手動移除。
// 用法：npm run db:seed-dev（從 platform/.env.local 讀 JK_ENV 與 SUPABASE_DB_URL）
import pg from "pg";

if (process.env.JK_ENV !== "development") {
  console.error("拒絕執行：種子資料只能寫進開發用資料庫。請確認 platform/.env.local 是開發用的金鑰，並有 JK_ENV=development。");
  process.exit(1);
}
const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("拒絕執行：沒有設定 SUPABASE_DB_URL（開發用 Supabase 的資料庫連線字串）。");
  process.exit(1);
}

const USERS = [
  { id: "dev-admin", name: "開發管理員", role: "admin" },
  { id: "dev-member", name: "開發成員", role: "member" },
  { id: "dev-finance", name: "開發財務夥伴", role: "finance_partner" },
] as const;

const TICKETS = [
  {
    id: "00000000-0000-4000-8000-00000000d001",
    title: "範例：財務頁加匯出按鈕",
    category: "feature",
    description: "現在怎樣：財務頁只能看，不能匯出。\n\n希望變成：可以下載 Excel。\n\n做完看得到什麼（驗收）：財務頁右上角有「匯出」，點了會下載檔案。\n\n誰會用、誰看得到：管理員與成員。\n",
    reporter: "dev-member",
  },
  {
    id: "00000000-0000-4000-8000-00000000d002",
    title: "範例：行事曆週末顏色太淡",
    category: "bug",
    description: "現在怎樣：週末日期在手機上幾乎看不到。\n\n希望變成：週末日期跟平日一樣清楚。\n\n做完看得到什麼（驗收）：手機版行事曆週六日的數字清楚可讀。\n\n誰會用、誰看得到：所有成員。\n",
    reporter: "dev-admin",
  },
] as const;

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query("begin");
  await client.query("set local app.actor = 'dev-seed'");
  for (const u of USERS) {
    await client.query(
      `insert into users (id, display_name, member_name, role, status, approved_at)
       values ($1, $2, $2, $3, 'approved', now())
       on conflict (id) do update set display_name = excluded.display_name, member_name = excluded.member_name,
         role = excluded.role, status = 'approved'`,
      [u.id, u.name, u.role],
    );
  }
  for (const t of TICKETS) {
    const { rowCount } = await client.query(
      `insert into dev_tickets (id, title, category, description, reporter_id)
       values ($1, $2, $3, $4, $5) on conflict (id) do nothing`,
      [t.id, t.title, t.category, t.description, t.reporter],
    );
    if (rowCount) {
      await client.query(`insert into dev_ticket_events (ticket_id, actor_id, action) values ($1, $2, 'create')`, [t.id, t.reporter]);
    }
  }
  await client.query("commit");
  console.log("種子資料完成：dev-admin、dev-member、dev-finance 與 2 張範例票。");
  console.log("本機登入：http://localhost:3000/api/dev/login?as=dev-member&next=/tickets");
} catch (err) {
  await client.query("rollback");
  throw err;
} finally {
  await client.end();
}
