-- 0015 Oen 待確認佇列（2026-11-03 UI/UX 改版，取代手動 CSV 匯入頁）
--   1. oen_charge_lines.booking_status：pending（待確認）/ booked（已核准，transactions 已建立並回寫 transaction_id）
--      / skipped（略過，不入帳）/ historical（ledger 建立前就已入帳的歷史列，不再出現在待確認）
--   2. 回填 historical：已撥款（payout_status = '已撥款'）且 recon_batch <= HISTORICAL_CUTOFF 的列，以及金流調整列。
--      依據：既有 2026 transactions 在 ledger 存在前就已入帳（已撥款 charge 與 transactions 對帳差 0）；
--      已撥款列的 recon_batch 最晚 2026-10-17，transactions 票房/會員/手續費最晚 2026-10-31。
--      未撥款（recon_batch 2026-09-24 ~ 2026-11-02）與「無金流」列（403 筆）是否已入帳不確定 → 保守維持 pending，
--      畫面核准前會顯示該演出既有票房列金額 vs 待確認金額提醒可能重複。【待 Jesse 確認】
--   3. 核准／略過／改派／標為歷史的 RPC：security definer，權限比照 0013（只給 service_role 執行）。
--      平台 service_role 對 oen_charges / oen_charge_lines 仍然只有 select，所有寫入都走這些函式。
--   4. 防重複：核准時 transactions 以 oen_key 的部分唯一索引（0013）擋重複；同一列重複核准不會多建；
--      已存在同 oen_key 的列（舊匯入）只回寫 transaction_id、不再新增。

alter table oen_charge_lines add column if not exists booking_status text not null default 'pending';
alter table oen_charge_lines drop constraint if exists oen_charge_lines_booking_status_check;
alter table oen_charge_lines add constraint oen_charge_lines_booking_status_check
  check (booking_status in ('pending', 'booked', 'skipped', 'historical'));
alter table oen_charge_lines add column if not exists booked_at timestamptz;
alter table oen_charge_lines add column if not exists booked_by text;
alter table oen_charge_lines add column if not exists booking_note text;
create index if not exists oen_charge_lines_pending_idx on oen_charge_lines (show_id) where booking_status = 'pending';
comment on column oen_charge_lines.booking_status is '待確認佇列狀態：pending / booked（已建 transactions）/ skipped（不入帳）/ historical（ledger 之前就已入帳）';
comment on column oen_charge_lines.booking_note is '略過原因、改派紀錄等';

-- ---- 歷史列回填（可重跑；migration 呼叫一次，之後 Jesse 確認後也可對特定截止日再跑） ----
create or replace function finance_oen_backfill_historical(p_cutoff date) returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  update oen_charge_lines l
     set booking_status = 'historical', booked_at = now(), booked_by = coalesce(app_actor(), 'migration'),
         booking_note = '0015 回填：' || case when l.line_type = 'adjustment' or c.payout_status = '調整' then '金流調整列' else '已撥款且批次 <= ' || p_cutoff::text end
    from oen_charges c
   where c.id = l.charge_id and l.booking_status = 'pending' and l.transaction_id is null
     and (
       (c.payout_status = '已撥款' and l.recon_batch is not null and l.recon_batch <= p_cutoff)
       or l.line_type = 'adjustment' or c.payout_status = '調整'
     );
  get diagnostics n = row_count;
  return n;
end $$;

-- HISTORICAL_CUTOFF = 2026-10-31：transactions 裡票房/會員/手續費最晚日期；已撥款列的 recon_batch 最晚 2026-10-17，全部涵蓋。
do $$
begin
  perform set_config('app.actor', 'migration', true);
  raise notice '0015: % 筆 Oen 明細列標為 historical', finance_oen_backfill_historical('2026-10-31');
end $$;

