-- 0013 財務規則（2026-11 審查 _review/claude_review.md 第 1、2、3、5、7 項）
--   1. transactions.oen_key：應援匯入的來源鍵（oen:<金流編號>[#拆分列]:<income|fee|refund>），部分唯一索引擋重複匯入
--   2. excluded_members 寫入時正規化（去重、依成員順序排序）並驗證都是成員名；只管新增與有改到的列，舊列不動
--   3. shows.default_excluded_members：專案預設參與成員（null = 未設定；'{}' = 全員共同）
--   4. 寫收支＋重算稅務預留合併成同一交易的資料庫函式（RPC）；同一專案的重算用 advisory lock 序列化
--   5. 自動稅務預留每專案每分組最多一筆的部分唯一索引（現有資料若已有重複，略過建立並提示，不動資料）
-- 規則本體（稅務預留基礎 = 收入 − 退款，最低 0，round 3%）與 lib/finance/calc.ts taxReservesForShow 一致，
-- scripts/check-tax-reserves.mts 會拿兩邊比對。不更新、不刪除任何既有資料列。

alter table transactions add column if not exists oen_key text;
comment on column transactions.oen_key is '應援匯入來源鍵：oen:<Oen 金流編號>[#<拆分列號>]:<income|fee|refund>；手動登記的列為 null';
create unique index if not exists transactions_oen_key_uq on transactions (oen_key) where oen_key is not null;  -- 含已軟刪除：刪掉的列重匯也不會復活

alter table shows add column if not exists default_excluded_members text[];
comment on column shows.default_excluded_members is '財務：這個專案預設不分配的成員（null = 未設定，匯入時推測；空陣列 = 全員共同）。會寫進該專案票房與退款列的 excluded_members';

-- ---- 成員名單與排除成員正規化 ----
create or replace function finance_members() returns text[]
language sql immutable as $$
  select array['傑哥', '柏文', '巧達', '芭樂', '又又', '兔子', '大弋', '竹節蟲']::text[]
$$;

-- 去重、去空白、依成員順序排序；有不是成員的名字或全部排除 → 丟錯（errcode 跟 check constraint 一樣，前端當驗證錯誤處理）
create or replace function finance_normalize_excluded(p text[]) returns text[]
language plpgsql immutable as $$
declare
  members text[] := finance_members();
  result  text[];
  bad     text;
begin
  if p is null then return '{}'; end if;
  select coalesce(array_agg(m order by array_position(members, m)), '{}') into result
    from (select distinct btrim(x) as m from unnest(p) as x where btrim(x) <> '') s;
  select m into bad from unnest(result) as m where m <> all (members) limit 1;
  if bad is not null then
    raise exception '排除成員「%」不是成員', bad using errcode = 'check_violation';
  end if;
  if cardinality(result) >= cardinality(members) then
    raise exception '至少要有一位成員分配這筆' using errcode = 'check_violation';
  end if;
  return result;
end $$;

create or replace function transactions_normalize_excluded() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.excluded_members is distinct from old.excluded_members then
    new.excluded_members := finance_normalize_excluded(new.excluded_members);
  end if;
  return new;
end $$;
drop trigger if exists transactions_normalize_excluded on transactions;
create trigger transactions_normalize_excluded before insert or update on transactions
  for each row execute function transactions_normalize_excluded();

create or replace function shows_normalize_excluded() returns trigger
language plpgsql as $$
begin
  if new.default_excluded_members is not null
     and (tg_op = 'INSERT' or new.default_excluded_members is distinct from old.default_excluded_members) then
    new.default_excluded_members := finance_normalize_excluded(new.default_excluded_members);
  end if;
  return new;
end $$;
drop trigger if exists shows_normalize_excluded on shows;
create trigger shows_normalize_excluded before insert or update on shows
  for each row execute function shows_normalize_excluded();

-- ---- 稅務預留重算（同一交易內；每專案一把 advisory lock，擋住兩人同時存收入各插一筆的情況） ----
create or replace function finance_sync_tax_reserve(p_show_id uuid) returns void
language plpgsql as $$
declare
  v_show_name text;
  r record;
begin
  perform pg_advisory_xact_lock(hashtext('finance_tax_reserve'), hashtext(p_show_id::text));
  select name into v_show_name from shows where id = p_show_id;
  if v_show_name is null then
    raise exception 'finance_sync_tax_reserve: 專案 % 不存在', p_show_id;
  end if;

  for r in
    with counted as (
      -- 算進 3% 基礎的列：所有正數收入，加上退款（「退款」分類、或收入分類的負數列）。平台手續費等支出不扣。
      select excluded_members, amount, date
        from transactions
       where show_id = p_show_id and deleted_at is null
         and not (auto_generated and category = '稅務預留')
         and (amount > 0 or category in ('退款', '演出票房', '付費會員', '商演合作', '周邊商品', '品牌贊助', '其他收入'))
    ), grouped as (
      select excluded_members, round(greatest(sum(amount), 0) * 0.03) as reserve, max(date) as latest
        from counted group by excluded_members
    ), desired as (
      select excluded_members, -reserve as amount, latest as date
        from grouped where reserve > 0 and v_show_name <> '共同基金支出'
    ), existing as (
      select id, excluded_members, amount, date,
             row_number() over (partition by excluded_members order by sort_order) as rn
        from transactions
       where show_id = p_show_id and deleted_at is null and auto_generated and category = '稅務預留'
    )
    select coalesce(d.excluded_members, e.excluded_members) as excluded_members,
           d.amount as want_amount, d.date as want_date,
           e.id as existing_id, e.amount as have_amount, e.date as have_date, e.rn
      from desired d full join existing e on e.excluded_members = d.excluded_members
  loop
    if r.existing_id is null then
      insert into transactions (show_id, category, notes, amount, advanced_by, excluded_members, date, recorded_by, paid_by_fund, auto_generated)
      values (p_show_id, '稅務預留', '系統自動：營所稅預留 3%', r.want_amount, null, r.excluded_members, r.want_date, '系統', false, true);
    elsif r.want_amount is null or r.rn > 1 then
      -- 這組不再需要預留，或同組多出來的重複列：軟刪除
      update transactions set deleted_at = now(), deleted_by = '系統' where id = r.existing_id;
    elsif r.have_amount <> r.want_amount or r.have_date <> r.want_date then
      update transactions set amount = r.want_amount, date = r.want_date where id = r.existing_id;
    end if;
  end loop;
end $$;

-- ---- 應援匯入：整批寫入（同 oen_key 已存在就略過）＋受影響專案重算，一個交易 ----
-- p_rows: [{show_id, category, notes, amount, date, excluded_members, recorded_by, oen_key}]
create or replace function finance_import_transactions(p_rows jsonb) returns jsonb
language plpgsql as $$
declare
  v_total    int;
  v_inserted int := 0;
  v_show     uuid;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'finance_import_transactions: p_rows 必須是陣列';
  end if;
  select count(*) into v_total from jsonb_array_elements(p_rows);
  if exists (select 1 from jsonb_array_elements(p_rows) x where coalesce(x->>'oen_key', '') = '') then
    raise exception 'finance_import_transactions: 每一筆都要有 oen_key';
  end if;

  with src as (
    select * from jsonb_to_recordset(p_rows)
      as x(show_id uuid, category text, notes text, amount numeric, date date, excluded_members text[], recorded_by text, oen_key text)
  ), ins as (
    insert into transactions (show_id, category, notes, amount, advanced_by, excluded_members, date, recorded_by, paid_by_fund, auto_generated, oen_key)
    select show_id, category, coalesce(notes, ''), amount, null, coalesce(excluded_members, '{}'), date,
           coalesce(recorded_by, '應援匯入'), false, false, oen_key
      from src
    on conflict (oen_key) where oen_key is not null do nothing
    returning 1
  )
  select count(*) into v_inserted from ins;

  -- 依專案 id 排序取鎖，避免兩個匯入互相等鎖
  for v_show in select distinct (x->>'show_id')::uuid from jsonb_array_elements(p_rows) x order by 1 loop
    perform finance_sync_tax_reserve(v_show);
  end loop;
  return jsonb_build_object('inserted', v_inserted, 'skipped', v_total - v_inserted);
end $$;

-- ---- 手動新增／編輯一筆＋重算 ----
-- p_row: {category, notes, amount, advanced_by, excluded_members, date, recorded_by, paid_by_fund}
create or replace function finance_save_transaction(p_id uuid, p_show_id uuid, p_row jsonb) returns uuid
language plpgsql as $$
declare
  v_id       uuid;
  v_show     uuid;
  v_auto     boolean;
  v_excluded text[];
begin
  select coalesce(array_agg(x), '{}') into v_excluded
    from jsonb_array_elements_text(coalesce(p_row->'excluded_members', '[]'::jsonb)) as x;
  if p_id is null then
    if p_show_id is null then raise exception '請選擇專案'; end if;
    insert into transactions (show_id, category, notes, amount, advanced_by, excluded_members, date, recorded_by, paid_by_fund, auto_generated)
    values (p_show_id, p_row->>'category', coalesce(p_row->>'notes', ''), (p_row->>'amount')::numeric, nullif(p_row->>'advanced_by', ''),
            v_excluded, (p_row->>'date')::date, nullif(p_row->>'recorded_by', ''), coalesce((p_row->>'paid_by_fund')::boolean, false), false)
    returning id, show_id into v_id, v_show;
  else
    select show_id, auto_generated into v_show, v_auto from transactions where id = p_id and deleted_at is null for update;
    if v_show is null then raise exception '找不到這筆收支（可能已被刪除）'; end if;
    if v_auto then raise exception '系統自動產生的稅務預留不可編輯'; end if;
    update transactions
       set category = p_row->>'category', notes = coalesce(p_row->>'notes', ''), amount = (p_row->>'amount')::numeric,
           advanced_by = nullif(p_row->>'advanced_by', ''), excluded_members = v_excluded, date = (p_row->>'date')::date,
           recorded_by = nullif(p_row->>'recorded_by', ''), paid_by_fund = coalesce((p_row->>'paid_by_fund')::boolean, false)
     where id = p_id;
    v_id := p_id;
  end if;
  perform finance_sync_tax_reserve(v_show);
  return v_id;
end $$;

-- ---- 軟刪除一筆＋重算 ----
create or replace function finance_delete_transaction(p_id uuid, p_deleted_by text) returns void
language plpgsql as $$
declare
  v_show uuid;
  v_auto boolean;
begin
  select show_id, auto_generated into v_show, v_auto from transactions where id = p_id and deleted_at is null for update;
  if v_show is null then raise exception '找不到這筆收支（可能已被刪除）'; end if;
  if v_auto then raise exception '系統自動產生的稅務預留不可刪除'; end if;
  update transactions set deleted_at = now(), deleted_by = p_deleted_by where id = p_id;
  perform finance_sync_tax_reserve(v_show);
end $$;

-- ---- 專案參與成員：存設定，選擇性套用到該專案現有的收支（平台手續費永遠 8 人分，不套用），再重算 ----
create or replace function finance_set_show_participants(p_show_id uuid, p_excluded text[], p_apply_to_rows boolean) returns jsonb
language plpgsql as $$
declare
  v_excluded text[] := case when p_excluded is null then null else finance_normalize_excluded(p_excluded) end;
  v_updated  int := 0;
begin
  update shows set default_excluded_members = v_excluded where id = p_show_id;
  if not found then raise exception '專案不存在'; end if;
  if p_apply_to_rows and v_excluded is not null then
    update transactions set excluded_members = v_excluded
     where show_id = p_show_id and deleted_at is null and not auto_generated and not paid_by_fund
       and category <> '平台手續' and excluded_members is distinct from v_excluded;
    get diagnostics v_updated = row_count;
  end if;
  perform finance_sync_tax_reserve(p_show_id);
  return jsonb_build_object('updated', v_updated);
end $$;

-- 函式只給後端（service_role）呼叫；PostgREST 預設會把 execute 給 public，要明確收回
revoke all on function finance_members(), finance_normalize_excluded(text[]),
  finance_sync_tax_reserve(uuid), finance_import_transactions(jsonb), finance_save_transaction(uuid, uuid, jsonb),
  finance_delete_transaction(uuid, text), finance_set_show_participants(uuid, text[], boolean)
  from public, anon, authenticated;
grant execute on function finance_members(), finance_normalize_excluded(text[]),
  finance_sync_tax_reserve(uuid), finance_import_transactions(jsonb), finance_save_transaction(uuid, uuid, jsonb),
  finance_delete_transaction(uuid, text), finance_set_show_participants(uuid, text[], boolean)
  to service_role;

-- ---- 自動稅務預留：每專案每分組最多一筆（現有資料若已有重複，先不建索引，等人工清完再重跑這段） ----
do $$
begin
  if exists (
    select 1 from transactions
     where auto_generated and category = '稅務預留' and deleted_at is null
     group by show_id, excluded_members having count(*) > 1
  ) then
    raise warning '0013: 現有自動稅務預留有重複分組，略過建立 transactions_auto_reserve_uq；請先用 finance_sync_tax_reserve 逐專案整理後再建索引';
  else
    create unique index if not exists transactions_auto_reserve_uq on transactions (show_id, excluded_members)
      where auto_generated and category = '稅務預留' and deleted_at is null;
  end if;
end $$;

insert into _migrations (name) values ('0013_finance_rules') on conflict do nothing;
