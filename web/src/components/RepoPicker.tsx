'use client';

// 저장소로 방 만들기 (시안 v3 CreateRoom.dc.html). 이미 방이 있는 저장소는 비활성 대신 '방으로 들어가기'
// (협업자를 다시 동기화하고 입장 — 나중에 추가된 협업자가 들어오는 경로, 2026-11-18 사용자 결정)
import { useState, useTransition } from 'react';
import { createRoom, previewRepo } from '@/app/actions';

type Repo = { id: number; full_name: string; private: boolean; hasRoom: boolean };
type Preview = Awaited<ReturnType<typeof previewRepo>>;

export function RepoPicker({ repos, myLogin, installUrl }: { repos: Repo[]; myLogin: string; installUrl: string }) {
  const [owner, setOwner] = useState<'me' | 'org'>('me');
  const [query, setQuery] = useState('');
  const [selId, setSelId] = useState<number | null>(null);
  const [preview, setPreview] = useState<Record<number, Preview>>({});
  const [loading, start] = useTransition();
  const mine = (r: Repo) => r.full_name.split('/')[0].toLowerCase() === myLogin.toLowerCase();
  const list = repos.filter((r) => (owner === 'me') === mine(r) && r.full_name.toLowerCase().includes(query.trim().toLowerCase()));
  const sel = repos.find((r) => r.id === selId) ?? null;
  const p = sel ? preview[sel.id] : undefined;

  const pick = (r: Repo) => {
    setSelId(r.id);
    if (!preview[r.id]) start(async () => { const res = await previewRepo(r.id); setPreview((old) => ({ ...old, [r.id]: res })); });
  };

  return (
    <div className="two-col">
      <section className="card" aria-labelledby="repo-h" style={{ flex: '3 1 460px', minWidth: 0 }}>
        <h2 id="repo-h" className="t-h2">저장소</h2>
        <div className="row" style={{ gap: 10 }}>
          <label className="field" style={{ flex: '1 1 260px' }}>
            <span className="sr-only">저장소 검색</span>
            <input className="input" type="search" placeholder="저장소 이름으로 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <div className="seg" role="group" aria-label="소유자">
            {(['me', 'org'] as const).map((o) => (
              <button key={o} type="button" className="seg-item" aria-pressed={owner === o} onClick={() => setOwner(o)}>{o === 'me' ? '내 저장소' : '조직'}</button>
            ))}
          </div>
        </div>
        <div className="list" role="group" aria-label="저장소 목록">
          {list.map((r) => (
            <button key={r.id} type="button" className="choice" aria-pressed={selId === r.id} onClick={() => pick(r)}>
              <span className="radio-dot" />
              <span className="stack" style={{ flex: 1, minWidth: 0, gap: 4 }}>
                <span className="ellipsis" style={{ fontSize: 15, fontWeight: 800 }}>{r.full_name}</span>
                <span className="row" style={{ gap: 6 }}>
                  <span className="chip">{r.private ? 'Private' : 'Public'}</span>
                  {selId === r.id && p?.count !== undefined && <span className="chip">협업자 {p.count}명</span>}
                  {r.hasRoom && <span className="chip" style={{ color: 'var(--ink-3)' }}>이미 방이 있어요</span>}
                </span>
              </span>
            </button>
          ))}
          {list.length === 0 && (
            <div className="card-tint empty">
              <span className="t-h3">{query ? '검색 결과가 없어요' : owner === 'me' ? '내 저장소가 없어요' : '조직 저장소가 없어요'}</span>
              <span className="t-cap">GitHub App이 설치된 저장소만 보여요.</span>
            </div>
          )}
        </div>
        <p className="hint" style={{ margin: 0 }}>
          목록에 없는 저장소는 먼저 <a href={installUrl} target="_blank" rel="noopener noreferrer">GitHub App을 설치 ↗</a>하세요. 조직 저장소는 관리자 승인이 필요해요.
        </p>
      </section>

      <aside className="card" aria-labelledby="sum-h" style={{ flex: '2 1 300px', minWidth: 0, position: 'sticky', top: 24 }}>
        <h2 id="sum-h" className="t-h2">만들 방</h2>
        {sel ? (
          <form action={createRoom} className="stack" style={{ gap: 14 }}>
            <input type="hidden" name="repo_id" value={sel.id} />
            <div className="card-tint">
              <span className="t-overline">저장소</span>
              <span style={{ fontSize: 15, fontWeight: 800 }}>{sel.full_name}</span>
              <span className="t-cap" role="status">
                {p?.error ?? (p?.count !== undefined
                  ? `협업자 ${p.count}명이 조원으로 들어와요. 각자 처음 들어올 때 캐릭터와 파트를 고릅니다.`
                  : loading ? '협업자를 불러오는 중…' : '')}
              </span>
            </div>
            {p?.people && p.people.length > 0 && (
              <div className="row" style={{ gap: 6 }} aria-label="조원 미리보기">
                {p.people.map((u) => (
                  // eslint-disable-next-line @next/next/no-img-element -- GitHub 아바타 (외부 URL)
                  <span key={u.login} className="avatar" style={{ width: 32, height: 32 }} title={`@${u.login}`}><img src={u.avatar_url} alt={`@${u.login}`} width={32} height={32} /></span>
                ))}
                {p.count! > p.people.length && <span className="chip">+ {p.count! - p.people.length}명</span>}
              </div>
            )}
            <p className="hint" style={{ margin: 0 }}>{sel.hasRoom ? '이미 있는 방이에요. 협업자 목록을 다시 맞춘 뒤 들어가요.' : '칸반 연결은 방을 만든 뒤 방 설정에서 할 수 있어요.'}</p>
            <button type="submit" className="btn btn-primary btn-lg btn-block">{sel.hasRoom ? '방으로 들어가기' : '방 만들기'}</button>
          </form>
        ) : (
          <>
            <div className="card-tint empty"><span className="t-h3">저장소를 골라주세요</span><span className="t-cap">왼쪽 목록에서 하나를 선택하면 여기에 요약이 보여요.</span></div>
            <button type="button" className="btn btn-lg btn-block" disabled>저장소를 골라주세요</button>
          </>
        )}
      </aside>
    </div>
  );
}
