-- 最後更新：2026-11-19 15:09
-- 誰幫忙的：Claude Code（Claude Opus 5.5）
-- 修改摘要：改測新版工具箱：區塊表 tool_sections、種子順序與 6／3／1、整份排序函式 tools_reorder／tool_sections_reorder 的套用與拒絕、權限與稽核。
--
-- 本機資料庫測試：工具箱（change tools-directory tasks 5.1）
\set ON_ERROR_STOP on

-- 種子：3 個區塊依序是現場演出工具、團隊內部工具、其他；10 個工具 6／3／1，全部 https、上架中、system:seed
do $$
begin
  if (select string_agg(name, ',' order by position) from tool_sections where archived_at is null)
     <> '現場演出工具,團隊內部工具,其他' then
    raise exception 'FAIL: seeded section order %', (select string_agg(name, ',' order by position) from tool_sections);
  end if;
  if (select count(*) from tool_sections) <> 3 then raise exception 'FAIL: expected 3 seeded sections'; end if;
  if exists (select 1 from tool_sections where created_by <> 'system:seed') then raise exception 'FAIL: section seed created_by'; end if;
  if (select count(*) from tools) <> 10 then raise exception 'FAIL: expected 10 seeded tools, got %', (select count(*) from tools); end if;
  if (select string_agg(cnt::text, '/' order by sp) from (
        select s.position sp, count(t.id) cnt from tool_sections s left join tools t on t.section_id = s.id group by s.position) x)
     <> '6/3/1' then
    raise exception 'FAIL: tools per section should be 6/3/1';
  end if;
  if exists (select 1 from tools where url !~ '^https://') then raise exception 'FAIL: seeded url not https'; end if;
  if exists (select 1 from tools where archived_at is not null) then raise exception 'FAIL: seeded tool archived'; end if;
  if exists (select 1 from tools where created_by <> 'system:seed') then raise exception 'FAIL: seed created_by'; end if;
  if (select string_agg(t.name, ',' order by t.position) from tools t join tool_sections s on s.id = t.section_id where s.name = '現場演出工具')
     <> '看我戀愛,看我笑話現場投票,看我摸牌,看我動作片,現場抽籤機,現場問答系統 by 支薪好友' then
    raise exception 'FAIL: live seed order';
  end if;
  if (select string_agg(t.name, ',' order by t.position) from tools t join tool_sections s on s.id = t.section_id where s.name = '團隊內部工具')
     <> '走心分享預覽,社群素材產生器,網頁製作須知' then
    raise exception 'FAIL: internal seed order';
  end if;
  if (select description from tools where name = '看我笑話現場投票') not like '攻隊對受隊%' then
    raise exception 'FAIL: live-vote description should use current team names';
  end if;
  if (select url from tools where name = '看我摸牌') <> 'https://allen365apple.github.io/jokes-on-me/mahjong-draw.html' then
    raise exception 'FAIL: mahjong url';
  end if;
  if (select url from tools where name = '看笑演出行事曆（公開）') like '%&amp;%' then
    raise exception 'FAIL: calendar url still html-escaped';
  end if;
end $$;

-- 沒有 actor 不能寫
do $$
begin
  begin
    insert into tool_sections (name, created_by) values ('無 actor', 'x');
    raise exception 'FAIL: section insert without actor succeeded';
  exception when others then
    if sqlerrm not like 'audit: missing actor%' then raise; end if;
  end;
  begin
    insert into tools (section_id, icon, name, url, created_by)
      values ((select id from tool_sections where name = '其他'), '🔧', '無 actor', 'https://example.com', 'x');
    raise exception 'FAIL: tool insert without actor succeeded';
  exception when others then
    if sqlerrm not like 'audit: missing actor%' then raise; end if;
  end;
end $$;

begin;
set local app.actor = 'user:U_a';

-- 欄位檢查由資料庫再擋一次：網址只收 http(s)、長度、區塊名稱、區塊必須存在
do $$
declare
  other uuid := (select id from tool_sections where name = '其他');
