-- 最後更新：2026-11-19 15:09
-- 誰幫忙的：Claude Code（Claude Opus 5.5）
-- 修改摘要：區塊改成可管理的資料表 tool_sections，tools 改用 section_id；排序改成整份順序的 tools_reorder／tool_sections_reorder（取代 tools_move）；預設區塊順序現場演出工具、團隊內部工具、其他。
--
-- 0020 工具箱（change tools-directory；spec tools-directory）
-- 區塊與工具都存在 Supabase。刪除區塊、下架工具都是軟刪除（寫 archived_at）；沒有 DELETE 權限。
-- 欄位檢查（長度、網址開頭）在 lib/tools.ts 也會先擋一次，這裡是第二道。
-- 「區塊裡還有上架中的工具／最後一個區塊不能刪」在 lib/tools.ts 的 deleteSection 檢查。

create table tool_sections (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 20),
  position    int  not null default 0,                 -- 區塊排序，小的在前
  archived_at timestamptz,                             -- null＝使用中；刪除區塊＝寫入時間
  created_by  text not null,                           -- 'user:<LINE userId>' 或 'system:seed'
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index tool_sections_position_idx on tool_sections (position) where archived_at is null;

alter table tool_sections enable row level security;
revoke all on tool_sections from public, anon, authenticated, service_role;
grant select, insert, update on tool_sections to service_role;   -- 不給 DELETE／TRUNCATE
select attach_audit('tool_sections');

