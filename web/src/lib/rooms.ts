import 'server-only';
import { collaborators, installationToken } from './github';
import { check, must, supabaseAdmin } from './supabase/server';

/**
 * 저장소 협업자를 room_members로 동기화한다.
 * 빠진 사람은 삭제하지 않고 active=false (이력 보존). 호출 전에 권한 검사를 끝내야 한다.
 */
export async function syncRoom(roomId: string): Promise<void> {
  const db = supabaseAdmin();
  const room = must(await db.from('rooms').select('full_name, installation_id').eq('id', roomId).single());
  const list = await collaborators(await installationToken(room.installation_id), room.full_name);

  // 이름·auth_user_id는 로그인 때 채우므로 여기서는 GitHub 정보만 갱신한다
  const members = list.length
    ? must(
        await db.from('members')
          .upsert(list.map((c) => ({ github_id: c.id, github_login: c.login, avatar_url: c.avatar_url })), { onConflict: 'github_id' })
          .select('id'),
      )
    : [];
  const ids = members.map((m) => m.id);

  if (ids.length) check(await db.from('room_members').upsert(ids.map((member_id) => ({ room_id: roomId, member_id, active: true }))));
  let gone = db.from('room_members').update({ active: false }).eq('room_id', roomId);
  if (ids.length) gone = gone.not('member_id', 'in', `(${ids.join(',')})`);
  check(await gone);
  check(await db.from('rooms').update({ synced_at: new Date().toISOString() }).eq('id', roomId));
}
