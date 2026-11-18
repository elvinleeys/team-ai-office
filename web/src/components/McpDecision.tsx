'use client';

// MCP 연결 허용 화면의 버튼과 결과 (시안 v3 McpAuthorize.dc.html). 승인·거부 결과는 요청한 클라이언트의 로컬 콜백
// (http://127.0.0.1:포트/...)으로 전달해야 한다. 페이지를 그쪽으로 넘기지 않고 숨은 프레임으로 보내 시안의 결과 화면을 유지한다.
// 브라우저가 프레임을 막으면 아래 링크로 직접 열 수 있다.
import { type ReactNode, useState, useTransition } from 'react';
import { approveMcp, denyMcp } from '@/app/actions';
import { I24 } from './ui';

type Step = { kind: 'pending' } | { kind: 'allowed' | 'denied'; url: string };

/** children: 허용 전에만 보이는 안내(제목·계정·할 수 있는 일) */
export function McpDecision({ authorizationId, clientName, initialUrl, children }: { authorizationId: string; clientName: string; initialUrl?: string; children?: ReactNode }) {
  const [step, setStep] = useState<Step>(initialUrl ? { kind: 'allowed', url: initialUrl } : { kind: 'pending' });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const decide = (allow: boolean) => start(async () => {
    const r = await (allow ? approveMcp : denyMcp)(authorizationId);
    if (r.url) setStep({ kind: allow ? 'allowed' : 'denied', url: r.url });
    else setError(r.error ?? '연결 요청을 처리하지 못했어요.');
  });

  if (step.kind === 'pending') {
    return (
      <>
        {children}
        {error && <div className="banner banner-danger" role="alert"><I24 name="alert" stroke={2} /><span className="banner-text">{error}</span></div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
          <button type="button" className="btn btn-secondary btn-lg" disabled={pending} onClick={() => decide(false)}>취소</button>
          <button type="button" className="btn btn-primary btn-lg" disabled={pending} onClick={() => decide(true)}>허용</button>
        </div>
      </>
    );
  }

  const allowed = step.kind === 'allowed';
  return (
    <div className="stack" role="status" style={{ textAlign: 'center', gap: 8, alignItems: 'center' }}>
      <iframe src={step.url} title={`${clientName}에 결과 전달`} hidden />
      {allowed && <span className="result-icon" style={{ background: 'var(--ok-bg)', color: 'var(--ok-ink)' }}><I24 name="check" size={24} stroke={3} /></span>}
      <h1 className="t-h1" style={{ fontSize: 22 }}>{allowed ? '연결됐어요' : '연결을 취소했어요'}</h1>
      <p className="t-sub">
        {allowed
          ? <>이 창을 닫고 {clientName}(으)로 돌아가세요. “회의 들어가”라고 말해 보세요.</>
          : <>Claude Code에서 <span className="kbd">/mcp</span> → <span className="kbd">team-office</span> → Authenticate를 다시 고르면 이 화면이 열려요.</>}
      </p>
      <a className="btn btn-ghost btn-sm" href={step.url}>{clientName}에 반영되지 않았다면 여기를 누르세요</a>
    </div>
  );
}