-- ---- 核准：依明細列建立 transactions（income / fee / refund 三個部位），回寫 transaction_id，重算稅務預留 ----
-- p_items: [{line_id, excluded_members}]；排除成員由平台依專案推測／使用者指定（平台手續費永遠 8 人分，忽略 excluded）。
-- 金額、分類、日期一律取自明細列本身，呼叫端改不了。
-- oen_key 與舊匯入（0013 註解：oen:<金流編號>[#<拆分列號>]:<部位>）相容：單列金流不加 #，多列才加，所以舊匯入過的列會對到同一把鍵。
create or replace function finance_oen_approve(p_items jsonb, p_recorded_by text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r          record;
  v_shows    uuid[] := '{}';
  v_show     uuid;
  v_booked   int := 0;
  v_inserted int := 0;
  v_linked   int := 0;
  v_date     date;
  v_excluded text[];
  v_key      text;
  v_tx       uuid;
  v_notes    text;
  v_lines    int;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'finance_oen_approve: p_items 必須是陣列';
  end if;
  for r in
    select l.id, l.line_no, l.show_id, l.tx_category, l.gross, l.fee, l.refund, l.recon_batch, l.booking_status, l.transaction_id, l.item_text,
           c.id as charge_id, c.charge_no, c.paid_at, c.created_at_oen, c.event_name, c.charge_type, x.excluded_members
      from jsonb_to_recordset(p_items) as x(line_id bigint, excluded_members text[])
      join oen_charge_lines l on l.id = x.line_id
      join oen_charges c on c.id = l.charge_id
     order by l.id
       for update of l
  loop
    -- 已處理過的列直接跳過：重複送出不會多建
    if r.booking_status <> 'pending' or r.transaction_id is not null then continue; end if;
    if r.show_id is null then raise exception '明細列 %（%）尚未指定演出', r.id, r.charge_no; end if;
    if r.tx_category is null or r.tx_category not in ('演出票房', '付費會員', '商演合作', '周邊商品', '品牌贊助', '其他收入') then
      raise exception '明細列 %（%）的分類「%」不是收入分類，請先改派', r.id, r.charge_no, coalesce(r.tx_category, '');
    end if;
    if r.gross <= 0 and r.fee <= 0 and r.refund <= 0 then continue; end if;

    -- 日期：撥款批次日；還沒撥款用付款日（台北）；都沒有用建立日。絕不用核准當天。
    v_date := coalesce(r.recon_batch, (r.paid_at at time zone 'Asia/Taipei')::date, (r.created_at_oen at time zone 'Asia/Taipei')::date);
    v_excluded := finance_normalize_excluded(coalesce(r.excluded_members, '{}'));
    select count(*) into v_lines from oen_charge_lines where charge_id = r.charge_id;
    v_key := 'oen:' || r.charge_no || case when v_lines > 1 then '#' || r.line_no else '' end;
    v_notes := left(coalesce(nullif(r.item_text, ''), nullif(r.event_name, ''), r.charge_type) || '（Oen ' || r.charge_no || '）', 200);
    v_tx := null;

    if r.gross > 0 then
      insert into transactions (show_id, category, notes, amount, advanced_by, excluded_members, date, recorded_by, paid_by_fund, auto_generated, oen_key)
      values (r.show_id, r.tx_category, v_notes, r.gross, null, v_excluded, v_date, p_recorded_by, false, false, v_key || ':income')
      on conflict (oen_key) where oen_key is not null do nothing
      returning id into v_tx;
      if v_tx is null then
        select id into v_tx from transactions where oen_key = v_key || ':income';
        v_linked := v_linked + 1;
      else
        v_inserted := v_inserted + 1;
      end if;
    end if;
    if r.fee > 0 then
      insert into transactions (show_id, category, notes, amount, advanced_by, excluded_members, date, recorded_by, paid_by_fund, auto_generated, oen_key)
      values (r.show_id, '平台手續', left('Oen 手續費（' || r.charge_no || '）', 200), -r.fee, null, '{}', v_date, p_recorded_by, false, false, v_key || ':fee')
      on conflict (oen_key) where oen_key is not null do nothing;
      if found then v_inserted := v_inserted + 1; else v_linked := v_linked + 1; end if;
    end if;
    if r.refund > 0 then
      insert into transactions (show_id, category, notes, amount, advanced_by, excluded_members, date, recorded_by, paid_by_fund, auto_generated, oen_key)
      values (r.show_id, '退款', left('Oen 退款（' || r.charge_no || '）', 200), -r.refund, null, v_excluded, v_date, p_recorded_by, false, false, v_key || ':refund')
      on conflict (oen_key) where oen_key is not null do nothing;
      if found then v_inserted := v_inserted + 1; else v_linked := v_linked + 1; end if;
    end if;
    if v_tx is null then
      -- 沒有收入部位（只有手續費／退款）：連到手續費或退款那列，讓詳細頁能逐列對照
      select id into v_tx from transactions where oen_key in (v_key || ':fee', v_key || ':refund') order by oen_key limit 1;
    end if;

    update oen_charge_lines set booking_status = 'booked', transaction_id = v_tx, booked_at = now(), booked_by = p_recorded_by where id = r.id;
    v_booked := v_booked + 1;
    if not (r.show_id = any (v_shows)) then v_shows := array_append(v_shows, r.show_id); end if;
  end loop;

  -- 依專案 id 排序取鎖（與 finance_import_transactions 相同）
  foreach v_show in array (select coalesce(array_agg(s order by s), '{}') from unnest(v_shows) s) loop
    perform finance_sync_tax_reserve(v_show);
  end loop;
  return jsonb_build_object('booked', v_booked, 'inserted', v_inserted, 'linked', v_linked);
end $$;

-- ---- 略過（不入帳）／復原為待確認 ----
create or replace function finance_oen_skip(p_line_ids bigint[], p_reason text, p_actor_name text) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update oen_charge_lines
     set booking_status = 'skipped', booked_at = now(), booked_by = p_actor_name, booking_note = left(coalesce(nullif(p_reason, ''), '略過'), 200)
   where id = any (p_line_ids) and booking_status = 'pending' and transaction_id is null;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function finance_oen_unskip(p_line_ids bigint[]) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update oen_charge_lines set booking_status = 'pending', booked_at = null, booked_by = null, booking_note = null
   where id = any (p_line_ids) and booking_status in ('skipped', 'historical') and transaction_id is null;
  get diagnostics n = row_count;
  return n;
end $$;

-- ---- 標為歷史（已入帳、不建 transactions）：Jesse 確認未撥款／無金流列其實早已入帳時用 ----
create or replace function finance_oen_mark_historical(p_line_ids bigint[], p_actor_name text, p_note text) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update oen_charge_lines
     set booking_status = 'historical', booked_at = now(), booked_by = p_actor_name, booking_note = left(coalesce(nullif(p_note, ''), '人工標為已入帳'), 200)
   where id = any (p_line_ids) and booking_status = 'pending' and transaction_id is null;
  get diagnostics n = row_count;
  return n;
end $$;

-- ---- 改派演出（與分類）：只動待確認的列，不動已入帳的 ----
create or replace function finance_oen_reassign(p_line_ids bigint[], p_show_id uuid, p_tx_category text, p_actor_name text) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not exists (select 1 from shows where id = p_show_id) then raise exception '專案不存在'; end if;
  if p_tx_category is not null and p_tx_category not in ('演出票房', '付費會員', '商演合作', '周邊商品', '品牌贊助', '其他收入') then
    raise exception '分類「%」不是收入分類', p_tx_category;
  end if;
  update oen_charge_lines
     set show_id = p_show_id, tx_category = coalesce(p_tx_category, tx_category), map_confidence = '確定',
         map_note = left('平台指定（' || p_actor_name || '）', 200)
   where id = any (p_line_ids) and booking_status = 'pending' and transaction_id is null;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function finance_oen_backfill_historical(date), finance_oen_approve(jsonb, text), finance_oen_skip(bigint[], text, text),
  finance_oen_unskip(bigint[]), finance_oen_mark_historical(bigint[], text, text), finance_oen_reassign(bigint[], uuid, text, text)
  from public, anon, authenticated;
grant execute on function finance_oen_approve(jsonb, text), finance_oen_skip(bigint[], text, text),
  finance_oen_unskip(bigint[]), finance_oen_mark_historical(bigint[], text, text), finance_oen_reassign(bigint[], uuid, text, text)
  to service_role;
-- 回填函式只給持有 postgres 角色的人（migration／對帳）跑，不給平台

insert into _migrations (name) values ('0015_oen_inbox') on conflict do nothing;
