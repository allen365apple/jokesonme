-- 0016 結算的「分潤年度」（Jesse 2026-11-07 拍板：12 月的分潤在隔年 1/10 出款，算前一年）
-- 成員年度報表的「已付」改看 for_year，不再看出款日所屬年度；date 仍是實際出款日。
-- 規則（預設值，新增時可改）：1 月出款的歸前一年，其餘歸出款日的年份。
-- 現有資料全在 2026 年 4–10 月，回填結果都是 2026。不刪、不改任何既有金額。

alter table settlements add column if not exists for_year int;
comment on column settlements.for_year is '分潤年度：這筆結算付的是哪一年的分潤。預設出款日年份、1 月出款預設前一年；成員年度報表的「已付」用這欄';

create or replace function finance_default_settlement_year(p_date date) returns int
language sql immutable as $$
  select case when extract(month from p_date) = 1 then extract(year from p_date)::int - 1 else extract(year from p_date)::int end
$$;

update settlements set for_year = finance_default_settlement_year(date) where for_year is null;
alter table settlements alter column for_year set not null;
alter table settlements drop constraint if exists settlements_for_year_check;
alter table settlements add constraint settlements_for_year_check check (for_year between 2020 and 2100);

-- 沒給 for_year 的插入（舊腳本、搬家工具）套預設規則，不會因 not null 失敗
create or replace function settlements_default_for_year() returns trigger
language plpgsql as $$
begin
  if new.for_year is null then new.for_year := finance_default_settlement_year(new.date); end if;
  return new;
end $$;
drop trigger if exists settlements_default_for_year on settlements;
create trigger settlements_default_for_year before insert on settlements
  for each row execute function settlements_default_for_year();

insert into _migrations (name) values ('0016_settlement_year') on conflict do nothing;
