-- 0018 連結 Claude（change claude-ticket-tools；spec「Link code issuance」「Link exchange」「Key revocation」）
-- 連結碼與金鑰都只存 SHA-256 雜湊；拿到資料庫也拿不到能用的碼或金鑰。不給 DELETE：撤銷用 revoked_at，碼用 used_at。

create table claude_link_codes (
  id         uuid primary key default gen_random_uuid(),
  user_id    text not null references users(id),
  code_hash  text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);
create index claude_link_codes_user_idx on claude_link_codes (user_id) where used_at is null;

create table claude_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      text not null references users(id),
  token_hash   text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  device_name  text not null default '' check (char_length(device_name) <= 80),
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);
create index claude_tokens_user_idx on claude_tokens (user_id, created_at desc);

alter table claude_link_codes enable row level security;
alter table claude_tokens enable row level security;
revoke all on claude_link_codes, claude_tokens from public, anon, authenticated, service_role;
grant select, insert, update on claude_link_codes, claude_tokens to service_role;
select attach_audit('claude_link_codes');
select attach_audit('claude_tokens');

insert into _migrations (name) values ('0018_claude_tokens') on conflict do nothing;