begin
  begin
    insert into tools (section_id, icon, name, url, created_by) values (other, '🔧', '壞網址', 'javascript:alert(1)', 'user:U_a');
    raise exception 'FAIL: javascript: url accepted';
  exception when check_violation then null;
  end;
  begin
    insert into tools (section_id, icon, name, url, created_by) values (other, '🔧', '壞網址', 'ftp://example.com/file', 'user:U_a');
    raise exception 'FAIL: ftp url accepted';
  exception when check_violation then null;
  end;
  begin
    insert into tools (section_id, icon, name, url, created_by) values (gen_random_uuid(), '🔧', '沒有這個區塊', 'https://example.com', 'user:U_a');
    raise exception 'FAIL: unknown section accepted';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into tools (section_id, icon, name, url, created_by) values (other, '🔧', repeat('字', 41), 'https://example.com', 'user:U_a');
    raise exception 'FAIL: 41-char name accepted';
  exception when check_violation then null;
  end;
  begin
    insert into tools (section_id, icon, name, url, created_by) values (other, '', '空圖示', 'https://example.com', 'user:U_a');
    raise exception 'FAIL: empty icon accepted';
  exception when check_violation then null;
  end;
  begin
    insert into tools (section_id, icon, name, description, url, created_by) values (other, '🔧', '說明太長', repeat('字', 121), 'https://example.com', 'user:U_a');
    raise exception 'FAIL: 121-char description accepted';
  exception when check_violation then null;
  end;
  begin
    insert into tool_sections (name, created_by) values (repeat('字', 21), 'user:U_a');
    raise exception 'FAIL: 21-char section name accepted';
  exception when check_violation then null;
  end;
  begin
    insert into tool_sections (name, created_by) values ('   ', 'user:U_a');
    raise exception 'FAIL: blank section name accepted';
  exception when check_violation then null;
  end;
  -- http 可以；20 字的區塊名稱可以
  insert into tools (section_id, icon, name, url, position, created_by) values (other, '🔧', 'http 工具', 'http://example.com/a?b=1', 2, 'user:U_a');
  insert into tool_sections (name, position, created_by) values (repeat('字', 20), 4, 'user:U_a');
end $$;

-- 小工具：呼叫排序函式，預期被拒絕（stale order）
create function pg_temp.expect_stale_tools(p_section uuid, p_ids uuid[]) returns void language plpgsql as $$
begin
  begin
    perform tools_reorder(p_section, p_ids);
  exception when raise_exception then
    if sqlerrm <> 'stale order' then raise; end if;
    return;
  end;
  raise exception 'FAIL: tools_reorder accepted %', p_ids;
end $$;
create function pg_temp.expect_stale_sections(p_ids uuid[]) returns void language plpgsql as $$
begin
  begin
    perform tool_sections_reorder(p_ids);
  exception when raise_exception then
    if sqlerrm <> 'stale order' then raise; end if;
    return;
  end;
  raise exception 'FAIL: tool_sections_reorder accepted %', p_ids;
end $$;

-- tools_reorder：整份順序套用；id 集合不符（少、多、重複、含已下架、含別區、null）一律拒絕且 position 不變
do $$
declare
  live  uuid := (select id from tool_sections where name = '現場演出工具');
  love  uuid := (select id from tools where name = '看我戀愛');
  vote  uuid := (select id from tools where name = '看我笑話現場投票');
  mj    uuid := (select id from tools where name = '看我摸牌');
  act   uuid := (select id from tools where name = '看我動作片');
  draw  uuid := (select id from tools where name = '現場抽籤機');
  qa    uuid := (select id from tools where name = '現場問答系統 by 支薪好友');
  guide uuid := (select id from tools where name = '網頁製作須知');
  snap  text;
