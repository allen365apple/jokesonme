-- 本機資料庫測試：連結 Claude（change claude-ticket-tools task 1.1）
\set ON_ERROR_STOP on

begin;
set local app.actor = 'migration';
insert into users (id, display_name, member_name, role, status) values ('U_t', '測試', '測試', 'member', 'approved') on conflict (id) do nothing;
commit;

-- 沒有 actor 不能寫
do $$
begin
  begin
    insert into claude_tokens (user_id, token_hash) values ('U_t', repeat('a', 64));
    raise exception 'FAIL: insert without actor succeeded';
  exception when others then
    if sqlerrm not like 'audit: missing actor%' then raise; end if;
  end;
end $$;

begin;
set local app.actor = 'migration';
insert into claude_link_codes (user_id, code_hash, expires_at) values ('U_t', repeat('b', 64), now() + interval '10 minutes');
insert into claude_tokens (user_id, token_hash, device_name) values ('U_t', repeat('c', 64), '測試的 Mac');
-- 雜湊不能重複、格式必須是 64 位小寫十六進位（擋住誤存明碼）
do $$
begin
  begin insert into claude_tokens (user_id, token_hash) values ('U_t', repeat('c', 64)); raise exception 'FAIL: duplicate token hash';
  exception when unique_violation then null; end;
  begin insert into claude_tokens (user_id, token_hash) values ('U_t', 'jk_cl_plaintext'); raise exception 'FAIL: plaintext token accepted';
  exception when check_violation then null; end;
  begin insert into claude_link_codes (user_id, code_hash, expires_at) values ('U_t', 'jk_link_plain', now()); raise exception 'FAIL: plaintext code accepted';
  exception when check_violation then null; end;
end $$;
-- 撤銷是更新 revoked_at
update claude_tokens set revoked_at = now() where token_hash = repeat('c', 64);
commit;

do $$
begin
  if (select count(*) from audit_log where table_name = 'claude_tokens') < 2 then raise exception 'FAIL: expected audit rows for claude_tokens'; end if;
end $$;

set role service_role;
do $$
begin
  begin delete from claude_tokens; raise exception 'FAIL: service_role hard-deleted tokens';
  exception when insufficient_privilege then null; end;
  begin delete from claude_link_codes; raise exception 'FAIL: service_role hard-deleted codes';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set role anon;
do $$
begin
  begin perform 1 from claude_tokens; raise exception 'FAIL: anon can read tokens';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
\echo 'CLAUDE TOKENS TESTS PASSED'