create table tools (
  id          uuid primary key default gen_random_uuid(),
  section_id  uuid not null references tool_sections (id),
  icon        text not null check (char_length(btrim(icon)) between 1 and 8),
  name        text not null check (char_length(btrim(name)) between 1 and 40),
  description text not null default '' check (char_length(description) <= 120),
  url         text not null check (url ~ '^https?://'),
  position    int  not null default 0,                 -- 同區排序，小的在前；不設唯一，整份重排時才不會撞
  archived_at timestamptz,                             -- null＝上架中
  created_by  text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index tools_section_idx on tools (section_id, position) where archived_at is null;

alter table tools enable row level security;
revoke all on tools from public, anon, authenticated, service_role;
grant select, insert, update on tools to service_role;   -- 不給 DELETE／TRUNCATE
select attach_audit('tools');

-- 整份順序：拖曳一次可能跨好幾格，所以送整份 id 陣列，同一交易把 position 設成 1..n。
-- 先鎖住該區上架中的工具，再比對集合；p_ids 跟目前上架中的 id 不完全相同（少、多、重複、已下架、別區）
-- 就 raise 'stale order'，一筆都不改。
create or replace function tools_reorder(p_section uuid, p_ids uuid[]) returns void
language plpgsql as $$
declare
  cur uuid[];
begin
  perform 1 from tools where section_id = p_section and archived_at is null order by id for update;
  select coalesce(array_agg(id order by id), '{}') into cur
    from tools where section_id = p_section and archived_at is null;
  if p_ids is null
     or cardinality(p_ids) <> cardinality(cur)
     or (select count(distinct x) from unnest(p_ids) x) <> cardinality(p_ids)
     or (select coalesce(array_agg(x order by x), '{}') from unnest(p_ids) x) <> cur then
    raise exception 'stale order';
  end if;
  update tools t set position = o.ord, updated_at = now()
    from unnest(p_ids) with ordinality as o(id, ord)
   where t.id = o.id and t.position is distinct from o.ord;
end $$;

-- 區塊的整份順序，規則同上，對象是使用中的區塊。
create or replace function tool_sections_reorder(p_ids uuid[]) returns void
language plpgsql as $$
declare
  cur uuid[];
begin
  perform 1 from tool_sections where archived_at is null order by id for update;
  select coalesce(array_agg(id order by id), '{}') into cur
    from tool_sections where archived_at is null;
  if p_ids is null
     or cardinality(p_ids) <> cardinality(cur)
     or (select count(distinct x) from unnest(p_ids) x) <> cardinality(p_ids)
     or (select coalesce(array_agg(x order by x), '{}') from unnest(p_ids) x) <> cur then
    raise exception 'stale order';
  end if;
  update tool_sections s set position = o.ord, updated_at = now()
    from unnest(p_ids) with ordinality as o(id, ord)
   where s.id = o.id and s.position is distinct from o.ord;
end $$;

-- 函式只給後端（service_role）呼叫；PostgREST 預設會把 execute 給 public，要明確收回
revoke all on function tools_reorder(uuid, uuid[]) from public, anon, authenticated;
grant execute on function tools_reorder(uuid, uuid[]) to service_role;
revoke all on function tool_sections_reorder(uuid[]) from public, anon, authenticated;
grant execute on function tool_sections_reorder(uuid[]) to service_role;

-- 第一版：3 個區塊、10 個工具（來源：GitHub Pages 工具箱首頁 jokes-on-me/index.html；
-- 「看笑內部系統」「收支／財務記錄」指回平台本身、「陪伴動物心理測驗」柏文決定不列）
do $$
declare
  s_live     uuid;
  s_internal uuid;
  s_other    uuid;
begin
  perform set_config('app.actor', 'migration', true);
  insert into tool_sections (name, position, created_by) values ('現場演出工具', 1, 'system:seed') returning id into s_live;
  insert into tool_sections (name, position, created_by) values ('團隊內部工具', 2, 'system:seed') returning id into s_internal;
  insert into tool_sections (name, position, created_by) values ('其他', 3, 'system:seed') returning id into s_other;

  insert into tools (section_id, icon, name, description, url, position, created_by) values
    (s_live, '💗', '看我戀愛', '現場即興劇投影、選角、觀眾投稿與答案抽選工具。',
      'https://allen365apple.github.io/jokes-on-me/love-improv/index.html', 1, 'system:seed'),
    (s_live, '⚔️', '看我笑話現場投票', '攻隊對受隊。觀眾手機一場一票，最後一起揭曉勝隊。',
      'https://allen365apple.github.io/jokes-on-me/live-vote/index.html', 2, 'system:seed'),
    (s_live, '🀄', '看我摸牌', '即興劇麻將抽牌機。空白鍵抽一張臺灣麻將，顯示牌面與唸法。',
      'https://allen365apple.github.io/jokes-on-me/mahjong-draw.html', 3, 'system:seed'),
    (s_live, '🕺', '看我動作片', '即興劇肢體動作抽籤機。空白鍵抽一個全身動作，演員把它融進劇情。',
      'https://allen365apple.github.io/jokes-on-me/action-draw.html', 4, 'system:seed'),
    (s_live, '🎫', '現場抽籤機', '觀眾掃 QR Code 填表單，現場隨機抽出笑ㄟ留言，同回合不重複。',
      'https://allen365apple.github.io/jokes-on-me/comment-lottery.html', 5, 'system:seed'),
    (s_live, '❓', '現場問答系統 by 支薪好友', '專場即時問答：主控台出題、大螢幕顯示與逐題回顧、觀眾排行榜。',
      'https://allen365apple.github.io/jokes-on-me/fwb-quiz/home.html', 6, 'system:seed'),
    (s_internal, '💌', '走心分享預覽', '當月會員電子報預覽圖下載＋全文閱讀。每位成員一張 IG 預覽圖可下載。',
      'https://allen365apple.github.io/jokes-on-me/member-only-content/latest.html', 1, 'system:seed'),
    (s_internal, '🎨', '社群素材產生器', '快速做出看我笑話風格的貼文圖片素材，發文不用再等設計。',
      'https://jessechen-humanoid.github.io/jokesonme-post/', 2, 'system:seed'),
    (s_internal, '📋', '網頁製作須知', '做現場喜劇投影網頁的重點摘要，可下載完整版規範。',
      'https://allen365apple.github.io/jokes-on-me/web-guide.html', 3, 'system:seed'),
    (s_other, '📅', '看笑演出行事曆（公開）', '觀眾也可以訂閱的公開日曆。',
      'https://calendar.google.com/calendar/embed?src=b74923a589b7be6546e3dc7be18121230e2f5cf67cd76d88482ca535dbd3dd9d%40group.calendar.google.com&ctz=Asia%2FTaipei', 1, 'system:seed');
end $$;

insert into _migrations (name) values ('0020_tools') on conflict do nothing;
