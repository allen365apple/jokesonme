-- 0012 Oen 金流明細表（鏡像 /workspace/oen/ledger/000_ddl.sql；2026-11-02 已直接在正式庫建立，這裡讓 repo 反映現況）
-- 全部可重跑：表與索引用 if not exists；正式庫已存在時整支是 no-op。沒有 DML、不掛 audit（與正式庫相同）。
-- 資料由 import_oen_ledger.py 以 charge_no upsert 匯入，不在這裡。

create table if not exists public.oen_charges (
  id              bigint generated always as identity primary key,
  charge_no       text not null constraint oen_charges_charge_no_key unique,  -- Oen 金流編號
  order_no        text,                 -- Oen 訂單編號（同一訂單可多筆金流）
  created_at_oen  timestamptz not null, -- 建立日期 (+08)
  paid_at         timestamptz,          -- 付款時間 (+08)
  charge_type     text not null,        -- 單筆購買/定期會費/現金付款/金流調整
  status          text not null,        -- 金流狀態
  payout_status   text not null constraint oen_charges_payout_status_check check (payout_status in ('已撥款','未撥款','調整','無金流')),
  payment_method  text,
  event_name      text,                 -- 活動名稱
  event_order_text text,                -- 活動訂單內容
  merch_order_text text,                -- 回饋品訂單內容
  member_plan     text,                 -- 會員類型
  promo_code      text,
  gross           integer not null,     -- 收取金額（已扣折扣）
  discount        integer not null default 0, -- 優惠碼折扣
  fee             integer not null,     -- 手續費
  refund          integer not null default 0, -- 退款金額
  net_received    integer not null,     -- Oen 實際收取金額 = gross - fee
  net             integer not null,     -- gross - fee - refund
  raw             jsonb not null,       -- 原始列（已移除姓名/email/電話/地址/統編等個資）
  source_file     text not null,
  imported_at     timestamptz not null default now(),
  constraint oen_charges_net_chk check (net = gross - fee - refund)
);
create index if not exists oen_charges_created_idx on public.oen_charges (created_at_oen);
create index if not exists oen_charges_paid_idx on public.oen_charges (paid_at);
create index if not exists oen_charges_status_idx on public.oen_charges (status);

create table if not exists public.oen_charge_lines (
  id              bigint generated always as identity primary key,
  charge_id       bigint not null references public.oen_charges(id) on delete cascade,
  line_no         smallint not null,
  line_type       text not null constraint oen_charge_lines_line_type_check check (line_type in ('ticket','membership','merch','adjustment','other')),
  item_text       text,                 -- 場次 - 票種（Oen 原文）
  qty             integer not null default 0,
  list_amount     integer not null,     -- 明細小計（分攤權重）
  show_id         uuid references public.shows(id),
  map_confidence  text not null,        -- 確定/推測/對不到/不適用
  map_note        text,
  tx_category     text,                 -- 對應 transactions.category（演出票房/周邊商品/付費會員）；手續費→平台手續、退款→退款
  gross           integer not null,     -- 分攤收取
  fee             integer not null,     -- 分攤手續費
  refund          integer not null,     -- 分攤退款
  net             integer not null,
  recon_batch     date,                 -- 對帳撥款批次（對應 transactions.date 批次；未撥款為 NULL）
  transaction_id  uuid references public.transactions(id), -- 保留：未來若有 1:1 對應
  constraint oen_charge_lines_uq unique (charge_id, line_no),
  constraint oen_charge_lines_net_chk check (net = gross - fee - refund)
);
create index if not exists oen_charge_lines_show_idx on public.oen_charge_lines (show_id);
create index if not exists oen_charge_lines_recon_idx on public.oen_charge_lines (show_id, tx_category, recon_batch);

-- 具名約束若因表早已存在而缺少，補上（正式庫是用同一份 DDL 建的，正常情況都已存在）
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'oen_charges_net_chk') then
    alter table public.oen_charges add constraint oen_charges_net_chk check (net = gross - fee - refund);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'oen_charge_lines_net_chk') then
    alter table public.oen_charge_lines add constraint oen_charge_lines_net_chk check (net = gross - fee - refund);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'oen_charge_lines_uq') then
    alter table public.oen_charge_lines add constraint oen_charge_lines_uq unique (charge_id, line_no);
  end if;
end $$;

-- 安全：比照 transactions（RLS 開啟、無 policy；anon/authenticated 無資料權限；service_role 只能讀）
alter table public.oen_charges enable row level security;
alter table public.oen_charge_lines enable row level security;
revoke all on public.oen_charges, public.oen_charge_lines from anon, authenticated, public;
revoke all on public.oen_charges, public.oen_charge_lines from service_role;
grant select on public.oen_charges, public.oen_charge_lines to service_role;
comment on table public.oen_charges is 'Oen 金流明細：每筆 Oen 金流一列（import_oen_ledger.py 匯入，charge_no upsert）';
comment on table public.oen_charge_lines is 'Oen 金流逐票/逐項明細，分攤收取/手續費/退款，對應 shows 與 transactions 類別';

-- 稽核：比照其他應用表掛 audit_row（正式庫建表時沒掛；這是唯一跟 000_ddl.sql 不同之處，只加 trigger 不動資料）
do $$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.oen_charges'::regclass and tgname = 'audit_row') then
    perform attach_audit('public.oen_charges');
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.oen_charge_lines'::regclass and tgname = 'audit_row') then
    perform attach_audit('public.oen_charge_lines');
  end if;
end $$;

insert into _migrations (name) values ('0012_oen_ledger') on conflict do nothing;
