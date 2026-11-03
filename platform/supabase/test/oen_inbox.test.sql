-- 本機資料庫測試：0015 Oen 待確認佇列（historical 回填、核准建帳＋防重複、略過、改派、權限）
\set ON_ERROR_STOP on
begin;
set local app.actor = 'migration';
insert into shows (id, name, type, series) values
  ('00000000-0000-0000-0000-0000000000d1', '佇列測試專場', 'special', '專場'),
  ('00000000-0000-0000-0000-0000000000d2', '佇列測試月號', 'other', '看我笑話');
insert into oen_charges (id, charge_no, created_at_oen, paid_at, charge_type, status, payout_status, gross, fee, refund, net_received, net, raw, source_file)
overriding system value values
  (901, 'C-OLD',   '2026-09-01 10:00+08', '2026-09-01 10:00+08', '單筆購買', '已入帳', '已撥款', 1000, 35, 0, 965, 965, '{}', 't'),
  (902, 'C-NEW',   '2026-10-20 10:00+08', '2026-10-20 10:00+08', '單筆購買', '付款成功', '未撥款', 1000, 35, 0, 965, 965, '{}', 't'),
  (903, 'C-ADJ',   '2026-10-21 10:00+08', null,                  '金流調整', '調整', '調整', 0, 0, 0, 0, 0, '{}', 't'),
  (904, 'C-LATE',  '2026-10-25 10:00+08', '2026-10-25 10:00+08', '單筆購買', '已入帳', '已撥款', 2000, 70, 0, 1930, 1930, '{}', 't'),
  (905, 'C-SPLIT', '2026-10-26 10:00+08', '2026-10-26 10:00+08', '單筆購買', '付款成功', '未撥款', 1500, 50, 500, 1450, 950, '{}', 't'),
  (906, 'C-NOSHOW','2026-10-27 10:00+08', '2026-10-27 10:00+08', '單筆購買', '付款成功', '未撥款', 300, 10, 0, 290, 290, '{}', 't');
insert into oen_charge_lines (id, charge_id, line_no, line_type, item_text, qty, list_amount, show_id, map_confidence, tx_category, gross, fee, refund, net, recon_batch)
overriding system value values
  (9001, 901, 1, 'ticket', '舊票', 1, 1000, '00000000-0000-0000-0000-0000000000d1', '確定', '演出票房', 1000, 35, 0, 965, '2026-09-10'),
  (9002, 902, 1, 'ticket', '新票', 1, 1000, '00000000-0000-0000-0000-0000000000d1', '確定', '演出票房', 1000, 35, 0, 965, null),
  (9003, 903, 1, 'adjustment', '調整', 0, 0, null, '不適用', null, 0, 0, 0, 0, null),
  (9004, 904, 1, 'ticket', '晚批次票', 1, 2000, '00000000-0000-0000-0000-0000000000d2', '確定', '演出票房', 2000, 70, 0, 1930, '2026-11-07'),
  (9005, 905, 1, 'ticket', '拆分票', 1, 1000, '00000000-0000-0000-0000-0000000000d1', '推測', '演出票房', 1000, 33, 500, 467, null),
  (9006, 905, 2, 'merch',  '拆分周邊', 1, 500, '00000000-0000-0000-0000-0000000000d2', '推測', '周邊商品', 500, 17, 0, 483, null),
  (9007, 906, 1, 'ticket', '對不到的票', 1, 300, null, '對不到', '演出票房', 300, 10, 0, 290, null);
commit;

-- 回填：已撥款且批次 <= 截止日 → historical；調整列 → historical；其餘 pending
do $$
declare n int;
begin
  perform set_config('app.actor', 'migration', true);
  n := finance_oen_backfill_historical('2026-10-31');
  if n <> 2 then raise exception 'FAIL: 回填應標 2 筆，實際 %', n; end if;
  if (select booking_status from oen_charge_lines where id = 9001) <> 'historical' then raise exception 'FAIL: 已撥款舊批次應為 historical'; end if;
  if (select booking_status from oen_charge_lines where id = 9003) <> 'historical' then raise exception 'FAIL: 調整列應為 historical'; end if;
  if (select booking_status from oen_charge_lines where id = 9004) <> 'pending' then raise exception 'FAIL: 截止日之後的批次應維持 pending'; end if;
  if (select booking_status from oen_charge_lines where id = 9002) <> 'pending' then raise exception 'FAIL: 未撥款應維持 pending'; end if;
  if (select count(*) from oen_charge_lines where booking_status = 'pending' and transaction_id is null and id between 9001 and 9007) <> 5 then
    raise exception 'FAIL: 待確認應為 5 筆';
  end if;
  -- historical 列不出現在待確認
  if exists (select 1 from oen_charge_lines where booking_status = 'pending' and id in (9001, 9003)) then raise exception 'FAIL: historical 出現在待確認'; end if;
