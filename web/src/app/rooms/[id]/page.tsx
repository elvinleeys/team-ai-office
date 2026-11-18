// 방 (시안 v3 Main.dc.html). 3D 방·헤더·구역 카드·이력 패널·조원 목록은 Room(클라이언트)이 그린다
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { Room as Room3D } from '@/components/Room';
import { Back, Notice } from '@/components/ui';
import type { Part } from '@/constants/office';
import { getMe } from '@/lib/auth';
import { maybe, must, supabaseUser } from '@/lib/supabase/server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function RoomPage({ params, searchParams }: PageProps<'/rooms/[id]'>) {
  return (
    <main className="page" style={{ padding: '20px 24px 40px' }}>
      <div className="container" style={{ gap: 14 }}>
        <Back href="/">처음으로</Back>
        <Suspense fallback={<p className="t-sub">방을 불러오는 중…</p>}>
          <Room params={params} searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function Room({ params, searchParams }: Pick<PageProps<'/rooms/[id]'>, 'params' | 'searchParams'>) {
  const { id } = await params;
  const { error } = await searchParams;
  if (!UUID.test(id)) notFound();
  const me = await getMe();
  if (!me) redirect('/');

  // RLS: 이 방의 active 조원이 아니면 room이 null로 온다
  const sb = await supabaseUser();
  const room = maybe(await sb.from('rooms').select('id, full_name, synced_at, created_by, project_owner').eq('id', id).maybeSingle());
  if (!room) notFound();
  const rows = must(
    await sb.from('room_members')
      .select('member_id, part, avatar, status_source, members(id, github_login, name)')
      .eq('room_id', id).eq('active', true),
  );
  const members = rows
    .filter((r) => r.members !== null)
    .map((r) => ({ ...r.members!, part: r.part as Part | null, avatar: r.avatar, status_source: r.status_source }))
    .sort((a, b) => a.github_login.localeCompare(b.github_login));
  const mine = members.find((m) => m.id === me.id);
  if (!mine) notFound();
  // 캐릭터·파트를 아직 안 골랐으면 선택 화면 (필수, 기본값 없음)
  if (!mine.part || !mine.avatar) redirect(`/rooms/${id}/character`);

  return (
    <>
      <Notice error={error} />
      <Room3D
        roomId={room.id} title={room.full_name} meId={me.id} isOwner={room.created_by === me.id} projectLinked={room.project_owner !== null}
        syncedAt={room.synced_at}
        members={members.map((m) => ({
          id: m.id, login: m.github_login, name: m.name ?? m.github_login, character: m.avatar, part: m.part, statusSource: m.status_source,
        }))}
      />
    </>
  );
}
