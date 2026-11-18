// 로그인 전: 랜딩 (시안 v3 Landing.dc.html) / 로그인 후: 홈 (Home.dc.html)
import Link from 'next/link';
import { Suspense } from 'react';
import { signIn, signOut } from './actions';
import { McpPanel } from '@/components/McpPanel';
import { Cube, GitHubMark, I24, Notice } from '@/components/ui';
import { getMe } from '@/lib/auth';
import { env } from '@/lib/env';
import { must, supabaseUser } from '@/lib/supabase/server';

// 방 목록 아이콘 바탕 (3D 방 팔레트 포인트 색, 순서대로)
const TINTS = ['var(--peach)', 'var(--periwinkle)', 'var(--mint)', 'var(--lilac)', 'var(--butter)', 'var(--rose)'];

export default function Home({ searchParams }: PageProps<'/'>) {
  return (
    <Suspense fallback={<main className="page"><p className="t-sub">불러오는 중…</p></main>}>
      <HomeContent searchParams={searchParams} />
    </Suspense>
  );
}

async function HomeContent({ searchParams }: Pick<PageProps<'/'>, 'searchParams'>) {
  const { error } = await searchParams;
  const me = await getMe();
  if (!me) return <Landing error={error} />;

  const sb = await supabaseUser();
  const [rooms, grants] = await Promise.all([
    // 조원 수는 active 조원만 센다 (RLS로 내 방만 보인다)
    sb.from('rooms').select('id, full_name, created_by, project_owner, room_members(count)').eq('room_members.active', true).order('full_name').then(must),
    // 내가 허용한 MCP 클라이언트 (Claude Code·수집기). 조회에 실패해도 첫 화면은 보여준다
    sb.auth.oauth.listGrants().then((r) => r.data ?? []),
  ]);

  return (
    <main className="page">
      <div className="container" style={{ maxWidth: 1180 }}>
        <header className="row" style={{ justifyContent: 'space-between', gap: 12 }}>
          <div className="row" style={{ gap: 10 }}>
            <span className="logo"><Cube /></span>
            <span style={{ fontSize: 17, fontWeight: 800 }}>팀 작업 현황 3D 오피스</span>
          </div>
          <div className="row" style={{ gap: 10 }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- GitHub 아바타 (외부 URL) */}
            <span className="avatar" aria-hidden>{me.avatar_url ? <img src={me.avatar_url} alt="" width={40} height={40} /> : (me.name ?? me.github_login)[0]}</span>
            <span className="stack" style={{ gap: 0, lineHeight: 1.3 }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>{me.name ?? me.github_login}</span>
              <span className="t-cap">@{me.github_login}</span>
            </span>
            <form action={signOut}><button type="submit" className="btn btn-secondary btn-sm">로그아웃</button></form>
          </div>
        </header>

        <Notice error={error} />

        <div className="two-col">
          <section className="card" aria-labelledby="rooms-h" style={{ flex: '3 1 420px', minWidth: 0 }}>
            <div className="card-head"><h2 id="rooms-h" className="t-h2">내 방</h2><span className="t-cap">저장소 협업자가 조원이 돼요</span></div>
            <div className="list">
              {rooms.map((r, i) => {
                const linked = r.project_owner !== null;
                return (
                  <Link key={r.id} className="list-row" href={`/rooms/${r.id}`}>
                    <span style={{ width: 44, height: 44, flex: 'none', borderRadius: 12, background: TINTS[i % TINTS.length], display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Cube size={22} white /></span>
                    <span className="stack" style={{ flex: 1, minWidth: 0, gap: 4 }}>
                      <span className="ellipsis" style={{ fontSize: 15, fontWeight: 800 }}>{r.full_name}</span>
                      <span className="row" style={{ gap: 6 }}>
                        <span className="chip">조원 {r.room_members[0]?.count ?? 0}명</span>
                        <span className="chip" style={{ color: linked ? 'var(--st-break-ink)' : 'var(--st-offline-ink)' }}>
                          <span className="dot" style={{ width: 6, height: 6, background: linked ? 'var(--st-break)' : 'var(--st-offline)' }} />칸반 {linked ? '연결됨' : '연결 안 됨'}
                        </span>
                        {r.created_by === me.id && <span className="chip">방장</span>}
                      </span>
                    </span>
                    <I24 name="next" size={18} style={{ color: 'var(--ink-3)' }} />
                  </Link>
                );
              })}
              {rooms.length === 0 && (
                <div className="card-tint empty"><span className="t-h3">아직 방이 없어요</span><span className="t-cap">GitHub 저장소를 고르면 협업자가 모인 방이 만들어져요.</span></div>
              )}
              <Link className="list-row" href="/rooms/new" style={{ borderStyle: 'dashed', borderColor: 'var(--line-3)', justifyContent: 'center', color: 'var(--ink-2)', fontSize: 14, fontWeight: 700 }}>
                <I24 name="plus" size={18} stroke={2.6} />저장소로 방 만들기
              </Link>
            </div>
          </section>
          <McpPanel grants={grants} mcpServerUrl={env.mcpServerUrl} />
        </div>
      </div>
    </main>
  );
}

function Landing({ error }: { error: unknown }) {
  return (
    <main className="page" style={{ display: 'flex', alignItems: 'center' }}>
      <div className="container" style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 40, width: '100%' }}>
        <section className="stack" style={{ flex: '1 1 380px', minWidth: 0, gap: 20 }}>
          <span className="pill" style={{ alignSelf: 'flex-start' }}><span className="dot" style={{ background: 'var(--st-coding)' }} />MCP · GitHub 칸반 연동</span>
          <h1 className="t-display">팀 작업 현황<br />3D 오피스</h1>
          <p className="t-body" style={{ fontSize: 16 }}>GitHub 계정으로 로그인하고 저장소를 고르면, 저장소 협업자가 모인 방이 만들어집니다. Claude와 대화하거나 칸반 카드를 옮기면 캐릭터가 알맞은 자리로 이동해요.</p>
          <Notice error={error} />
          <form action={signIn} className="row" style={{ gap: 12 }}>
            <button type="submit" className="btn btn-github btn-lg"><GitHubMark />GitHub로 로그인</button>
          </form>
          <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
            <li className="card-tint"><span className="t-h3">대화로 상태 변경</span><span className="t-cap">“회의 들어가”라고 말하면 MCP가 상태를 저장해요</span></li>
            <li className="card-tint"><span className="t-h3">한눈에 보는 3D 방</span><span className="t-cap">작업·회의·휴식·완료·대기 구역으로 이동해요</span></li>
            <li className="card-tint"><span className="t-h3">칸반 자동 반영</span><span className="t-cap">GitHub 칸반 열에 맞춰 자리가 바뀌어요</span></li>
          </ul>
        </section>
        <figure style={{ flex: '1 1 520px', minWidth: 0, margin: 0, borderRadius: 'var(--r-3xl)', background: 'radial-gradient(ellipse at 50% 45%, #FFFFFF 0%, #F7E4DF 72%)', border: '1px solid var(--line)', overflow: 'hidden' }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- 정적 렌더 이미지 (public/v2) */}
          <img src="/v2/room.png" alt="파스텔 톤 아이소메트릭 사무실: 작업 책상, 원형 회의 테이블, 소파, 책장, 출입문 옆 벤치" style={{ display: 'block', width: '100%', height: 'auto' }} />
        </figure>
      </div>
    </main>
  );
}