end $$;

-- 核准：建立 income + fee，回寫 transaction_id，重算稅務預留；重複核准不會多建
do $$
declare
  r jsonb;
  v_tx uuid;
  n int;
  v_reserve numeric;
begin
  perform set_config('app.actor', 'user:U_inbox', true);
  r := finance_oen_approve('[{"line_id": 9002, "excluded_members": ["巧達","芭樂","又又","兔子","大弋","竹節蟲"]}]'::jsonb, '測試員');
  if (r->>'booked')::int <> 1 or (r->>'inserted')::int <> 2 or (r->>'linked')::int <> 0 then raise exception 'FAIL: 第一次核准 %', r; end if;
  select count(*) into n from transactions where oen_key like 'oen:C-NEW%' and deleted_at is null;
  if n <> 2 then raise exception 'FAIL: 應建立 2 筆（income、fee），實際 %', n; end if;
  if (select amount from transactions where oen_key = 'oen:C-NEW:income') <> 1000 then raise exception 'FAIL: income 金額'; end if;
  if (select excluded_members from transactions where oen_key = 'oen:C-NEW:income') <> array['巧達','芭樂','又又','兔子','大弋','竹節蟲'] then raise exception 'FAIL: 票房列排除成員'; end if;
  if (select amount from transactions where oen_key = 'oen:C-NEW:fee') <> -35 then raise exception 'FAIL: fee 金額'; end if;
  if (select excluded_members from transactions where oen_key = 'oen:C-NEW:fee') <> '{}' then raise exception 'FAIL: 手續費必須 8 人分'; end if;
  if (select date from transactions where oen_key = 'oen:C-NEW:income') <> '2026-10-20' then raise exception 'FAIL: 未撥款用付款日'; end if;
  select id into v_tx from transactions where oen_key = 'oen:C-NEW:income';
  if (select transaction_id from oen_charge_lines where id = 9002) <> v_tx then raise exception 'FAIL: 沒回寫 transaction_id'; end if;
  if (select booking_status from oen_charge_lines where id = 9002) <> 'booked' then raise exception 'FAIL: 沒標 booked'; end if;
  select amount into v_reserve from transactions where show_id = '00000000-0000-0000-0000-0000000000d1' and auto_generated and deleted_at is null;
  if v_reserve <> -30 then raise exception 'FAIL: 預留應為 -30，實際 %', v_reserve; end if;

  -- 重複核准：同一列再送一次，什麼都不做
  r := finance_oen_approve('[{"line_id": 9002, "excluded_members": []}]'::jsonb, '測試員');
  if (r->>'booked')::int <> 0 or (r->>'inserted')::int <> 0 then raise exception 'FAIL: 重複核准 %', r; end if;
  select count(*) into n from transactions where oen_key like 'oen:C-NEW%' and deleted_at is null;
  if n <> 2 then raise exception 'FAIL: 重複核准多建了，實際 %', n; end if;
end $$;

-- 舊匯入已存在同 oen_key：核准只回寫 transaction_id，不新增 income；fee 才新增
do $$
declare
  r jsonb;
  v_old uuid;
  n int;
begin
  perform set_config('app.actor', 'user:U_inbox', true);
  perform finance_import_transactions('[{"show_id":"00000000-0000-0000-0000-0000000000d2","category":"演出票房","notes":"舊匯入","amount":2000,"date":"2026-11-07","excluded_members":[],"recorded_by":"應援匯入","oen_key":"oen:C-LATE:income"}]'::jsonb);
  select id into v_old from transactions where oen_key = 'oen:C-LATE:income';
  r := finance_oen_approve('[{"line_id": 9004, "excluded_members": []}]'::jsonb, '測試員');
  if (r->>'booked')::int <> 1 or (r->>'inserted')::int <> 1 or (r->>'linked')::int <> 1 then raise exception 'FAIL: 既有鍵核准 %', r; end if;
  select count(*) into n from transactions where oen_key = 'oen:C-LATE:income' and deleted_at is null;
  if n <> 1 then raise exception 'FAIL: 既有鍵被重建'; end if;
  if (select transaction_id from oen_charge_lines where id = 9004) <> v_old then raise exception 'FAIL: 應連到既有的收支列'; end if;
