-- 本機資料庫測試：0016 結算的分潤年度（預設規則 trigger、明確指定、範圍檢查）
\set ON_ERROR_STOP on
do $$
declare y int;
begin
  perform set_config('app.actor', 'migration', true);
  -- 1 月出款、沒給 for_year → 前一年（12 月分潤 1/10 出款）
  insert into settlements (member, amount, date, notes) values ('柏文', 10000, '2027-01-10', '12 月結算') returning for_year into y;
  if y <> 2026 then raise exception 'FAIL: 1 月出款預設應為 2026，實際 %', y; end if;
  -- 2 月出款、沒給 → 當年
  insert into settlements (member, amount, date, notes) values ('柏文', 10000, '2027-02-10', '1 月結算') returning for_year into y;
  if y <> 2027 then raise exception 'FAIL: 2 月出款預設應為 2027，實際 %', y; end if;
  -- 明確指定就照指定
  insert into settlements (member, amount, date, notes, for_year) values ('柏文', 5000, '2027-01-20', '1 月補發', 2027) returning for_year into y;
  if y <> 2027 then raise exception 'FAIL: 明確指定的 for_year 被改掉，實際 %', y; end if;
  -- 範圍外被擋
  begin
    insert into settlements (member, amount, date, for_year) values ('柏文', 1, '2027-01-20', 1999);
    raise exception 'FAIL: for_year 1999 被接受';
  exception when check_violation then null; end;
  if finance_default_settlement_year('2026-12-31') <> 2026 then raise exception 'FAIL: 12/31 應為當年'; end if;
end $$;
\echo 'SETTLEMENT YEAR TESTS PASSED'
