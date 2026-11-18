-- M10 F15: 방 화면 갱신을 폴링에서 Supabase Realtime(postgres_changes)으로 전환
-- 구독자의 RLS(방 active 조원·같은 방 사람)가 그대로 적용된다. DELETE 이벤트는 RLS가 적용되지 않으므로 웹은 INSERT·UPDATE만 구독한다.
alter publication supabase_realtime add table
  public.statuses, public.github_cards, public.room_members, public.issues, public.usage, public.rooms;
