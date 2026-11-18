'use client';

// 방 설정 카드 1(칸반 소유·PAT)·2(프로젝트 URL) (시안 v3 KanbanSettings.dc.html). 한 폼으로 linkProject에 보낸다.
// PAT 원문은 다시 보여주지 않는다 (등록됨 · 끝자리 · @id · 만료만). 삭제는 같은 폼 안 버튼의 formAction으로 보낸다.
import { useState } from 'react';
import { linkProject, removeProjectPat } from '@/app/actions';
import { I24 } from './ui';

export function KanbanLinkForm({ roomId, ownerType, pat, url, linked, recognized, installUrl }: {
  roomId: string; ownerType: 'org' | 'user'; url: string; linked: boolean; installUrl: string;
  pat: { summary: string; expired: boolean } | null;
  recognized: string | null; // "열 n/5 인식" (연결된 경우)
}) {
  const [owner, setOwner] = useState(ownerType);
  const [editing, setEditing] = useState(!pat);
  return (
    <form action={linkProject.bind(null, roomId)} className="stack" style={{ gap: 16 }}>
      <input type="hidden" name="owner_type" value={owner} />
      <section className="card" aria-labelledby="own-h">
        <h2 id="own-h" className="t-h2">1. 칸반 소유</h2>
        <div role="group" aria-label="칸반 소유" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
          {([['org', '조직', '조직(Organization) 소유 GitHub 칸반'], ['user', '개인 계정', '내 계정 소유 칸반 · 개인 토큰 필요']] as const).map(([v, t, d]) => (
            <button key={v} type="button" className="choice" aria-pressed={owner === v} onClick={() => setOwner(v)}>
              <span className="radio-dot" />
              <span className="stack" style={{ gap: 2 }}><span className="t-h3" style={{ fontSize: 15 }}>{t}</span><span className="t-cap">{d}</span></span>
            </button>
          ))}
        </div>

        {owner === 'org' ? (
          <div className="card-tint" style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
            <span className="t-body" style={{ flex: '1 1 260px', fontSize: 13 }}>조직 칸반을 읽으려면 GitHub App 권한(Projects 읽기)을 다시 승인해야 해요. 승인 후 이 화면으로 돌아오면 프로젝트를 연결할 수 있어요.</span>
            <a className="btn btn-github" href={installUrl} target="_blank" rel="noopener noreferrer">GitHub에서 권한 승인 ↗</a>
          </div>
        ) : (
          <div className="card-tint" style={{ gap: 10 }}>
            <span className="t-overline">개인 접근 토큰 (PAT)</span>
            {pat && !editing && (
              <div className="row" style={{ gap: 10 }}>
                <span className="pill" style={{ height: 44, fontSize: 13, flex: '1 1 320px', borderColor: pat.expired ? 'var(--danger-line)' : 'var(--ok-line)' }}>
                  <I24 name="lock" stroke={2.6} style={{ color: pat.expired ? 'var(--danger-ink)' : 'var(--ok-ink)' }} />
                  <strong style={{ color: pat.expired ? 'var(--danger-ink)' : 'var(--ok-ink)' }}>{pat.expired ? '만료됨' : '등록됨'}</strong>
                  <span className="ellipsis">{pat.summary}</span>
                </span>
                <button type="button" className="btn btn-secondary" onClick={() => setEditing(true)}>교체</button>
                <button type="submit" className="btn btn-danger" formAction={removeProjectPat.bind(null, roomId)} formNoValidate>삭제</button>
              </div>
            )}
            {editing && (
              <label className="field">{pat ? '새 토큰' : '개인 토큰 (classic)'}
                <span className="row" style={{ gap: 8 }}>
                  <input className="input" name="pat" type="password" autoComplete="off" spellCheck={false} placeholder="ghp_…" style={{ flex: '1 1 260px', width: 'auto', fontFamily: 'var(--mono)' }} />
                  <button type="submit" className="btn btn-primary">저장</button>
                  {pat && <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>취소</button>}
                </span>
              </label>
            )}
            <p className="hint" style={{ margin: 0 }}>
              <a href="https://github.com/settings/tokens/new?scopes=read:project&description=team-office" target="_blank" rel="noopener noreferrer">GitHub 토큰 만들기 ↗</a>{' '}
              classic 토큰을 만들고 <span className="kbd">read:project</span> 권한만 체크한 뒤 만료일을 정해 주세요. 토큰은 암호화해 서버에만 저장하고 다시 보여주지 않아요.
              {editing && ' 저장하면 아래 프로젝트 URL로 연결 테스트도 함께 해요.'}
            </p>
          </div>
        )}
      </section>

      <section className="card" aria-labelledby="proj-h">
        <h2 id="proj-h" className="t-h2">2. 프로젝트</h2>
        <label className="field">프로젝트 URL
          <input className="input" name="url" type="url" required defaultValue={url} placeholder="https://github.com/users/[id]/projects/[번호]" />
        </label>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          {linked && recognized
            ? <span role="status" className="res-ok row" style={{ gap: 6 }}><I24 name="check" stroke={3} />연결됨 · {recognized}</span>
            : <span className="t-cap">URL을 넣고 연결 테스트를 눌러 주세요.</span>}
          <button type="submit" className="btn btn-primary">{linked ? '다시 연결 · 연결 테스트' : '연결 테스트'}</button>
        </div>
      </section>
    </form>
  );
}
