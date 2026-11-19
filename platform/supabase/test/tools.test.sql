-- 最後更新：2026-11-19 13:49
-- 誰幫忙的：Claude Code（Claude Opus 5.5）
-- 修改摘要：新增工具箱資料表的本機資料庫測試（種子、網址檢查、調順序、權限）。
--
-- 本機資料庫測試：工具箱（change tools-directory tasks 1.1–1.3）
\set ON_ERROR_STOP on

-- 種子：共 11 筆，三區 4／6／1，全部 https，全部上架中，created_by 是 system:seed（要在其他測試寫入前檢查）
do $$
begin
  if (select count(*) from tools) <> 11 then raise exception 'FAIL: expected 11 seeded tools, got %', (select count(*) from tools); end if;
  if (select count(*) from tools where section = 'internal') <> 4 then raise exception 'FAIL: internal count'; end if;
  if (select count(*) from tools where section = 'live') <> 6 then raise exception 'FAIL: live count'; end if;
  if (select count(*) from tools where section = 'other') <> 1 then raise exception 'FAIL: other count'; end if;
  if exists (select 1 from tools where url !~ '^https://') then raise exception 'FAIL: seeded url not https'; end if;
  if exists (select 1 from tools where archived_at is not null) then raise exception 'FAIL: seeded tool archived'; end if;
  if exists (select 1 from tools where created_by <> 'system:seed') then raise exception 'FAIL: seed created_by'; end if;
  if (select string_agg(name, ',' order by position) from tools where section = 'live')
     <> '看我戀愛,看我笑話現場投票,看我摸牌,看我動作片,現場抽籤機,現場問答系統 by 支薪好友' then
    raise exception 'FAIL: live seed order %', (select string_agg(name, ',' order by position) from tools where section = 'live');
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
    insert into tools (section, icon, name, url, created_by) values ('other', '🔧', '無 actor', 'https://example.com', 'x');
    raise exception 'FAIL: insert without actor succeeded';
  exception when others then
    if sqlerrm not like 'audit: missing actor%' then raise; end if;
  end;
end $$;

begin;
set local app.actor = 'user:U_a';

-- 網址只收 http(s)、分區白名單、長度檢查都由資料庫擋
do $$
begin
  begin
    insert into tools (section, icon, name, url, created_by) values ('other', '🔧', '壞網址', 'javascript:alert(1)', 'user:U_a');
    raise exception 'FAIL: javascript: url accepted';
  exception when check_violation then null;
  end;
  begin
    insert into tools (section, icon, name, url, created_by) values ('other', '🔧', '壞網址', 'ftp://example.com/file', 'user:U_a');
    raise exception 'FAIL: ftp url accepted';
  exception when check_violation then null;
  end;
  begin
    insert into tools (section, icon, name, url, created_by) values ('nope', '🔧', '壞分區', 'https://example.com', 'user:U_a');
    raise exception 'FAIL: unknown section accepted';
  exception when check_violation then null;
  end;
  begin
    insert into tools (section, icon, name, url, created_by) values ('other', '🔧', repeat('字', 41), 'https://example.com', 'user:U_a');
    raise exception 'FAIL: 41-char name accepted';
  exception when check_violation then null;
  end;
  begin
    insert into tools (section, icon, name, url, created_by) values ('other', '', '空圖示', 'https://example.com', 'user:U_a');
    raise exception 'FAIL: empty icon accepted';
  exception when check_violation then null;
  end;
  begin
    insert into tools (section, icon, name, description, url, created_by) values ('other', '🔧', '說明太長', repeat('字', 121), 'https://example.com', 'user:U_a');
    raise exception 'FAIL: 121-char description accepted';
  exception when check_violation then null;
  end;
  -- http 可以
  insert into tools (section, icon, name, url, position, created_by) values ('other', '🔧', 'http 工具', 'http://example.com/a?b=1', 2, 'user:U_a');
end $$;

