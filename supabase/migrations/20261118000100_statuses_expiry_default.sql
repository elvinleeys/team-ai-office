-- 직접 선택 기본값 = 2시간 만료(timed). expires_at을 빼고 insert해도 statuses_mode_expiry 제약을 만족하게 한다.
-- pinned는 expires_at = null을 명시한다 (set_status가 처리).
alter table statuses alter column expires_at set default now() + interval '2 hours';
