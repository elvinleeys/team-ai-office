// 홈 'Claude 연결' 카드 (시안 v3 Home.dc.html). 토큰은 Supabase OAuth가 발급하므로 화면에 나오지 않는다.
// 연결된 앱 목록·해제는 시안에 없지만 PRD F4(연결 해제) 때문에 카드 맨 아래에 둔다 (2026-11-18 사용자 결정)
import { revokeMcp } from '@/app/actions';
import { CopyCode } from './CopyCode';
import { I24 } from './ui';

type Grant = { client: { id: string; name: string }; granted_at: string };

const when = (iso: string) => new Date(iso).toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

export function McpPanel({ grants, mcpServerUrl }: { grants: Grant[]; mcpServerUrl: string }) {
  return (
    <section className="card" aria-labelledby="claude-h" style={{ flex: '2 1 380px', minWidth: 0 }}>
      <div className="card-head"><h2 id="claude-h" className="t-h2">Claude 연결</h2><span className="chip">처음 한 번만</span></div>
      <ol className="steps">
        <li><div className="stack">
          <span className="t-h3">터미널(프로젝트 폴더)에서 등록합니다</span>
          <CopyCode text={`claude mcp add team-office --transport http ${mcpServerUrl}`} />
        </div></li>
        <li><div className="stack">
          <span className="t-h3">Claude Code에서 인증합니다</span>
          <span className="t-body"><span className="kbd">/mcp</span> → <span className="kbd">team-office</span> → <strong>Authenticate</strong>를 고르면 브라우저가 열려요. 허용하면 끝이에요.</span>
        </div></li>
        <li><div className="stack">
          <span className="t-h3">HP·MP 자동 수집기 로그인 <span className="chip" style={{ marginLeft: 4 }}>선택</span></span>
          <span className="t-body"><span className="kbd">collector</span> 폴더에서 한 번 실행하면 같은 방식으로 로그인돼요.</span>
          <CopyCode text="node --env-file=.env collector.ts --login" />
        </div></li>
      </ol>
      <div className="banner banner-info" style={{ fontSize: 13 }}><I24 name="info" /><span className="banner-text">연결 후에는 Claude에게 “회의 들어가”처럼 말하면 방의 내 캐릭터가 움직여요.</span></div>

      {grants.length > 0 && (
        <div className="card-tint" style={{ gap: 10 }}>
          <span className="t-overline">연결된 앱</span>
          {grants.map((g) => (
            <div key={g.client.id} className="row" style={{ justifyContent: 'space-between', gap: 10 }}>
              <span className="stack" style={{ gap: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{g.client.name || '이름 없는 앱'}</span>
                <span className="t-cap">{when(g.granted_at)} 허용</span>
              </span>
              <form action={revokeMcp.bind(null, g.client.id)}>
                <button type="submit" className="btn btn-danger btn-sm">연결 해제</button>
              </form>
            </div>
          ))}
          <span className="hint">해제하면 그 앱은 바로 팀 오피스를 쓸 수 없어요. 다시 쓰려면 Authenticate부터 다시 해요.</span>
        </div>
      )}
    </section>
  );
}
