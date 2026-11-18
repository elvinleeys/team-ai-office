// MCP 연결 허용 화면 (시안 v3 McpAuthorize.dc.html). Supabase OAuth 서버(supabase/config.toml [auth.oauth_server])가
// Claude Code·로컬 수집기를 여기로 보낸다. 승인하면 Supabase가 그 클라이언트에 토큰을 발급한다. 이 앱은 토큰을 만들거나 보지 않는다.
import { Suspense, type ReactNode } from 'react';
import { signIn, signOut } from '@/app/actions';
import { McpDecision } from '@/components/McpDecision';
import { Cube, GitHubMark, I24 } from '@/components/ui';
import { getMe } from '@/lib/auth';
import { supabaseUser } from '@/lib/supabase/server';

const PERMS = [
  { title: '내 상태 바꾸기', desc: '작업 중·회의 중·휴식 중·완료 정리와 작업 내용' },
  { title: '완료한 작업 기록', desc: '완료 처리와 작업 이력 남기기' },
  { title: '팀 현황 보기', desc: '내가 속한 방의 조원 상태와 이력' },
  { title: 'HP·MP 보고', desc: 'Claude 사용률(%)만 전송' },
  { title: '이슈 등록·해결', desc: '막힌 일을 이슈 보드에 올리고 닫기' },
];

/** 받침 있으면 a, 없으면 b (한글 끝 글자 기준, 영문 등은 받침 없음으로 본다) */
const josa = (word: string, a: string, b: string) => {
  const c = word.charCodeAt(word.length - 1) - 0xac00;
  return c >= 0 && c <= 11171 && c % 28 !== 0 ? a : b;
};

export default function ConsentPage({ searchParams }: PageProps<'/oauth/consent'>) {
  return (
    <main className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="container-sm" style={{ width: '100%' }}>
        <section className="card" aria-labelledby="auth-h" style={{ padding: 28, gap: 18, boxShadow: 'var(--sh-md)' }}>
          <div className="row" style={{ justifyContent: 'center', gap: 14 }} aria-hidden>
            <span className="mcp-icon" style={{ background: 'var(--ink)', color: '#fff' }}><I24 name="terminal" size={28} stroke={2} /></span>
            <span style={{ display: 'flex', gap: 4 }}>{[0, 1, 2].map((i) => <span key={i} className="dot" style={{ background: 'var(--line-3)' }} />)}</span>
            <span className="mcp-icon" style={{ background: 'var(--surface-warm)', border: '1px solid var(--line)' }}><Cube size={32} /></span>
          </div>
          <Suspense fallback={<p className="t-sub" style={{ textAlign: 'center' }}>불러오는 중…</p>}>
            <Consent searchParams={searchParams} />
          </Suspense>
        </section>
      </div>
    </main>
  );
}

function Title({ children, sub }: { children: ReactNode; sub: ReactNode }) {
  return (
    <div className="stack" style={{ textAlign: 'center', gap: 6 }}>
      <h1 id="auth-h" className="t-h1" style={{ fontSize: 22 }}>{children}</h1>
      <p className="t-sub">{sub}</p>
    </div>
  );
}

async function Consent({ searchParams }: Pick<PageProps<'/oauth/consent'>, 'searchParams'>) {
  const { authorization_id: id } = await searchParams;
  if (typeof id !== 'string' || !id) {
    return <Title sub="Claude Code(또는 수집기)에서 다시 로그인하세요.">잘못된 연결 요청이에요</Title>;
  }
  const here = `/oauth/consent?authorization_id=${encodeURIComponent(id)}`;

  const me = await getMe();
  if (!me) {
    return (
      <>
        <Title sub="연결을 허용하려면 먼저 로그인하세요. 로그인 후 이 화면으로 돌아와요.">팀 오피스에 로그인</Title>
        <form action={signIn}>
          <input type="hidden" name="next" value={here} />
          <button type="submit" className="btn btn-github btn-lg btn-block"><GitHubMark />GitHub로 로그인</button>
        </form>
      </>
    );
  }

  const { data, error } = await (await supabaseUser()).auth.oauth.getAuthorizationDetails(id);
  if (error || !data) {
    return <Title sub="만료되었을 수 있어요. Claude Code에서 처음부터 다시 로그인하세요.">연결 요청을 찾을 수 없어요</Title>;
  }
  // 이미 허용한 클라이언트: 결과만 전달하고 완료 화면을 보여준다
  if (!('authorization_id' in data)) return <McpDecision authorizationId={id} clientName="Claude Code" initialUrl={data.redirect_url} />;

  const name = data.client.name || '이름 없는 앱';
  return (
    <McpDecision authorizationId={id} clientName={name}>
      <Title sub="허용하면 Claude와의 대화로 내 상태를 바꾸고 팀 현황을 볼 수 있어요.">{name}{josa(name, '을', '를')} 팀 오피스에 연결할까요?</Title>
      <div className="list-row" style={{ minHeight: 56 }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- GitHub 아바타 (외부 URL) */}
        <span className="avatar" aria-hidden>{me.avatar_url ? <img src={me.avatar_url} alt="" width={40} height={40} /> : (me.name ?? me.github_login)[0]}</span>
        <span className="stack" style={{ flex: 1, gap: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>{me.name ?? me.github_login}</span>
          <span className="t-cap">@{me.github_login} 계정으로 연결</span>
        </span>
        <form action={signOut}>
          <input type="hidden" name="next" value={here} />
          <button type="submit" className="btn btn-ghost btn-sm">다른 계정</button>
        </form>
      </div>
      <div className="card-tint" style={{ gap: 10 }}>
        <span className="t-overline">{name}{josa(name, '이', '가')} 할 수 있는 일</span>
        {PERMS.map((p) => (
          <div key={p.title} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span className="perm-check"><I24 name="check" size={12} stroke={3} /></span>
            <span className="stack" style={{ gap: 0 }}><span style={{ fontSize: 13, fontWeight: 700 }}>{p.title}</span><span className="t-cap">{p.desc}</span></span>
          </div>
        ))}
      </div>
      <p className="t-cap" style={{ textAlign: 'center', margin: 0 }}>돌아갈 주소: {data.redirect_uri} · 연결은 첫 화면의 ‘Claude 연결’에서 언제든 해제할 수 있어요.</p>
    </McpDecision>
  );
}
