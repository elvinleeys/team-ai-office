'use client';

// F8 이력 패널 (시안 v3 Main.dc.html): 방 옆에 두고 방 높이까지만 늘어나며 안에서 스크롤한다. 본인이면 상태 선택 영역(F18)이 함께 나온다.
// 쓰기는 서버 액션(서버에서 secret 키)으로만 한다. 브라우저는 DB에 쓰지 않는다.
import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { releaseMyStatus, setMyStatus, setStatusSource } from '@/app/actions';
import { CHARACTERS, KANBAN_COLUMN, type KanbanColumn, MANUAL_STATUSES, PARTS, STATUS_COLOR, STATUS_LABEL, type Presence, ZONE_INFO } from '@/constants/office';
import { characterOf } from './Avatar';
import { PanelGauges } from './GaugeBar';
import { Icon } from './Icons';
import type { IssueRow, Seat } from './Room';
import { supabaseBrowser } from './supabaseBrowser';
import { I24 } from './ui';

type LogRow = { id: number; status: string; task: string; created_at: string; source: string };
type CardRow = { item_id: string; column_name: string; title: string; url: string | null; number: number | null; is_draft: boolean; state: string };

/** 기록 목록 시각: MM. DD. 오전 hh:mm (design-guide 6장) */
export const time = (iso: string) => new Date(iso).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
const clock = (iso: string) => new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
function elapsed(ms: number) {
  const m = Math.max(0, Math.floor(ms / 60000));
  return m < 60 ? `${m}분` : `${Math.floor(m / 60)}시간 ${m % 60}분`;
}
const label = (status: string) => STATUS_LABEL[status as Presence] ?? status;
const ink = (status: string) => STATUS_COLOR[status as Presence]?.text ?? 'var(--ink-2)';
/** GitHub 열 이름 → 한국어 (모르는 열은 그대로) */
function columnKo(c: string) {
  const key = (Object.keys(KANBAN_COLUMN) as KanbanColumn[]).find((k) => k.toLowerCase() === c.trim().toLowerCase());
  return key ? KANBAN_COLUMN[key].label : c;
}
const cardLabel = (number: number | null, draft: boolean | null) => (draft ? '초안' : number ? `#${number}` : '카드 없음');

