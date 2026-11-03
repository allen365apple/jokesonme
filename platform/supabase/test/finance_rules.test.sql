-- 本機資料庫測試：0013 財務規則（寫入＋重算同交易、冪等匯入、排除成員正規化、專案參與成員）
\set ON_ERROR_STOP on
begin;
set local app.actor = 'migration';
insert into shows (id, name, type) values ('00000000-0000-0000-0000-0000000000c1', '規則測試專場', 'special');
commit;

-- 手動新增收入 → 自動產生 3% 預留；新增退款 → 預留跟著減少；全在函式內完成
do $$
begin
  perform set_config('app.actor', 'user:U_rules', true);
  perform finance_save_transaction(null, '00000000-0000-0000-0000-0000000000c1',
    '{"category":"演出票房","notes":"票","amount":10000,"excluded_members":["柏文","傑哥","傑哥"],"date":"2026-10-01"}'::jsonb);
end $$;

do $$
declare
  v_id uuid;
  v_reserve numeric;
  v_excluded text[];
begin
  perform set_config('app.actor', 'user:U_rules', true);
  select id, excluded_members into v_id, v_excluded from transactions where show_id = '00000000-0000-0000-0000-0000000000c1' and category = '演出票房' and deleted_at is null;
  if v_excluded <> array['傑哥', '柏文'] then raise exception 'FAIL: excluded_members 沒有正規化：%', v_excluded; end if;
  select amount into v_reserve from transactions where show_id = '00000000-0000-0000-0000-0000000000c1' and auto_generated and deleted_at is null;
  if v_reserve <> -300 then raise exception 'FAIL: 預留應為 -300，實際 %', v_reserve; end if;

  perform finance_save_transaction(null, '00000000-0000-0000-0000-0000000000c1',
    '{"category":"退款","notes":"退","amount":-2000,"excluded_members":["傑哥","柏文"],"date":"2026-10-05"}'::jsonb);
  select amount into v_reserve from transactions where show_id = '00000000-0000-0000-0000-0000000000c1' and auto_generated and deleted_at is null;
  if v_reserve <> -240 then raise exception 'FAIL: 退款後預留應為 -240，實際 %', v_reserve; end if;

  -- 平台手續費不扣
  perform finance_save_transaction(null, '00000000-0000-0000-0000-0000000000c1',
    '{"category":"平台手續","notes":"費","amount":-350,"excluded_members":[],"date":"2026-10-05"}'::jsonb);
  select amount into v_reserve from transactions where show_id = '00000000-0000-0000-0000-0000000000c1' and auto_generated and deleted_at is null;
  if v_reserve <> -240 then raise exception 'FAIL: 手續費不該影響預留，實際 %', v_reserve; end if;

  -- 非成員名字被拒絕
  begin
    perform finance_save_transaction(null, '00000000-0000-0000-0000-0000000000c1',
      '{"category":"演出票房","notes":"x","amount":1,"excluded_members":["某人"],"date":"2026-10-05"}'::jsonb);
    raise exception 'FAIL: 非成員名字被接受';
  exception when check_violation then null; end;
end $$;

-- 冪等匯入：同 oen_key 第二次略過；受影響專案重算
do $$
declare
  r jsonb;
  v_rows jsonb := '[
    {"show_id":"00000000-0000-0000-0000-0000000000c1","category":"演出票房","notes":"a","amount":1000,"date":"2026-10-10","excluded_members":["傑哥","柏文"],"recorded_by":"應援匯入","oen_key":"oen:C1:income"},
    {"show_id":"00000000-0000-0000-0000-0000000000c1","category":"平台手續","notes":"a","amount":-35,"date":"2026-10-10","excluded_members":[],"recorded_by":"應援匯入","oen_key":"oen:C1:fee"}
  ]'::jsonb;
  v_reserve numeric;
