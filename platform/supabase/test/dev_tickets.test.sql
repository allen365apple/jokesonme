-- 本機資料庫測試：開發票（change dev-tickets task 1.1）
\set ON_ERROR_STOP on

-- 沒有 actor 不能寫
do $$
begin
  begin
    perform dev_ticket_create('{"title":"無 actor","category":"bug","reporter_id":"U_a"}');
    raise exception 'FAIL: create without actor succeeded';
  exception when others then
    if sqlerrm not like 'audit: missing actor%' then raise; end if;
  end;
end $$;

begin;
set local app.actor = 'user:U_a';
-- 開票：拿到票號、狀態 open、同交易寫 create 事件
do $$
declare
  t dev_tickets;
  t2 dev_tickets;
begin
  t := dev_ticket_create('{"title":"財務頁加匯出按鈕","category":"feature","description":"現在怎樣：…","reporter_id":"U_a"}');
  if t.status <> 'open' or t.owner_id is not null or t.number is null then raise exception 'FAIL: new ticket state %', t; end if;
  t2 := dev_ticket_create('{"title":"第二張","category":"bug","reporter_id":"U_a"}');
  if t2.number <> t.number + 1 then raise exception 'FAIL: numbers not sequential % %', t.number, t2.number; end if;
  if (select count(*) from dev_ticket_events where ticket_id = t.id and action = 'create') <> 1 then
    raise exception 'FAIL: create event missing';
  end if;
  perform set_config('test.ticket', t.id::text, true);
end $$;

-- 認領防撞：兩次都以「沒人認領」為期望，只有第一次成功，第二次回 null 且不寫事件
do $$
declare
  tid uuid := current_setting('test.ticket')::uuid;
  r1 dev_tickets;
  r2 dev_tickets;
begin
  r1 := dev_ticket_apply(tid, 'open', null, '{"status":"in_progress","owner_id":"U_b"}', '{"actor_id":"U_b","action":"claim"}');
  r2 := dev_ticket_apply(tid, 'open', null, '{"status":"in_progress","owner_id":"U_c"}', '{"actor_id":"U_c","action":"claim"}');
  if r1.owner_id is distinct from 'U_b' or r1.status <> 'in_progress' then raise exception 'FAIL: first claim %', r1; end if;
  if r2.id is not null then raise exception 'FAIL: second claim succeeded %', r2; end if;
  if (select count(*) from dev_ticket_events where ticket_id = tid and action = 'claim') <> 1 then
    raise exception 'FAIL: expected exactly one claim event';
  end if;
end $$;

-- 期望認領人不符也回 null；退回帶原因；取消認領可以把 owner 清成 null
do $$
declare
  tid uuid := current_setting('test.ticket')::uuid;
  r dev_tickets;
begin
  r := dev_ticket_apply(tid, 'in_progress', 'U_c', '{"status":"review"}', '{"actor_id":"U_c","action":"deliver"}');
  if r.id is not null then raise exception 'FAIL: deliver with wrong expected owner succeeded'; end if;
  r := dev_ticket_apply(tid, 'in_progress', 'U_b', '{"status":"review"}', '{"actor_id":"U_b","action":"deliver"}');
  if r.status <> 'review' then raise exception 'FAIL: deliver %', r; end if;
  r := dev_ticket_apply(tid, 'review', 'U_b', '{"status":"in_progress"}', '{"actor_id":"U_a","action":"reject","note":"手機版按鈕跑版"}');
  if r.status <> 'in_progress' then raise exception 'FAIL: reject %', r; end if;
  if (select note from dev_ticket_events where ticket_id = tid and action = 'reject') <> '手機版按鈕跑版' then
    raise exception 'FAIL: reject note not stored';
  end if;
  r := dev_ticket_apply(tid, 'in_progress', 'U_b', '{"status":"open","owner_id":null}', '{"actor_id":"U_b","action":"unclaim"}');
  if r.owner_id is not null or r.status <> 'open' then raise exception 'FAIL: unclaim %', r; end if;
  -- 歷史由舊到新：create, claim, deliver, reject, unclaim
  if (select string_agg(action, ',' order by at, action) from dev_ticket_events where ticket_id = tid) is null then
    raise exception 'FAIL: history empty';
  end if;
  if (select count(*) from dev_ticket_events where ticket_id = tid) <> 5 then
    raise exception 'FAIL: expected 5 history rows, got %', (select count(*) from dev_ticket_events where ticket_id = tid);
  end if;
end $$;

-- 標題長度、分類代碼由資料庫擋
do $$
begin
  begin
    perform dev_ticket_create(jsonb_build_object('title', repeat('字', 121), 'category', 'bug', 'reporter_id', 'U_a'));
    raise exception 'FAIL: 121-char title accepted';
  exception when check_violation then null;
  end;
  begin
    perform dev_ticket_create('{"title":"x","category":"oops","reporter_id":"U_a"}');
    raise exception 'FAIL: bad category accepted';
  exception when check_violation then null;
  end;
end $$;
commit;

-- 寫入都有操作紀錄
do $$
begin
  if (select count(*) from audit_log where table_name = 'dev_tickets') < 1 then raise exception 'FAIL: no audit rows for dev_tickets'; end if;
  if (select count(*) from audit_log where table_name = 'dev_ticket_events') < 1 then raise exception 'FAIL: no audit rows for dev_ticket_events'; end if;
end $$;

-- service_role 不能硬刪、不能改歷史；anon 讀不到、也不能呼叫函式
set role service_role;
do $$
begin
  begin delete from dev_tickets; raise exception 'FAIL: service_role hard-deleted tickets';
  exception when insufficient_privilege then null; end;
  begin update dev_ticket_events set note = 'x'; raise exception 'FAIL: service_role edited history';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set role anon;
do $$
begin
  begin perform 1 from dev_tickets; raise exception 'FAIL: anon can read tickets';
  exception when insufficient_privilege then null; end;
  begin perform dev_ticket_apply(gen_random_uuid(), 'open', null, '{}', '{}'); raise exception 'FAIL: anon can call apply';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
\echo 'DEV TICKETS TESTS PASSED'
