// 저장소로 방 만들기 (시안 v3 CreateRoom.dc.html)
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { signIn } from '@/app/actions';
import { RepoPicker } from '@/components/RepoPicker';
import { Back, GitHubMark, Notice } from '@/components/ui';
import { GH_TOKEN_COOKIE, getMe } from '@/lib/auth';
import { GitHubError, installUrl, userRepos, type Repo } from '@/lib/github';
import { must, supabaseAdmin, supabaseUser } from '@/lib/supabase/server';

export default function NewRoom({ searchParams }: PageProps<'/rooms/new'>) {
  return (
    <main className="page">
      <div className="container" style={{ maxWidth: 1100 }}>
        <Back href="/">처음으로</Back>
        <header className="stack" style={{ gap: 4 }}>
          <h1 className="t-h1">저장소로 방 만들기</h1>
          <p className="t-sub">방으로 만들 GitHub 저장소를 고르세요. 저장소 협업자가 조원으로 들어와요.</p>
        </header>
        <Suspense fallback={<section className="card"><p className="t-sub">저장소 목록을 불러오는 중…</p></section>}>
          <Repos searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function Repos({ searchParams }: Pick<PageProps<'/rooms/new'>, 'searchParams'>) {
  const { error } = await searchParams;
  const me = await getMe();
  if (!me) redirect('/');

  const ghToken = (await cookies()).get(GH_TOKEN_COOKIE)?.value;
  let repos: Repo[] | null = null;
  if (ghToken) {
    try {
      repos = await userRepos(ghToken);
    } catch (e) {
      if (!(e instanceof GitHubError && e.status === 401)) throw e;
    }
  }
  if (!repos) {
    return (
      <section className="card" style={{ alignItems: 'flex-start' }}>
        <h2 className="t-h2">GitHub 인증이 만료되었어요</h2>
        <p className="t-body">저장소 목록을 보려면 다시 로그인하세요.</p>
        <form action={signIn}>
          <input type="hidden" name="next" value="/rooms/new" />
          <button type="submit" className="btn btn-github"><GitHubMark />GitHub로 다시 로그인</button>
        </form>
      </section>
    );
  }

  // 이미 방이 있는 저장소 (내가 조원이 아닐 수도 있어 서버 키로 확인한다)와, 그중 내가 이미 조원인 방 (RLS: 내 방만 보인다)
  const ids = repos.map((r) => r.id);
  const [existing, myRooms] = ids.length ? await Promise.all([
    supabaseAdmin().from('rooms').select('id, github_repo_id').in('github_repo_id', ids).then(must),
    (await supabaseUser()).from('rooms').select('id').in('github_repo_id', ids).then(must),
  ]) : [[], []];
  const roomOf = new Map(existing.map((r) => [r.github_repo_id, r.id]));
  const mine = new Set(myRooms.map((r) => r.id));

  return (
    <>
      <Notice error={error} />
      <RepoPicker
        repos={repos.map((r) => {
          const roomId = roomOf.get(r.id) ?? null;
          return { id: r.id, full_name: r.full_name, private: r.private, roomId, member: !!roomId && mine.has(roomId) };
        })}
        myLogin={me.github_login} installUrl={installUrl()}
      />
    </>
  );
}