begin
  perform set_config('app.actor', 'user:U_rules', true);
  r := finance_import_transactions(v_rows);
  if (r->>'inserted')::int <> 2 or (r->>'skipped')::int <> 0 then raise exception 'FAIL: 第一次匯入 %', r; end if;
  r := finance_import_transactions(v_rows);
  if (r->>'inserted')::int <> 0 or (r->>'skipped')::int <> 2 then raise exception 'FAIL: 第二次匯入應全部略過 %', r; end if;
  if (select count(*) from transactions where oen_key is not null and deleted_at is null) <> 2 then raise exception 'FAIL: 重複匯入寫入了'; end if;
  select amount into v_reserve from transactions where show_id = '00000000-0000-0000-0000-0000000000c1' and auto_generated and deleted_at is null;
  if v_reserve <> -270 then raise exception 'FAIL: 匯入後預留應為 (10000-2000+1000)×3%% = -270，實際 %', v_reserve; end if;
end $$;

-- 專案參與成員：設定並套用到現有列（手續費不動），預留重新分組
do $$
declare
  r jsonb;
  n int;
begin
  perform set_config('app.actor', 'user:U_rules', true);
  r := finance_set_show_participants('00000000-0000-0000-0000-0000000000c1', array['巧達', '芭樂', '又又', '兔子', '大弋', '竹節蟲'], true);
  if (r->>'updated')::int <> 3 then raise exception 'FAIL: 應更新 3 筆（票房、退款、匯入票房），實際 %', r; end if;
  select count(*) into n from transactions where show_id = '00000000-0000-0000-0000-0000000000c1' and category = '平台手續' and excluded_members = '{}' and deleted_at is null;
  if n <> 2 then raise exception 'FAIL: 平台手續費應維持全員共同'; end if;
  select count(*) into n from transactions where show_id = '00000000-0000-0000-0000-0000000000c1' and auto_generated and deleted_at is null;
  if n <> 1 then raise exception 'FAIL: 應只剩一筆自動預留，實際 %', n; end if;
  if (select excluded_members from transactions where show_id = '00000000-0000-0000-0000-0000000000c1' and auto_generated and deleted_at is null)
     <> array['巧達', '芭樂', '又又', '兔子', '大弋', '竹節蟲'] then
    raise exception 'FAIL: 預留沒有換到新分組';
  end if;
  if (select default_excluded_members from shows where id = '00000000-0000-0000-0000-0000000000c1') <> array['巧達', '芭樂', '又又', '兔子', '大弋', '竹節蟲'] then
    raise exception 'FAIL: 專案設定沒存';
  end if;
end $$;

-- 刪除收入 → 預留跟著調整；自動列不能刪
do $$
declare
  v_id uuid;
  v_reserve numeric;
begin
  perform set_config('app.actor', 'user:U_rules', true);
  select id into v_id from transactions where show_id = '00000000-0000-0000-0000-0000000000c1' and category = '退款' and deleted_at is null;
  perform finance_delete_transaction(v_id, 'U_rules');
  select amount into v_reserve from transactions where show_id = '00000000-0000-0000-0000-0000000000c1' and auto_generated and deleted_at is null;
  if v_reserve <> -330 then raise exception 'FAIL: 刪退款後預留應為 11000×3%% = -330，實際 %', v_reserve; end if;
  select id into v_id from transactions where show_id = '00000000-0000-0000-0000-0000000000c1' and auto_generated and deleted_at is null;
  begin
    perform finance_delete_transaction(v_id, 'U_rules');
    raise exception 'FAIL: 自動預留被刪了';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;

-- 唯一索引確實存在（測試庫沒有重複資料）
do $$
begin
  if not exists (select 1 from pg_indexes where indexname = 'transactions_auto_reserve_uq') then raise exception 'FAIL: 缺 transactions_auto_reserve_uq'; end if;
  if not exists (select 1 from pg_indexes where indexname = 'transactions_oen_key_uq') then raise exception 'FAIL: 缺 transactions_oen_key_uq'; end if;
end $$;
\echo 'FINANCE RULES TESTS PASSED'