end $$;

-- 多列金流：鍵加 #line_no；退款列沿用排除成員；兩個專案都重算
do $$
declare
  r jsonb;
begin
  perform set_config('app.actor', 'user:U_inbox', true);
  r := finance_oen_approve('[{"line_id": 9005, "excluded_members": ["巧達","芭樂","又又","兔子","大弋","竹節蟲"]}, {"line_id": 9006, "excluded_members": []}]'::jsonb, '測試員');
  if (r->>'booked')::int <> 2 or (r->>'inserted')::int <> 5 then raise exception 'FAIL: 拆分核准 %', r; end if;
  if (select amount from transactions where oen_key = 'oen:C-SPLIT#1:refund') <> -500 then raise exception 'FAIL: 退款列'; end if;
  if (select excluded_members from transactions where oen_key = 'oen:C-SPLIT#1:refund') <> array['巧達','芭樂','又又','兔子','大弋','竹節蟲'] then raise exception 'FAIL: 退款列排除成員'; end if;
  if (select category from transactions where oen_key = 'oen:C-SPLIT#2:income') <> '周邊商品' then raise exception 'FAIL: 周邊分類'; end if;
  -- 專場：票房 1000 + 1000 − 退款 500 = 1500 × 3% = 45
  if (select amount from transactions where show_id = '00000000-0000-0000-0000-0000000000d1' and auto_generated and deleted_at is null) <> -45 then raise exception 'FAIL: 專場預留'; end if;
end $$;

-- 沒指定演出不能核准；改派後可以；略過與復原；人工標為歷史
do $$
declare
  r jsonb;
  n int;
begin
  perform set_config('app.actor', 'user:U_inbox', true);
  begin
    perform finance_oen_approve('[{"line_id": 9007, "excluded_members": []}]'::jsonb, '測試員');
    raise exception 'FAIL: 沒指定演出卻核准了';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  n := finance_oen_reassign(array[9007]::bigint[], '00000000-0000-0000-0000-0000000000d2', '周邊商品', '測試員');
  if n <> 1 then raise exception 'FAIL: 改派筆數 %', n; end if;
  if (select map_confidence from oen_charge_lines where id = 9007) <> '確定' then raise exception 'FAIL: 改派後應為確定'; end if;
  n := finance_oen_skip(array[9007]::bigint[], '測試略過', '測試員');
  if n <> 1 or (select booking_status from oen_charge_lines where id = 9007) <> 'skipped' then raise exception 'FAIL: 略過'; end if;
  r := finance_oen_approve('[{"line_id": 9007, "excluded_members": []}]'::jsonb, '測試員');
  if (r->>'booked')::int <> 0 then raise exception 'FAIL: 略過的列不應被核准'; end if;
  n := finance_oen_unskip(array[9007]::bigint[]);
  if n <> 1 or (select booking_status from oen_charge_lines where id = 9007) <> 'pending' then raise exception 'FAIL: 復原'; end if;
  n := finance_oen_mark_historical(array[9007]::bigint[], '測試員', 'Jesse 確認早已入帳');
  if n <> 1 or (select booking_status from oen_charge_lines where id = 9007) <> 'historical' then raise exception 'FAIL: 標為歷史'; end if;
  -- 已核准的列不能改派、不能略過
  if finance_oen_reassign(array[9002]::bigint[], '00000000-0000-0000-0000-0000000000d2', null, '測試員') <> 0 then raise exception 'FAIL: 已入帳的列被改派'; end if;
  if finance_oen_skip(array[9002]::bigint[], 'x', '測試員') <> 0 then raise exception 'FAIL: 已入帳的列被略過'; end if;
end $$;

-- 權限：service_role 對明細表仍只有 select；函式可執行；anon 不行
do $$
begin
  if has_table_privilege('service_role', 'oen_charge_lines', 'update') then raise exception 'FAIL: service_role 不該能直接更新 oen_charge_lines'; end if;
  if not has_function_privilege('service_role', 'finance_oen_approve(jsonb, text)', 'execute') then raise exception 'FAIL: service_role 要能執行核准'; end if;
  if has_function_privilege('anon', 'finance_oen_approve(jsonb, text)', 'execute') then raise exception 'FAIL: anon 不該能執行核准'; end if;
  if has_function_privilege('service_role', 'finance_oen_backfill_historical(date)', 'execute') then raise exception 'FAIL: 回填函式不給平台'; end if;
end $$;
\echo 'OEN INBOX TESTS PASSED'
