// 캐릭터·파트 선택 (시안 v3 CharacterSelect.dc.html). 처음 들어올 때(필수)와 이력 패널의 '캐릭터·파트 변경'에서 온다
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { CharacterSelect } from '@/components/CharacterSelect';
import { Back, Notice } from '@/components/ui';
import type { CharacterId, Part } from '@/constants/office';
import { getMe } from '@/lib/auth';
import { maybe, must, supabaseUser } from '@/lib/supabase/server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function CharacterPage({ params, searchParams }: PageProps<'/rooms/[id]/character'>) {
  return (
    <main className="page" style={{ paddingTop: 36 }}>
      <div className="container" style={{ maxWidth: 1080, gap: 26 }}>
        <Suspense fallback={<p className="t-sub">불러오는 중…</p>}>
          <Character params={params} searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function Character({ params, searchParams }: Pick<PageProps<'/rooms/[id]/character'>, 'params' | 'searchParams'>) {
  const { id } = await params;
  const { error } = await searchParams;
  if (!UUID.test(id)) notFound();
  const me = await getMe();
  if (!me) redirect('/');
  // RLS: 이 방의 active 조원이 아니면 null
  const sb = await supabaseUser();
  const room = maybe(await sb.from('rooms').select('id, full_name').eq('id', id).maybeSingle());
  if (!room) notFound();
  const rows = must(await sb.from('room_members').select('member_id, avatar, part').eq('room_id', id).eq('active', true));
  const mine = rows.find((r) => r.member_id === me.id);
  if (!mine) notFound();
  const inUse: Record<string, number> = {};
  for (const r of rows) if (r.avatar && r.member_id !== me.id) inUse[r.avatar] = (inUse[r.avatar] ?? 0) + 1;
  const changing = !!(mine.avatar && mine.part);

  return (
    <>
      {changing ? <Back href={`/rooms/${id}`}>방으로</Back> : <Back href="/">처음으로</Back>}
      <header className="stack" style={{ gap: 6 }}>
        <span className="pill" style={{ alignSelf: 'flex-start' }}>{room.full_name} 방에 입장하기</span>
        <h1 className="t-h1" style={{ fontSize: 28 }}>이 방에서 사용할 캐릭터와 파트를 골라주세요</h1>
        <p className="t-sub" style={{ fontSize: 14 }}>둘 다 골라야 입장할 수 있어요. 나중에 작업 이력 패널의 ‘캐릭터·파트 변경’에서 다시 바꿀 수 있어요.</p>
      </header>
      <Notice error={error} />
      <CharacterSelect roomId={id} current={{ character: mine.avatar as CharacterId | null, part: mine.part as Part | null }} inUse={inUse} />
    </>
  );
}