export function HistoryPanel({ roomId, seat, issues, now, onClose, isMe, projectLinked, onChanged, syncedAt, maxHeight }: {
  roomId: string; seat: Seat; issues: IssueRow[];
  now: number; // 조회 시각. 바뀔 때마다 이력도 다시 읽는다
  onClose: () => void; isMe: boolean; projectLinked: boolean; onChanged: () => void;
  syncedAt: string | null; maxHeight?: number;
}) {
  const { member, presence, row, startedAt, long, part, usage, mpOut } = seat;
  const [logs, setLogs] = useState<LogRow[] | null>(null);
  const [cards, setCards] = useState<CardRow[]>([]);
  useEffect(() => {
    let alive = true;
    const sb = supabaseBrowser();
    Promise.all([
      sb.from('logs').select('id, status, task, created_at, source').eq('room_id', roomId).eq('member_id', member.id).order('created_at', { ascending: false }).limit(20),
      sb.from('github_cards').select('item_id, column_name, title, url, number, is_draft, state, item_updated_at').eq('room_id', roomId).eq('member_id', member.id)
        .in('state', ['progress', 'review']).order('item_updated_at', { ascending: false }),
    ]).then(([l, c]) => {
      for (const e of [l.error, c.error]) if (e) console.error('이력 조회 실패', e.message);
      if (alive) { setLogs((prev) => l.data ?? prev ?? []); setCards((prev) => c.data ?? prev); }
    });
    return () => { alive = false; };
  }, [roomId, member.id, now]);

  const charId = characterOf(member.login, member.character);
  const manualActive = row?.source === 'manual_pinned' || (row?.source === 'manual_timed' && !!row.expires_at && Date.parse(row.expires_at) > now);
  const kanban = row?.source === 'github';
  const statusSource = row?.status_source ?? member.statusSource;
  // 지금 보여주는 카드(또는 가려진 칸반 카드)를 뺀 나머지 진행 중 카드
  const shown = kanban ? row.task : row?.shadow_task;
  const others = cards.slice(shown ? 1 : 0);
  const syncAgo = syncedAt ? elapsed(now - Date.parse(syncedAt)) : null;

  const srcLine = presence === 'offline' ? '미연결 · MCP 연결 전이거나 상태 없음'
    : kanban ? `칸반 연동${syncAgo ? ` · ${syncAgo} 전 동기화` : ''}`
      : row?.source === 'manual_pinned' ? '직접 선택 · 직접 해제할 때까지 유지'
        : manualActive ? `직접 선택 · ${elapsed(Date.parse(row!.expires_at!) - now)} 후 ${statusSource === 'github' ? '칸반 복귀' : '만료'}`
          : '직접 선택 (만료, 마지막 값 유지)';
  const colLabel = manualActive ? '직접 선택' : kanban ? (row.review ? '검토 중' : presence === 'done' ? '완료' : presence === 'idle' ? '없음' : '진행 중') : '—';

  return (
    <aside className="side-panel" aria-label={`${member.name} 작업 이력 패널`} style={{ maxHeight }}>
      <div className="panel-head">
        {/* eslint-disable-next-line @next/next/no-img-element -- 정적 스프라이트 (public/v2) */}
        <span className="panel-sprite"><img src={`/v2/characters/${charId}${member.part ? `-${member.part}` : ''}.png`} alt="" width={46} height={59} /></span>
        <div className="stack" style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <div className="row" style={{ gap: 6, fontSize: 17, fontWeight: 800 }}>{member.name}{isMe && <span className="me">나</span>}</div>
          <span className="t-cap">@{member.login} · {CHARACTERS[charId].name}</span>
          <div className="row" style={{ gap: 6, fontSize: 12 }}>
            {part && <span className={`pbadge pbadge-${part}`}><Icon name={PARTS[part].icon} />{PARTS[part].label}</span>}
            <span className="row" style={{ gap: 4, fontWeight: 700, color: STATUS_COLOR[presence].text }}>
              <span className="dot" style={{ width: 7, height: 7, background: STATUS_COLOR[presence].dot }} />
              {mpOut ? 'MP 회복 중' : label(presence)}{presence !== 'offline' && ` · ${ZONE_INFO[presence].place}`}
            </span>
          </div>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="패널 닫기" style={{ alignSelf: 'flex-start', margin: '-8px -8px 0 0' }}><I24 name="close" size={18} stroke={2} /></button>
      </div>

      <section aria-label="지금" className="stack" style={{ gap: 6 }}>
        <span className="t-overline">지금</span>
        <span style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.4 }}>
          {presence === 'offline' ? '연결 전' : row?.task || (presence === 'idle' ? '칸반에 진행 중 카드 없음' : '작업 내용 없음')}
        </span>
        {startedAt && presence !== 'offline' && (
          <span style={{ fontSize: 12, fontWeight: 700, color: long ? '#8A4B05' : 'var(--ink-3)' }}>
            {clock(startedAt)} 시작 · {elapsed(now - Date.parse(startedAt))} 경과{long && ' · 오래 지속 중'}
          </span>
        )}
        <span className="t-cap">{srcLine}</span>
        {presence !== 'offline' && (
          <div className="row" style={{ gap: 6, marginTop: 2 }}>
            <span className="chip">{kanban ? cardLabel(row.card_number, row.card_draft) : '카드 없음'}</span>
            <span className="chip">칸반 열 · {colLabel}</span>
            {kanban && row.card_url && <a href={row.card_url} target="_blank" rel="noopener noreferrer" className="chip" style={{ color: 'var(--link)', textDecoration: 'none' }}>GitHub에서 열기 ↗</a>}
          </div>
        )}
        {row?.shadow_status && (
          <span style={{ fontSize: 12, color: '#8E86A6' }}>
            칸반상 현재 카드: {row.shadow_task ? `${cardLabel(row.shadow_card_number, row.shadow_card_draft)} ${row.shadow_task}` : label(row.shadow_status)}{row.shadow_review && ' · 검토 중'}
          </span>
        )}
        {others.length > 0 && (
          <div className="card-tint" style={{ gap: 3 }}>
            <span className="t-overline">진행 중인 다른 카드</span>
            {others.map((c) => (
              <span key={c.item_id} style={{ fontSize: 12 }}>
                {cardLabel(c.number, c.is_draft)} · {columnKo(c.column_name)} · {c.url ? <a href={c.url} target="_blank" rel="noopener noreferrer">{c.title}</a> : c.title}
              </span>
            ))}
          </div>
        )}
      </section>

      {isMe && (
        <StatusChooser roomId={roomId} current={manualActive ? row?.status ?? null : null} statusSource={statusSource}
          manualActive={manualActive} projectLinked={projectLinked} onChanged={onChanged} />
      )}

      <PanelGauges usage={usage} now={now} />

      {issues.map((i) => (
        <div key={i.id} className="banner banner-warn" style={{ fontSize: 13, padding: '10px 12px' }}><span className="count">!</span>열린 이슈: #{i.id} {i.title}</div>
      ))}

      <section aria-label="최근 기록" className="stack" style={{ gap: 8 }}>
        <span className="t-overline">최근 기록</span>
        {logs === null ? <span className="t-cap">불러오는 중…</span> : logs.length === 0 ? <span className="t-cap">기록이 없어요</span> : (
          <ol className="log-list">
            {logs.map((l) => (
              <li key={l.id}>
                <span className="t-cap">{time(l.created_at)}</span>
                <span><span style={{ fontWeight: 700, color: ink(l.status) }}>{label(l.status)}</span>{l.source === 'github' && <span className="t-cap"> · 칸반</span>} · {l.task || '작업 내용 없음'}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </aside>
  );
}

/** 본인 상태 선택: 4개 상태(대기는 칸반 결과로만), 작업 내용, 해제 방식, 칸반으로 돌아가기, 기본 출처 */
function StatusChooser({ roomId, current, statusSource, manualActive, projectLinked, onChanged }: {
  roomId: string; current: string | null; statusSource: string; manualActive: boolean; projectLinked: boolean; onChanged: () => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'timed' | 'pinned'>('timed');
  const run = (fn: () => Promise<{ error?: string }>) => start(async () => {
    setError((await fn()).error ?? null);
    onChanged();
  });
  return (
    <section aria-label="내 상태 바꾸기" className="my-status">
      <span className="t-h3">내 상태 바꾸기</span>
      <form action={(fd) => run(() => setMyStatus(roomId, fd))} className="stack" style={{ gap: 12 }}>
        <input type="hidden" name="mode" value={mode} />
        <div className="status-grid" role="group" aria-label="상태">
          {MANUAL_STATUSES.map((s) => (
            <button key={s} type="submit" name="status" value={s} className="choice" aria-pressed={current === s} disabled={pending}>
              <span className="dot" style={{ background: STATUS_COLOR[s].dot }} />{STATUS_LABEL[s]}
              {current === s && <I24 name="check" size={14} stroke={3} style={{ marginLeft: 'auto' }} />}
            </button>
          ))}
        </div>
        <label className="field">
          <span>작업 내용 <span className="hint">(선택 · 상태 버튼을 누르면 함께 저장돼요)</span></span>
          <input className="input" name="task" maxLength={200} placeholder="예: 로그인 화면 시안" />
        </label>
        <div className="field">해제 방식
          <div className="seg seg-2" role="group" aria-label="해제 방식">
            <button type="button" className="seg-item" aria-pressed={mode === 'timed'} onClick={() => setMode('timed')}>2시간 후 자동 복귀</button>
            <button type="button" className="seg-item" aria-pressed={mode === 'pinned'} onClick={() => setMode('pinned')}>직접 해제할 때까지</button>
          </div>
        </div>
      </form>
      {manualActive && (
        <button type="button" className="btn btn-secondary btn-info" disabled={pending} onClick={() => run(() => releaseMyStatus(roomId))}>
          <I24 name="link" size={14} stroke={2.6} />{statusSource === 'github' ? '칸반으로 돌아가기' : '직접 선택 해제'}
        </button>
      )}
      <div className="field">기본 출처
        <div className="seg seg-2" role="group" aria-label="기본 출처">
          {(['github', 'manual'] as const).map((src) => (
            <button key={src} type="button" className="seg-item" aria-pressed={statusSource === src} disabled={pending}
              onClick={() => run(() => { const fd = new FormData(); fd.set('source', src); return setStatusSource(roomId, fd); })}>
              {src === 'github' ? '칸반 따르기' : '직접 선택만'}
            </button>
          ))}
        </div>
      </div>
      {statusSource === 'github' && !projectLinked && <p className="hint" style={{ margin: 0 }}>아직 연결된 칸반이 없어요. 방장이 방 설정에서 연결할 수 있어요.</p>}
      {error && <div className="banner banner-danger" role="alert" style={{ fontSize: 13 }}>{error}</div>}
      <p className="hint" style={{ margin: 0 }}>Claude에게 ‘회의 들어가’라고 말해도 바뀝니다</p>
      <Link className="btn btn-ghost btn-sm" href={`/rooms/${roomId}/character`} style={{ alignSelf: 'flex-start', color: 'var(--link)' }}>캐릭터·파트 변경 →</Link>
    </section>
  );
}