begin
  -- spec「Drop a tool」：看我摸牌放到看我戀愛上面
  perform tools_reorder(live, array[mj, love, vote, act, draw, qa]);
  if (select string_agg(name, ',' order by position) from tools where section_id = live and archived_at is null)
     <> '看我摸牌,看我戀愛,看我笑話現場投票,看我動作片,現場抽籤機,現場問答系統 by 支薪好友' then
    raise exception 'FAIL: reorder not applied';
  end if;
  if (select string_agg(position::text, ',' order by position) from tools where section_id = live) <> '1,2,3,4,5,6' then
    raise exception 'FAIL: positions should be 1..n';
  end if;

  update tools set archived_at = now() where id = draw;
  snap := (select string_agg(id::text || ':' || position, ',' order by id) from tools);

  perform pg_temp.expect_stale_tools(live, array[mj, love, vote, qa, qa]);              -- 重複（數量對）
  perform pg_temp.expect_stale_tools(live, array[mj, love, vote, act, draw]);          -- 含已下架（數量對）
  perform pg_temp.expect_stale_tools(live, array[mj, love, vote, act, draw, qa]);      -- 含已下架（多一個）
  perform pg_temp.expect_stale_tools(live, array[mj, love, vote, act]);                -- 少一個
  perform pg_temp.expect_stale_tools(live, array[mj, love, vote, act, guide]);         -- 含別區（數量對）
  perform pg_temp.expect_stale_tools(live, array[mj, love, vote, act, qa, guide]);     -- 多一個（別區）
  perform pg_temp.expect_stale_tools(live, array[mj, love, vote, act, qa, gen_random_uuid()]);  -- 多一個（不存在）
  perform pg_temp.expect_stale_tools(live, null);
  if (select string_agg(id::text || ':' || position, ',' order by id) from tools) <> snap then
    raise exception 'FAIL: refused reorder changed positions';
  end if;

  -- 下架後的正確集合可以套用（已下架的不參與）
  perform tools_reorder(live, array[qa, mj, love, vote, act]);
  if (select string_agg(name, ',' order by position) from tools where section_id = live and archived_at is null)
     <> '現場問答系統 by 支薪好友,看我摸牌,看我戀愛,看我笑話現場投票,看我動作片' then
    raise exception 'FAIL: reorder after archive';
  end if;
  -- 別區不受影響
  if (select string_agg(t.name, ',' order by t.position) from tools t where t.section_id = (select section_id from tools where id = guide))
     <> '走心分享預覽,社群素材產生器,網頁製作須知' then
    raise exception 'FAIL: other section changed';
  end if;
  -- 空區塊送空陣列可以（不會出錯）
  perform tools_reorder((select id from tool_sections where name = repeat('字', 20)), '{}'::uuid[]);
end $$;

-- tool_sections_reorder：同樣規則，對象是使用中的區塊
do $$
declare
  live     uuid := (select id from tool_sections where name = '現場演出工具');
  internal uuid := (select id from tool_sections where name = '團隊內部工具');
  other    uuid := (select id from tool_sections where name = '其他');
  extra    uuid := (select id from tool_sections where name = repeat('字', 20));
  snap     text;
begin
  -- spec「Reorder sections with the keyboard」：團隊內部工具往上一格變第一
  perform tool_sections_reorder(array[internal, live, other, extra]);
  if (select string_agg(name, ',' order by position) from tool_sections where archived_at is null)
     <> '團隊內部工具,現場演出工具,其他,' || repeat('字', 20) then
    raise exception 'FAIL: section reorder not applied';
  end if;

  update tool_sections set archived_at = now() where id = extra;   -- 刪除區塊＝軟刪除
  snap := (select string_agg(id::text || ':' || position, ',' order by id) from tool_sections);
  perform pg_temp.expect_stale_sections(array[internal, live, other, extra]);           -- 含已刪除的區塊
  perform pg_temp.expect_stale_sections(array[internal, live, live]);                  -- 重複（數量對）
  perform pg_temp.expect_stale_sections(array[internal, live]);                        -- 少一個
  perform pg_temp.expect_stale_sections(array[internal, live, other, gen_random_uuid()]);   -- 多一個
  perform pg_temp.expect_stale_sections(null);
  if (select string_agg(id::text || ':' || position, ',' order by id) from tool_sections) <> snap then
    raise exception 'FAIL: refused section reorder changed positions';
  end if;
  perform tool_sections_reorder(array[live, internal, other]);
  if (select string_agg(name, ',' order by position) from tool_sections where archived_at is null)
     <> '現場演出工具,團隊內部工具,其他' then
    raise exception 'FAIL: section reorder back';
  end if;
