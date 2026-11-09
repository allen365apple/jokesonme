-- 0017 開發票（change dev-tickets；spec dev-tickets「Ticket record」「Conflict-safe claiming」「Ticket history」）
-- 票與歷史都存在 Supabase。狀態轉換的權限判斷在 lib/tickets/flow.ts（純函式、有單元測試），
-- 這裡只負責「比對期望值後原子寫入＋同一交易寫歷史」，兩人同時認領只會有一個成功。
-- 不硬刪：沒有 DELETE 權限，結案用「不做」。

create table dev_tickets (
  id          uuid primary key default gen_random_uuid(),
  number      bigint generated always as identity unique,          -- 畫面顯示 T-<number>，不重用
  title       text not null check (char_length(btrim(title)) between 1 and 120),
  category    text not null check (category in ('feature', 'bug', 'process', 'data')),
  description text not null default '',
  status      text not null default 'open' check (status in ('open', 'in_progress', 'review', 'done', 'wontfix')),
  reporter_id text not null,                                       -- LINE userId
  owner_id    text,                                                -- 認領人；沒人認領為 null
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index dev_tickets_status_idx on dev_tickets (status, number desc);

create table dev_ticket_events (
  id        uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references dev_tickets(id),
  actor_id  text not null,
  action    text not null check (action in ('create', 'edit', 'claim', 'unclaim', 'deliver', 'accept', 'reject', 'wontfix', 'reopen')),
  note      text not null default '',
  at        timestamptz not null default now()
);
create index dev_ticket_events_ticket_idx on dev_ticket_events (ticket_id, at);

alter table dev_tickets enable row level security;
alter table dev_ticket_events enable row level security;
revoke all on dev_tickets, dev_ticket_events from public, anon, authenticated, service_role;
grant select, insert, update on dev_tickets to service_role;      -- 不給 DELETE／TRUNCATE
grant select, insert on dev_ticket_events to service_role;        -- 歷史只能新增
select attach_audit('dev_tickets');
select attach_audit('dev_ticket_events');

-- 開票：票與「create」事件在同一交易寫入。
create or replace function dev_ticket_create(p_row jsonb) returns dev_tickets
language plpgsql as $$
declare
  v dev_tickets;
begin
  insert into dev_tickets (title, category, description, reporter_id)
  values (btrim(p_row->>'title'), p_row->>'category', coalesce(p_row->>'description', ''), p_row->>'reporter_id')
  returning * into v;
  insert into dev_ticket_events (ticket_id, actor_id, action) values (v.id, v.reporter_id, 'create');
  return v;
end $$;

-- 狀態轉換：票的狀態與認領人都還是呼叫端看到的那樣才寫入，否則回 null（票剛被別人改過）。
-- p_patch 只接受 status、owner_id（有這個鍵才改，值可為 null）、title、category、description。
-- p_event = { actor_id, action, note }。
create or replace function dev_ticket_apply(p_id uuid, p_expect_status text, p_expect_owner text, p_patch jsonb, p_event jsonb)
returns dev_tickets
language plpgsql as $$
declare
  v dev_tickets;
begin
  update dev_tickets
     set status      = coalesce(p_patch->>'status', status),
         owner_id    = case when p_patch ? 'owner_id' then p_patch->>'owner_id' else owner_id end,
         title       = coalesce(btrim(p_patch->>'title'), title),
         category    = coalesce(p_patch->>'category', category),
         description = coalesce(p_patch->>'description', description),
         updated_at  = now()
   where id = p_id
     and status = p_expect_status
     and owner_id is not distinct from p_expect_owner
  returning * into v;
  if not found then
    return null;
  end if;
  insert into dev_ticket_events (ticket_id, actor_id, action, note)
  values (p_id, p_event->>'actor_id', p_event->>'action', coalesce(p_event->>'note', ''));
  return v;
end $$;

-- 函式只給後端（service_role）呼叫；PostgREST 預設會把 execute 給 public，要明確收回
revoke all on function dev_ticket_create(jsonb), dev_ticket_apply(uuid, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function dev_ticket_create(jsonb), dev_ticket_apply(uuid, text, text, jsonb, jsonb) to service_role;

insert into _migrations (name) values ('0017_dev_tickets') on conflict do nothing;
