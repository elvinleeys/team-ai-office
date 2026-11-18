-- M1·M9 RLS·제약 조건 검사. 로컬 Supabase DB에서 실행:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/rls_check.sql
-- 실패하면 오류로 멈추고, 통과하면 마지막에 RLS CHECK PASSED를 출력한다. 데이터는 롤백된다.
\set ON_ERROR_STOP on
begin;

-- 사용자: A·B = room1, C = room2, D = 로그인했지만 방 없음
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b'),
  ('00000000-0000-0000-0000-00000000000c'), ('00000000-0000-0000-0000-00000000000d');
insert into members (id, github_id, github_login, auth_user_id) values
  ('10000000-0000-0000-0000-00000000000a', 1, 'a', '00000000-0000-0000-0000-00000000000a'),
  ('10000000-0000-0000-0000-00000000000b', 2, 'b', '00000000-0000-0000-0000-00000000000b'),
  ('10000000-0000-0000-0000-00000000000c', 3, 'c', '00000000-0000-0000-0000-00000000000c'),
  ('10000000-0000-0000-0000-00000000000d', 4, 'd', '00000000-0000-0000-0000-00000000000d'),
  ('10000000-0000-0000-0000-00000000000e', 5, 'e-not-logged-in', null);
insert into rooms (id, github_repo_id, full_name, installation_id) values
  ('20000000-0000-0000-0000-000000000001', 101, 'team/one', 1),
  ('20000000-0000-0000-0000-000000000002', 102, 'other/two', 2);
insert into room_members (room_id, member_id) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000b'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000e'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-00000000000c');
insert into statuses (room_id, member_id, status, task) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a', 'coding', 'login API'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000b', 'meeting', ''),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-00000000000c', 'break', '');
insert into usage (member_id, hp_pct, mp_pct, source) values
  ('10000000-0000-0000-0000-00000000000a', 50, 50, 'auto'),
  ('10000000-0000-0000-0000-00000000000c', 10, 90, 'self');
insert into issues (room_id, member_id, title) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a', 'blocked'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-00000000000c', 'secret repo issue');
insert into logs (room_id, member_id, task, status) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a', 'login API', 'coding');
-- M9: 칸반 카드 (room1·room2), 방별 PAT 암호문
insert into github_cards (room_id, item_id, member_id, column_name, state, title, item_updated_at, moved_at) values
  ('20000000-0000-0000-0000-000000000001', 'I1', '10000000-0000-0000-0000-00000000000a', 'In progress', 'progress', 'card one', now(), now()),
  ('20000000-0000-0000-0000-000000000002', 'I2', '10000000-0000-0000-0000-00000000000c', 'In progress', 'progress', 'secret card', now(), now());
insert into room_secrets (room_id, github_pat_enc, pat_login) values
  ('20000000-0000-0000-0000-000000000001', 'v1:iv:tag:ct', 'a'),
  ('20000000-0000-0000-0000-000000000002', 'v1:iv:tag:ct', 'c');

-- 제약 조건 (postgres 권한으로)
do $$
begin
  begin insert into statuses (room_id, member_id, status) values ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-00000000000c', 'sleeping') on conflict (room_id, member_id) do update set status = excluded.status; raise exception 'FAIL: invalid status accepted';
  exception when check_violation then null; end;
  begin insert into usage (member_id, hp_pct, mp_pct, source) values ('10000000-0000-0000-0000-00000000000b', 101, 0, 'auto'); raise exception 'FAIL: hp 101 accepted';
  exception when check_violation then null; end;
  begin insert into statuses (room_id, member_id, status) values ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-00000000000a', 'coding'); raise exception 'FAIL: status for non-room-member accepted';
  exception when foreign_key_violation then null; end;
  begin insert into issues (room_id, member_id, title, state) values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a', 'x', 'resolved'); raise exception 'FAIL: resolved issue without resolved_at accepted';
  exception when check_violation then null; end;
  begin insert into issues (room_id, member_id, title) values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a', '   '); raise exception 'FAIL: blank issue title accepted';
  exception when check_violation then null; end;
  begin insert into rooms (github_repo_id, full_name, installation_id) values (103, 'TEAM/ONE', 1); raise exception 'FAIL: duplicate full_name (case) accepted';
  exception when unique_violation then null; end;
  -- M9
  begin insert into room_secrets (room_id, github_pat_enc, pat_login) values ('20000000-0000-0000-0000-000000000001', 'ghp_plaintext', 'a') on conflict (room_id) do update set github_pat_enc = excluded.github_pat_enc; raise exception 'FAIL: plaintext PAT accepted';
  exception when check_violation then null; end;
  begin insert into github_cards (room_id, item_id, member_id, column_name, state, item_updated_at, moved_at) values ('20000000-0000-0000-0000-000000000001', 'X', '10000000-0000-0000-0000-00000000000a', 'x', 'doing', now(), now()); raise exception 'FAIL: invalid card state accepted';
  exception when check_violation then null; end;
  begin update statuses set mode = 'pinned' where member_id = '10000000-0000-0000-0000-00000000000a'; raise exception 'FAIL: pinned with expires_at accepted';
  exception when check_violation then null; end;
  begin update room_members set part = 'qa' where member_id = '10000000-0000-0000-0000-00000000000a'; raise exception 'FAIL: invalid part accepted';
  exception when check_violation then null; end;
  insert into logs (room_id, member_id, status, source) values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a', 'idle', 'github');
  delete from logs where status = 'idle';
