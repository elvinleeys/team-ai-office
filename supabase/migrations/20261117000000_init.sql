-- M1: 팀 작업 현황 3D 오피스 데이터 모델 (PRD 9장)
-- 쓰기: MCP 서버·Next.js 서버 API가 service_role 키로만 한다 (service_role은 RLS 우회).
-- 읽기: 브라우저는 로그인 사용자(authenticated)로 읽고, RLS가 방 조원 여부를 검사한다.

-- 사람. 협업자 동기화로 먼저 생기고, 본인이 로그인하면 auth_user_id가 채워진다.
create table members (
  id           uuid primary key default gen_random_uuid(),
  github_id    bigint not null unique,
  github_login text not null,
  name         text,
  avatar_url   text,
  avatar_color text not null default '#888888',
  auth_user_id uuid unique references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

-- 저장소 하나 = 방 하나. github_repo_id는 저장소 이름이 바뀌어도 유지된다.
create table rooms (
  id              uuid primary key default gen_random_uuid(),
  github_repo_id  bigint not null unique,
  full_name       text not null,              -- owner/name
  installation_id bigint not null,
  created_by      uuid references members(id) on delete set null,
  created_at      timestamptz not null default now(),
  synced_at       timestamptz
);
-- GitHub 저장소 이름은 대소문자를 구분하지 않는다. MCP는 lower(full_name)으로 찾는다.
create unique index rooms_full_name_idx on rooms (lower(full_name));

-- 저장소에서 빠진 협업자는 삭제하지 않고 active = false (이력 보존)
create table room_members (
  room_id   uuid not null references rooms(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  active    boolean not null default true,
  joined_at timestamptz not null default now(),
  primary key (room_id, member_id)
);
create index room_members_member_idx on room_members (member_id);

-- 방별·조원별 현재 상태 (방마다 1인 1행)
create table statuses (
  room_id    uuid not null,
  member_id  uuid not null,
  status     text not null check (status in ('coding', 'meeting', 'break', 'done')),
  task       text not null default '',
  started_at timestamptz not null default now(),
  primary key (room_id, member_id),
  foreign key (room_id, member_id) references room_members on delete cascade
);

-- 사람 단위 HP(7일)·MP(5시간) 사용률. source: auto = 로컬 수집기, self = 자기 보고
create table usage (
  member_id    uuid primary key references members(id) on delete cascade,
  hp_pct       numeric(5,2) not null check (hp_pct between 0 and 100),
  mp_pct       numeric(5,2) not null check (mp_pct between 0 and 100),
  hp_resets_at timestamptz,
  mp_resets_at timestamptz,
  source       text not null check (source in ('auto', 'self')),
  updated_at   timestamptz not null default now()
);

-- resolve_issue(issue_id)를 대화로 부르기 쉽게 숫자 id 사용
create table issues (
  id          bigint generated always as identity primary key,
  room_id     uuid not null,
  member_id   uuid not null,
  title       text not null check (length(trim(title)) > 0),
  state       text not null default 'open' check (state in ('open', 'resolved')),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  check ((state = 'open') = (resolved_at is null)),
  foreign key (room_id, member_id) references room_members on delete cascade
);
create index issues_open_idx on issues (room_id) where state = 'open';

-- 상태 변경·완료 이력
create table logs (
  id         bigint generated always as identity primary key,
  room_id    uuid not null,
  member_id  uuid not null,
  task       text not null default '',
  status     text not null check (status in ('coding', 'meeting', 'break', 'done')),
  created_at timestamptz not null default now(),
  foreign key (room_id, member_id) references room_members on delete cascade
);
create index logs_room_member_created_idx on logs (room_id, member_id, created_at desc);

-- MCP 개인 토큰. 원문은 저장하지 않고 SHA-256 hex만 저장한다.
create table api_tokens (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references members(id) on delete cascade,
  token_hash   text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  label        text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);
create index api_tokens_member_idx on api_tokens (member_id);

-- ---------------------------------------------------------------------------
-- 권한: 브라우저(anon/authenticated)는 쓰기 불가, anon은 읽기도 불가, api_tokens는 아예 불가
-- ---------------------------------------------------------------------------
revoke all on members, rooms, room_members, statuses, usage, issues, logs, api_tokens from anon;
revoke insert, update, delete, truncate on members, rooms, room_members, statuses, usage, issues, logs from authenticated;
revoke all on api_tokens from authenticated;

-- RLS 헬퍼. security definer로 room_members를 읽어 정책 재귀를 피한다.
-- public이 아닌 private 스키마에 둬서 PostgREST RPC로 노출되지 않게 한다.
create schema private;
grant usage on schema private to authenticated;

create function private.current_member_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.members where auth_user_id = auth.uid()
$$;

create function private.is_room_member(rid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.room_members
    where room_id = rid and member_id = private.current_member_id() and active
  )
$$;

-- 본인이거나, 내가 active 조원인 방에 속한(비활성 포함) 사람
create function private.shares_room_with(mid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select mid = private.current_member_id() or exists (
    select 1
    from public.room_members me
    join public.room_members other on other.room_id = me.room_id
    where me.member_id = private.current_member_id() and me.active
      and other.member_id = mid
  )
$$;

revoke all on function private.current_member_id(), private.is_room_member(uuid), private.shares_room_with(uuid) from public;
grant execute on function private.current_member_id(), private.is_room_member(uuid), private.shares_room_with(uuid) to authenticated;

alter table members      enable row level security;
alter table rooms        enable row level security;
alter table room_members enable row level security;
alter table statuses     enable row level security;
alter table usage        enable row level security;
alter table issues       enable row level security;
alter table logs         enable row level security;
alter table api_tokens   enable row level security;  -- 정책 없음 = service_role만 접근

create policy "room members read" on rooms        for select to authenticated using (private.is_room_member(id));
create policy "room members read" on room_members for select to authenticated using (private.is_room_member(room_id));
create policy "room members read" on statuses     for select to authenticated using (private.is_room_member(room_id));
create policy "room members read" on issues       for select to authenticated using (private.is_room_member(room_id));
create policy "room members read" on logs         for select to authenticated using (private.is_room_member(room_id));
create policy "roommates read"    on members      for select to authenticated using (private.shares_room_with(id));
create policy "roommates read"    on usage        for select to authenticated using (private.shares_room_with(member_id));
