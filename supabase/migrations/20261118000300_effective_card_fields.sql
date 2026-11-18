-- effective_statuses 버그 수정 (2026-11-18 M9 실제 칸반 확인 중 발견)
-- 진행 카드(p)와 최근 Done 카드(d)를 열마다 coalesce로 합쳐, 진행 카드의 null 값(초안의 url·number, 파트 없음)에
-- 다른 카드 값이 섞였다 (초안 카드에 Done 이슈 URL이 붙음). 카드 값은 고른 카드 하나에서만 가져온다.
create or replace view public.effective_statuses with (security_invoker = true) as
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
    case when p.item_id is not null then p.title else d.title end as task,
    case when p.item_id is not null then p.moved_at else d.moved_at end as started_at,
    coalesce(p.state = 'review', false) as review,
    case when p.item_id is not null then p.url else d.url end as card_url,
    case when p.item_id is not null then p.number else d.number end as card_number,
    case when p.item_id is not null then p.is_draft else d.is_draft end as card_draft,
    case when p.item_id is not null then p.part else d.part end as card_part,
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
