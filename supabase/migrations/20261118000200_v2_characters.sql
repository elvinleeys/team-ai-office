-- 디자인 시안 v2: 캐릭터 id를 이름 기반(냥냥·새싹·삐삐·몽글)으로 바꾸고, PAT 끝 4자리를 표시용으로 저장한다
alter table room_members drop constraint room_members_avatar_check;
update room_members set avatar = case avatar when 'a' then 'nyang' when 'b' then 'sprout' when 'c' then 'ppi' when 'd' then 'mong' end
where avatar is not null;
alter table room_members add constraint room_members_avatar_check check (avatar in ('nyang', 'sprout', 'ppi', 'mong'));

-- "등록됨 · 끝자리 a1b2" 표시용. 원문은 암호문(github_pat_enc)으로만 남는다
alter table room_secrets add column pat_last4 text check (pat_last4 ~ '^[A-Za-z0-9_]{4}$');
