-- M9: GitHub Projects(칸반) → 상태 연동 + 직접 선택 (PRD F16~F21)
-- 레이어: statuses = 직접 선택(MCP·웹), github_cards = 칸반 동기화 결과. 최종 상태는 effective_statuses 뷰 한 곳에서 계산한다.

-- ---------------------------------------------------------------------------
-- 조원(방별): 상태 출처, 파트, 캐릭터 카드
-- ---------------------------------------------------------------------------
alter table room_members
  add column status_source text not null default 'manual' check (status_source in ('github', 'manual')),
  add column part   text check (part in ('dev', 'design', 'plan')),  -- null = 아직 캐릭터 카드를 고르지 않음
  add column avatar text check (avatar in ('a', 'b', 'c', 'd'));     -- web/src/constants/office.ts AVATARS id

-- ---------------------------------------------------------------------------
-- 직접 선택: timed = expires_at까지, pinned = 해제할 때까지
-- ---------------------------------------------------------------------------
alter table statuses
  add column mode text not null default 'timed' check (mode in ('timed', 'pinned')),
  add column expires_at timestamptz;
update statuses set expires_at = started_at + interval '2 hours';
alter table statuses add constraint statuses_mode_expiry check ((mode = 'pinned') = (expires_at is null));

-- 이력: 칸반 이동(대기 포함)도 남긴다
alter table logs drop constraint logs_status_check;
alter table logs
  add constraint logs_status_check check (status in ('coding', 'meeting', 'break', 'done', 'idle')),
  add column source text not null default 'manual' check (source in ('manual', 'github'));

-- ---------------------------------------------------------------------------
-- 방의 칸반 연결·설정·동기화 상태 (비밀 값 없음: 조원이 읽는다)
-- ---------------------------------------------------------------------------
alter table rooms
  add column project_owner_type text check (project_owner_type in ('org', 'user')),
  add column project_owner  text,
  add column project_number int check (project_number > 0),
  add column project_installation_id bigint,  -- org 프로젝트: 그 org에 설치된 App installation
  add column github_config jsonb not null default '{
    "statusField": "Status",
    "partField": "파트",
    "columns": {"Backlog": "idle", "Ready": "idle", "In progress": "progress", "In review": "review", "Done": "done"},
    "parts": {"개발": "dev", "디자인": "design", "기획": "plan"}
  }'::jsonb,
  add column github_synced_at timestamptz,       -- 마지막 성공
  add column github_sync_error text,             -- null = 마지막 시도 성공
  add column github_sync_failed_at timestamptz,
  add constraint rooms_project_all_or_none check (
    (project_owner_type is null) = (project_owner is null) and (project_owner is null) = (project_number is null)
  );

-- 개인 소유 프로젝트용 classic PAT (read:project). AES-256-GCM 암호문만 저장. 정책 없음 = 서버(service_role)만 접근
create table room_secrets (
  room_id        uuid primary key references rooms(id) on delete cascade,
  github_pat_enc text not null check (github_pat_enc like 'v1:%'),
  pat_login      text not null,          -- PAT 주인 (표시용)
  pat_expires_at timestamptz,            -- GitHub 응답 헤더 기준. null = 만료 없음
  set_by         uuid references members(id) on delete set null,
  set_at         timestamptz not null default now()
);

-- 칸반 카드 (카드 × 담당자). 동기화가 통째로 맞춘다
create table github_cards (
  room_id         uuid not null,
  item_id         text not null,          -- ProjectV2Item node id
  member_id       uuid not null,
  column_name     text not null,          -- GitHub 열 이름 그대로
  state           text not null check (state in ('idle', 'progress', 'review', 'done')),
  title           text not null default '',
  url             text,                   -- 초안(draft issue)은 null
  number          int,                    -- 초안은 null
  is_draft        boolean not null default false,
  part            text check (part in ('dev', 'design', 'plan')),
  item_updated_at timestamptz not null,   -- 카드 수정 시각: 진행 중 카드 여러 개면 가장 최근 것
  moved_at        timestamptz not null,   -- 열(Status) 값이 바뀐 시각: Done 30분 규칙, 경과 시간
  primary key (room_id, item_id, member_id),
  foreign key (room_id, member_id) references room_members on delete cascade
);
create index github_cards_member_idx on github_cards (room_id, member_id);

revoke all on room_secrets, github_cards from anon;
revoke all on room_secrets from authenticated;
revoke insert, update, delete, truncate on github_cards from authenticated;
alter table room_secrets enable row level security;
alter table github_cards enable row level security;
create policy "room members read" on github_cards for select to authenticated using (private.is_room_member(room_id));

-- ---------------------------------------------------------------------------
-- 직접 선택 쓰기 (MCP update_status·log_done·release_status, 웹 서버 액션이 공용). service_role만 실행
-- 같은 status·task면 started_at을 유지한다 (장기 작업 경고 F9). statuses·logs를 한 트랜잭션으로 쓴다
-- ---------------------------------------------------------------------------
create function public.set_status(p_room uuid, p_member uuid, p_status text, p_task text, p_mode text default 'timed')
returns text language plpgsql security invoker set search_path = '' as $$
declare
  cur public.statuses;
