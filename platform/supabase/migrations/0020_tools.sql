-- 最後更新：2026-11-19 13:49
-- 誰幫忙的：Claude Code（Claude Opus 5.5）
-- 修改摘要：新增工具箱資料表 tools、同區調順序函式 tools_move 與第一版 11 筆工具。
--
-- 0020 工具箱（change tools-directory；spec tools-directory）
-- 工具清單存在 Supabase。下架是軟刪除（寫 archived_at），復原清空；沒有 DELETE 權限。
-- 欄位檢查（長度、分區、網址開頭）在 lib/tools.ts 的 validateToolInput 也會先擋一次，這裡是第二道。

create table tools (
  id          uuid primary key default gen_random_uuid(),
  section     text not null check (section in ('internal', 'live', 'other')),
  icon        text not null check (char_length(btrim(icon)) between 1 and 8),
  name        text not null check (char_length(btrim(name)) between 1 and 40),
  description text not null default '' check (char_length(description) <= 120),
  url         text not null check (url ~ '^https?://'),
  position    int  not null default 0,                 -- 同區排序，小的在前；不設唯一，對調時才不會撞
  archived_at timestamptz,                             -- null＝上架中
  created_by  text not null,                           -- 'user:<LINE userId>' 或 'system:seed'
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index tools_section_idx on tools (section, position) where archived_at is null;

alter table tools enable row level security;
revoke all on tools from public, anon, authenticated, service_role;
grant select, insert, update on tools to service_role;   -- 不給 DELETE／TRUNCATE
select attach_audit('tools');

-- 同區上下調順序：在同一區、未下架的工具裡找相鄰那一筆，兩筆 position 在同一交易對調。
-- 已在最前（往上）或最後（往下）時不變；已下架的工具不參與。
create or replace function tools_move(p_id uuid, p_dir int) returns void
language plpgsql as $$
declare
  cur tools;
  nb  tools;
begin
  if p_dir is null or p_dir not in (-1, 1) then
    raise exception 'tools_move: p_dir must be -1 or 1';
  end if;
  select * into cur from tools where id = p_id and archived_at is null;
  if not found then
    return;
  end if;
  -- 鎖住同區上架中的工具，兩人同時調順序時排隊進行，不會出現重複 position
  perform 1 from tools where section = cur.section and archived_at is null order by position for update;
  select * into cur from tools where id = p_id and archived_at is null;
  if not found then
    return;
  end if;
  if p_dir < 0 then
    select * into nb from tools
     where section = cur.section and archived_at is null and id <> cur.id
       and (position < cur.position or (position = cur.position and id < cur.id))
     order by position desc, id desc limit 1;
  else
    select * into nb from tools
     where section = cur.section and archived_at is null and id <> cur.id
       and (position > cur.position or (position = cur.position and id > cur.id))
     order by position asc, id asc limit 1;
  end if;
  if not found then
    return;
  end if;
  if nb.position = cur.position then
    -- 兩筆 position 相同（同時新增可能發生）：把要移動的那筆往指定方向挪一格就能分出先後
    update tools set position = cur.position + p_dir, updated_at = now() where id = cur.id;
    return;
  end if;
  update tools set position = nb.position,  updated_at = now() where id = cur.id;
  update tools set position = cur.position, updated_at = now() where id = nb.id;
end $$;

-- 函式只給後端（service_role）呼叫；PostgREST 預設會把 execute 給 public，要明確收回
revoke all on function tools_move(uuid, int) from public, anon, authenticated;
grant execute on function tools_move(uuid, int) to service_role;

-- 第一版 11 筆（來源：GitHub Pages 工具箱首頁 jokes-on-me/index.html；「看笑內部系統」「收支／財務記錄」指回平台本身，不列）
do $$
begin
  perform set_config('app.actor', 'migration', true);
  insert into tools (section, icon, name, description, url, position, created_by) values
    ('internal', '🦦', '陪伴動物心理測驗', '測你怎麼陪人、想被怎麼陪。8 題生成 16 種台灣關係現場感的陪伴動物。',
      'https://allen365apple.github.io/jokes-on-me/companion-animals.html', 1, 'system:seed'),
    ('internal', '💌', '走心分享預覽', '當月會員電子報預覽圖下載＋全文閱讀。每位成員一張 IG 預覽圖可下載。',
      'https://allen365apple.github.io/jokes-on-me/member-only-content/latest.html', 2, 'system:seed'),
    ('internal', '🎨', '社群素材產生器', '快速做出看我笑話風格的貼文圖片素材，發文不用再等設計。',
      'https://jessechen-humanoid.github.io/jokesonme-post/', 3, 'system:seed'),
    ('internal', '📋', '網頁製作須知', '做現場喜劇投影網頁的重點摘要，可下載完整版規範。',
      'https://allen365apple.github.io/jokes-on-me/web-guide.html', 4, 'system:seed'),
    ('live', '💗', '看我戀愛', '現場即興劇投影、選角、觀眾投稿與答案抽選工具。',
      'https://allen365apple.github.io/jokes-on-me/love-improv/index.html', 1, 'system:seed'),
    ('live', '⚔️', '看我笑話現場投票', '攻隊對受隊。觀眾手機一場一票，最後一起揭曉勝隊。',
      'https://allen365apple.github.io/jokes-on-me/live-vote/index.html', 2, 'system:seed'),
    ('live', '🀄', '看我摸牌', '即興劇麻將抽牌機。空白鍵抽一張臺灣麻將，顯示牌面與唸法。',
      'https://allen365apple.github.io/jokes-on-me/mahjong-draw.html', 3, 'system:seed'),
    ('live', '🕺', '看我動作片', '即興劇肢體動作抽籤機。空白鍵抽一個全身動作，演員把它融進劇情。',
      'https://allen365apple.github.io/jokes-on-me/action-draw.html', 4, 'system:seed'),
    ('live', '🎫', '現場抽籤機', '觀眾掃 QR Code 填表單，現場隨機抽出笑ㄟ留言，同回合不重複。',
      'https://allen365apple.github.io/jokes-on-me/comment-lottery.html', 5, 'system:seed'),
    ('live', '❓', '現場問答系統 by 支薪好友', '專場即時問答：主控台出題、大螢幕顯示與逐題回顧、觀眾排行榜。',
      'https://allen365apple.github.io/jokes-on-me/fwb-quiz/home.html', 6, 'system:seed'),
    ('other', '📅', '看笑演出行事曆（公開）', '觀眾也可以訂閱的公開日曆。',
      'https://calendar.google.com/calendar/embed?src=b74923a589b7be6546e3dc7be18121230e2f5cf67cd76d88482ca535dbd3dd9d%40group.calendar.google.com&ctz=Asia%2FTaipei', 1, 'system:seed');
end $$;

insert into _migrations (name) values ('0020_tools') on conflict do nothing;