end $$;

-- 사용자 A: room1만 보인다
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
do $$
begin
  assert (select count(*) from rooms) = 1, 'A rooms';
  assert (select count(*) from room_members) = 3, 'A room_members';
  assert (select count(*) from members) = 3, 'A members (a, b, e)';
  assert not exists (select 1 from members where github_login = 'c'), 'A sees c';
  assert (select count(*) from statuses) = 2, 'A statuses';
  assert (select count(*) from issues) = 1, 'A issues';
  assert (select count(*) from logs) = 1, 'A logs';
  assert (select count(*) from usage) = 1, 'A usage (c hidden)';
  -- M9: 카드·최종 상태는 내 방만, PAT 암호문은 못 읽고, 쓰기·상태 함수 실행 불가
  assert (select count(*) from github_cards) = 1, 'A github_cards';
  assert (select count(*) from effective_statuses) = 3, 'A effective_statuses (a, b, e)';
  assert not exists (select 1 from effective_statuses where room_id = '20000000-0000-0000-0000-000000000002'), 'A sees room2 status';
  begin perform count(*) from room_secrets; raise exception 'FAIL: A read room_secrets';
  exception when insufficient_privilege then null; end;
  begin update github_cards set title = 'hacked'; raise exception 'FAIL: A updated github_cards';
  exception when insufficient_privilege then null; end;
  begin perform public.set_status('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000b', 'done', ''); raise exception 'FAIL: A ran set_status';
  exception when insufficient_privilege then null; end;
  begin perform public.release_status('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000b'); raise exception 'FAIL: A ran release_status';
  exception when insufficient_privilege then null; end;
  begin insert into statuses (room_id, member_id, status) values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000b', 'done'); raise exception 'FAIL: A wrote statuses';
  exception when insufficient_privilege then null; end;
  begin update statuses set task = 'hacked'; raise exception 'FAIL: A updated statuses';
  exception when insufficient_privilege then null; end;
  begin insert into room_members (room_id, member_id) values ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-00000000000a'); raise exception 'FAIL: A joined room2';
  exception when insufficient_privilege then null; end;
end $$;

-- 사용자 C: room2만 보인다
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
do $$
begin
  assert (select count(*) from rooms) = 1 and (select full_name from rooms) = 'other/two', 'C rooms';
  assert (select count(*) from members) = 1, 'C members (self only)';
  assert (select count(*) from issues) = 1 and (select title from issues) = 'secret repo issue', 'C issues';
  assert (select count(*) from github_cards) = 1 and (select title from github_cards) = 'secret card', 'C github_cards';
  assert (select count(*) from effective_statuses) = 1, 'C effective_statuses';
end $$;

-- 사용자 D: 방이 없으면 자기 자신만 보인다
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","role":"authenticated"}', true);
do $$
begin
  assert (select count(*) from rooms) = 0, 'D rooms';
  assert (select count(*) from members) = 1, 'D members (self)';
  assert (select count(*) from statuses) = 0, 'D statuses';
end $$;

-- B가 저장소에서 빠지면(active=false) 방이 안 보이고, A에게는 B가 여전히 보인다 (이력 표시용)
reset role;
update room_members set active = false where member_id = '10000000-0000-0000-0000-00000000000b';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
do $$
begin
  assert (select count(*) from rooms) = 0, 'inactive B rooms';
  assert (select count(*) from statuses) = 0, 'inactive B statuses';
  assert (select count(*) from members) = 1, 'inactive B members (self)';
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
do $$
begin
  assert exists (select 1 from members where github_login = 'b'), 'A still sees inactive B';
end $$;

-- anon: 아무것도 못 읽는다
reset role;
set local role anon;
select set_config('request.jwt.claims', '', true);
do $$
declare t text;
begin
  foreach t in array array['members','rooms','room_members','statuses','usage','issues','logs','github_cards','room_secrets','effective_statuses'] loop
    begin execute format('select count(*) from %I', t); raise exception 'FAIL: anon read %', t;
    exception when insufficient_privilege then null; end;
  end loop;
end $$;

-- 헬퍼 함수가 PostgREST에 노출되는 public 스키마에 없어야 한다
reset role;
do $$
begin
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'public' and p.proname in ('is_room_member','shares_room_with','current_member_id')),
         'helpers leaked into public';
end $$;

rollback;
\echo RLS CHECK PASSED