begin
  select * into cur from public.statuses where room_id = p_room and member_id = p_member for update;
  insert into public.statuses as s (room_id, member_id, status, task, started_at, mode, expires_at)
  values (p_room, p_member, p_status, p_task,
          case when cur.status = p_status and cur.task = p_task then cur.started_at else now() end,
          p_mode, case when p_mode = 'timed' then now() + interval '2 hours' end)
  on conflict (room_id, member_id) do update
    set status = excluded.status, task = excluded.task, started_at = excluded.started_at,
        mode = excluded.mode, expires_at = excluded.expires_at;
  if cur.status is distinct from p_status or cur.task is distinct from p_task then
    insert into public.logs (room_id, member_id, status, task, source) values (p_room, p_member, p_status, p_task, 'manual');
    return 'changed';
  end if;
  return 'same';
end $$;

-- "칸반으로 돌아가기": 직접 선택을 지금 만료시킨다. 직접 선택이 없었으면 false
create function public.release_status(p_room uuid, p_member uuid)
returns boolean language sql security invoker set search_path = '' as $$
  with u as (
    update public.statuses set mode = 'timed', expires_at = now()
    where room_id = p_room and member_id = p_member and (mode = 'pinned' or expires_at > now())
    returning 1
  ) select exists (select 1 from u)
$$;

revoke all on function public.set_status(uuid, uuid, text, text, text), public.release_status(uuid, uuid) from public, anon, authenticated;
grant execute on function public.set_status(uuid, uuid, text, text, text), public.release_status(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 최종 상태 (F15·F17·F20). 우선순위: 유효한 직접 선택 > status_source = github면 칸반 > 기존 직접 선택 값
-- 칸반: 진행/검토 카드(가장 최근 수정) → coding, Done 30분 이내 → done, 그 외 → idle(대기)
-- security_invoker: 읽는 사람 권한으로 실행되어 statuses·github_cards·room_members RLS가 그대로 적용된다
-- ---------------------------------------------------------------------------
create view public.effective_statuses with (security_invoker = true) as
with prog as (
  select c.*, row_number() over w as rn, count(*) over (partition by c.room_id, c.member_id) as n
  from public.github_cards c
  where c.state in ('progress', 'review')
  window w as (partition by c.room_id, c.member_id order by c.item_updated_at desc, c.item_id)
),
recent_done as (
  select distinct on (room_id, member_id) *
  from public.github_cards
  where state = 'done' and moved_at > now() - interval '30 minutes'
  order by room_id, member_id, moved_at desc
),
gh as (
  select rm.room_id, rm.member_id,
    case when p.item_id is not null then 'coding' when d.item_id is not null then 'done' else 'idle' end as status,
    coalesce(p.title, d.title) as task,
    coalesce(p.moved_at, d.moved_at) as started_at,
    coalesce(p.state = 'review', false) as review,
    coalesce(p.url, d.url) as card_url,
    coalesce(p.number, d.number) as card_number,
    coalesce(p.is_draft, d.is_draft) as card_draft,
    coalesce(p.part, d.part) as card_part,
    coalesce(p.n, 0)::int as progress_count
  from public.room_members rm
  left join prog p on p.room_id = rm.room_id and p.member_id = rm.member_id and p.rn = 1
  left join recent_done d on d.room_id = rm.room_id and d.member_id = rm.member_id
),
base as (
  select rm.room_id, rm.member_id, rm.status_source, rm.part as member_part, rm.avatar,
    s.status as m_status, s.task as m_task, s.started_at as m_started_at, s.mode, s.expires_at,
    (s.member_id is not null and (s.mode = 'pinned' or s.expires_at > now())) as manual_valid,
    gh.status, gh.task, gh.started_at, gh.review, gh.card_url, gh.card_number, gh.card_draft, gh.card_part, gh.progress_count
  from public.room_members rm
  left join public.statuses s on s.room_id = rm.room_id and s.member_id = rm.member_id
  join gh on gh.room_id = rm.room_id and gh.member_id = rm.member_id
  where rm.active
)
select room_id, member_id, status_source, member_part, avatar,
  case when use_gh then status else m_status end as status,
  case when use_gh then coalesce(task, '') else m_task end as task,
  case when use_gh then started_at else m_started_at end as started_at,
  case when use_gh then 'github'
       when mode = 'pinned' then 'manual_pinned'
       when mode = 'timed' then 'manual_timed' end as source,
  case when use_gh then null else expires_at end as expires_at,
  use_gh and review as review,
  case when use_gh then card_url end as card_url,
  case when use_gh then card_number end as card_number,
  case when use_gh then card_draft end as card_draft,
  coalesce(case when use_gh then card_part end, member_part) as part,
  case when use_gh then progress_count else 0 end as progress_count,
  -- 직접 선택에 가려진 칸반 상태 (github 조원만)
  case when shadowed then status end as shadow_status,
  case when shadowed then task end as shadow_task,
  case when shadowed then review end as shadow_review,
  case when shadowed then card_url end as shadow_card_url,
  case when shadowed then card_number end as shadow_card_number,
  case when shadowed then card_draft end as shadow_card_draft
from (
  select b.*,
    (not b.manual_valid and b.status_source = 'github') as use_gh,
    (b.manual_valid and b.status_source = 'github') as shadowed
  from base b
) x;

revoke all on public.effective_statuses from anon;
grant select on public.effective_statuses to authenticated;