end $$;
commit;

-- 寫入都有操作紀錄，且記得是誰改的
do $$
begin
  if (select count(*) from audit_log where table_name = 'tool_sections' and actor = 'migration') < 3 then raise exception 'FAIL: section seed not audited'; end if;
  if (select count(*) from audit_log where table_name = 'tools' and actor = 'migration') < 10 then raise exception 'FAIL: tool seed not audited'; end if;
  if (select count(*) from audit_log where table_name = 'tools' and actor = 'user:U_a') < 1 then raise exception 'FAIL: tool user writes not audited'; end if;
  if (select count(*) from audit_log where table_name = 'tool_sections' and actor = 'user:U_a') < 1 then raise exception 'FAIL: section user writes not audited'; end if;
end $$;

-- service_role 可讀寫、可呼叫排序函式，但不能硬刪；anon、authenticated 讀寫都不行、也不能呼叫函式
set role service_role;
do $$
declare
  live uuid := (select id from tool_sections where name = '現場演出工具');
begin
  perform 1 from tools limit 1;
  perform 1 from tool_sections limit 1;
  -- 順序不變時不寫入任何一筆（所以這裡沒有 actor 也不會被稽核擋）
  perform tools_reorder(live, (select array_agg(id order by position) from tools where section_id = live and archived_at is null));
  perform tool_sections_reorder((select array_agg(id order by position) from tool_sections where archived_at is null));
  begin delete from tools; raise exception 'FAIL: service_role hard-deleted tools';
  exception when insufficient_privilege then null; end;
  begin truncate tools; raise exception 'FAIL: service_role truncated tools';
  exception when insufficient_privilege then null; end;
  begin delete from tool_sections; raise exception 'FAIL: service_role hard-deleted tool_sections';
  exception when insufficient_privilege then null; end;
  begin truncate tool_sections; raise exception 'FAIL: service_role truncated tool_sections';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set role anon;
do $$
begin
  begin perform 1 from tools; raise exception 'FAIL: anon can read tools';
  exception when insufficient_privilege then null; end;
  begin perform 1 from tool_sections; raise exception 'FAIL: anon can read tool_sections';
  exception when insufficient_privilege then null; end;
  begin insert into tool_sections (name, created_by) values ('x', 'x'); raise exception 'FAIL: anon can insert tool_sections';
  exception when insufficient_privilege then null; end;
  begin perform tools_reorder(gen_random_uuid(), '{}'::uuid[]); raise exception 'FAIL: anon can call tools_reorder';
  exception when insufficient_privilege then null; end;
  begin perform tool_sections_reorder('{}'::uuid[]); raise exception 'FAIL: anon can call tool_sections_reorder';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set role authenticated;
do $$
begin
  begin perform 1 from tools; raise exception 'FAIL: authenticated can read tools';
  exception when insufficient_privilege then null; end;
  begin update tools set name = 'x'; raise exception 'FAIL: authenticated can update tools';
  exception when insufficient_privilege then null; end;
  begin perform 1 from tool_sections; raise exception 'FAIL: authenticated can read tool_sections';
  exception when insufficient_privilege then null; end;
  begin update tool_sections set name = 'x'; raise exception 'FAIL: authenticated can update tool_sections';
  exception when insufficient_privilege then null; end;
  begin perform tools_reorder(gen_random_uuid(), '{}'::uuid[]); raise exception 'FAIL: authenticated can call tools_reorder';
  exception when insufficient_privilege then null; end;
  begin perform tool_sections_reorder('{}'::uuid[]); raise exception 'FAIL: authenticated can call tool_sections_reorder';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
\echo 'TOOLS TESTS PASSED'