-- tools_move：往下對調、最前往上不變、最後往下不變、跳過已下架
do $$
declare
  love uuid := (select id from tools where name = '看我戀愛');
  qa   uuid := (select id from tools where name = '現場問答系統 by 支薪好友');
  draw uuid := (select id from tools where name = '現場抽籤機');
  ord  text;
begin
  perform tools_move(love, 1);
  ord := (select string_agg(name, ',' order by position) from tools where section = 'live' and archived_at is null);
  if ord not like '看我笑話現場投票,看我戀愛,看我摸牌,%' then raise exception 'FAIL: move down %', ord; end if;

  perform tools_move(love, -1);
  perform tools_move(love, -1);   -- 已在最前，不變也不報錯
  ord := (select string_agg(name, ',' order by position) from tools where section = 'live' and archived_at is null);
  if ord not like '看我戀愛,看我笑話現場投票,看我摸牌,%' then raise exception 'FAIL: first move up should be no-op %', ord; end if;

  perform tools_move(qa, 1);      -- 已在最後，不變
  if (select name from tools where section = 'live' and archived_at is null order by position desc limit 1) <> '現場問答系統 by 支薪好友' then
    raise exception 'FAIL: last move down should be no-op';
  end if;

  -- 下架現場抽籤機後，現場問答系統往上要跟看我動作片對調（跳過已下架的那筆）
  update tools set archived_at = now() where id = draw;
  perform tools_move(qa, -1);
  ord := (select string_agg(name, ',' order by position) from tools where section = 'live' and archived_at is null);
  if ord <> '看我戀愛,看我笑話現場投票,看我摸牌,現場問答系統 by 支薪好友,看我動作片' then raise exception 'FAIL: move skipping archived %', ord; end if;

  -- 別區不受影響
  if (select string_agg(name, ',' order by position) from tools where section = 'internal')
     <> '陪伴動物心理測驗,走心分享預覽,社群素材產生器,網頁製作須知' then
    raise exception 'FAIL: other section changed';
  end if;

  -- 已下架的工具呼叫 tools_move 不動
  perform tools_move(draw, -1);
  if (select position from tools where id = draw) <> 5 then raise exception 'FAIL: archived tool moved'; end if;

  -- 方向只能是 -1 或 1
  begin
    perform tools_move(love, 2);
    raise exception 'FAIL: dir 2 accepted';
  exception when raise_exception then
    if sqlerrm not like 'tools_move:%' then raise; end if;
  end;
end $$;
commit;

-- 寫入都有操作紀錄，且記得是誰改的
do $$
begin
  if (select count(*) from audit_log where table_name = 'tools' and actor = 'migration') < 11 then raise exception 'FAIL: seed not audited'; end if;
  if (select count(*) from audit_log where table_name = 'tools' and actor = 'user:U_a') < 1 then raise exception 'FAIL: user writes not audited'; end if;
end $$;

-- service_role 可讀寫但不能硬刪；anon、authenticated 讀寫都不行、也不能呼叫函式
set role service_role;
do $$
begin
  perform 1 from tools limit 1;
  begin delete from tools; raise exception 'FAIL: service_role hard-deleted tools';
  exception when insufficient_privilege then null; end;
  begin truncate tools; raise exception 'FAIL: service_role truncated tools';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set role anon;
do $$
begin
  begin perform 1 from tools; raise exception 'FAIL: anon can read tools';
  exception when insufficient_privilege then null; end;
  begin insert into tools (section, icon, name, url, created_by) values ('other', '🔧', 'x', 'https://example.com', 'x');
    raise exception 'FAIL: anon can insert tools';
  exception when insufficient_privilege then null; end;
  begin perform tools_move(gen_random_uuid(), 1); raise exception 'FAIL: anon can call tools_move';
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
  begin perform tools_move(gen_random_uuid(), 1); raise exception 'FAIL: authenticated can call tools_move';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
\echo 'TOOLS TESTS PASSED'
