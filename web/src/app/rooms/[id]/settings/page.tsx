// 방 설정 · 칸반 연결 (시안 v3 KanbanSettings.dc.html, docs/screens.md 4장). 방장 전용.
// PAT 원문은 어디에도 다시 보여주지 않는다 (끝 4자리·주인·만료일만). 저장은 서버 액션이 암호화해서 한다.
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { saveColumnMap, unlinkProject } from '@/app/actions';
import { KanbanLinkForm } from '@/components/KanbanLinkForm';
import { Back, I24, Notice } from '@/components/ui';
import { KANBAN_COLUMN, type KanbanColumn, PARTS, STATUS_LABEL } from '@/constants/office';
import { getMe, requestNow } from '@/lib/auth';
import { installUrl } from '@/lib/github';
import { maybe, supabaseAdmin, supabaseUser } from '@/lib/supabase/server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// 3D 방 위치 문구 (design-guide 6장)
const ROOM_PLACE: Record<string, string> = {
  idle: '대기석',
  progress: `${STATUS_LABEL.coding} 구역`,
  review: `${STATUS_LABEL.coding} 구역 + “검토 중” 태그`,
  done: `${STATUS_LABEL.done} 구역 30분 → 대기석`,
};
const when = (iso: string) => new Date(iso).toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
const day = (iso: string) => new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });

export default function SettingsPage({ params, searchParams }: PageProps<'/rooms/[id]/settings'>) {
  return (
    <main className="page">
      <div className="container-md">
        <Suspense fallback={<p className="t-sub">불러오는 중…</p>}>
          <Settings params={params} searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function Settings({ params, searchParams }: Pick<PageProps<'/rooms/[id]/settings'>, 'params' | 'searchParams'>) {
  const { id } = await params;
  const { error, notice } = await searchParams;
  if (!UUID.test(id)) notFound();
  const me = await getMe();
  if (!me) redirect('/');
  const room = maybe(await (await supabaseUser()).from('rooms')
    .select('id, full_name, created_by, project_owner_type, project_owner, project_number, github_config, github_synced_at, github_sync_error, github_sync_failed_at')
    .eq('id', id).maybeSingle());
  if (!room) notFound();
  const linked = room.project_owner !== null;
  const isHost = room.created_by === me.id;

  const head = (
    <>
      <Back href={`/rooms/${id}`}>방으로</Back>
      <header className="stack" style={{ gap: 6 }}>
        <div className="row" style={{ gap: 10 }}><h1 className="t-h1">방 설정</h1>{isHost && <span className="me" style={{ height: 22, padding: '0 8px', fontSize: 11 }}>방장 전용</span>}</div>
        <p className="t-sub">{room.full_name} · 칸반 연결</p>
      </header>
      <Notice error={error} notice={notice} />
    </>
  );

  if (!isHost) {
    return (
      <>
        {head}
        <section className="card" style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <span className="part-icon" style={{ background: linked ? 'var(--ok-bg)' : 'var(--surface-2)', color: linked ? 'var(--ok-ink)' : 'var(--ink-3)' }}><I24 name="link" size={22} /></span>
          <div className="stack" style={{ gap: 2 }}><span className="t-h2">칸반: {linked ? '연결됨' : '연결 안 됨'}</span><span className="t-sub">칸반 연결은 방장만 바꿀 수 있어요.</span></div>
        </section>
      </>
    );
  }

  const now = await requestNow();
  // PAT 메타만 읽는다 (암호문은 화면으로 보내지 않는다)
  const pat = maybe(await supabaseAdmin().from('room_secrets').select('pat_login, pat_last4, pat_expires_at').eq('room_id', id).maybeSingle());
  const config = room.github_config as { columns: Record<string, string>; partField: string; partOptions?: string[] | null; projectTitle?: string; parts: Record<string, string> };
  const url = linked ? `https://github.com/${room.project_owner_type === 'org' ? 'orgs' : 'users'}/${room.project_owner}/projects/${room.project_number}` : '';
  const known = (c: string) => (Object.keys(KANBAN_COLUMN) as KanbanColumn[]).find((k) => k.toLowerCase() === c.trim().toLowerCase()) ?? null;
  const cols = Object.entries(config.columns);
  const recognized = cols.filter(([c]) => known(c)).length;

  return (
    <>
      {head}
      <KanbanLinkForm
        roomId={id} ownerType={room.project_owner_type === 'org' ? 'org' : 'user'} url={url} linked={linked} installUrl={installUrl()}
        recognized={linked ? `열 ${recognized}/${Object.keys(KANBAN_COLUMN).length} 인식` : null}
        pat={pat ? {
          summary: `끝자리 ${pat.pat_last4 ?? '????'} · @${pat.pat_login} · ${pat.pat_expires_at ? `만료 ${day(pat.pat_expires_at)}` : '만료일 없음'}`,
          expired: !!pat.pat_expires_at && Date.parse(pat.pat_expires_at) < now,
        } : null}
      />

      {linked && (
        <form action={saveColumnMap.bind(null, id)} className="card" aria-labelledby="map-h">
          <div className="card-head"><h2 id="map-h" className="t-h2">3. 열 매핑 {config.projectTitle && <span className="t-sub" style={{ fontWeight: 500 }}>· {config.projectTitle}</span>}</h2></div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th scope="col">GitHub 열</th><th scope="col">찾은 열</th><th scope="col">화면 표시</th><th scope="col">3D 방</th><th scope="col">결과</th></tr></thead>
              <tbody>
                {cols.map(([c, st]) => {
                  const k = known(c);
                  return (
                    <tr key={c} data-warn={!k}>
                      <td style={{ fontWeight: 700 }}>{c}</td>
                      <td>{k ?? '—'}</td>
                      <td>{k ? KANBAN_COLUMN[k].label : c}</td>
                      <td>
                        <select className="select select-sm" name={`col:${c}`} defaultValue={st} aria-label={`${c} 3D 방 위치`} style={{ minWidth: 220 }}>
                          {Object.entries(ROOM_PLACE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                      </td>
                      <td>{k ? <span className="res-ok">✓ 자동 인식</span> : <span className="res-warn">⚠ 같은 이름 없음 · 위치를 직접 고르세요</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!Object.values(config.columns).includes('done') && (
            <div className="banner banner-warn" style={{ fontSize: 13, padding: '10px 12px' }}><strong>완료 열 없음</strong> · ‘완료 정리 구역’으로 연결된 열이 없어요</div>
          )}
          {config.partOptions?.length ? (
            <div className="banner banner-ok" style={{ fontSize: 13, padding: '10px 12px' }}>
              <strong>‘{config.partField}’ 필드 인식됨</strong> · 값: {config.partOptions.map((o) => `${o}${config.parts[o] ? '' : '(인식 못 함)'}`).join(' / ')}
              {config.partOptions.some((o) => !config.parts[o]) && ` · 인식하는 값: ${Object.values(PARTS).map((p) => p.label).join(' / ')}`}
            </div>
          ) : (
            <div className="banner banner-info" style={{ fontSize: 13, padding: '10px 12px' }}><strong>‘{config.partField}’ 필드 없음</strong> · 카드 파트 대신 조원 기본 파트를 써요</div>
          )}
          <div className="row" style={{ justifyContent: 'flex-end' }}><button type="submit" className="btn btn-primary">열 매핑 저장</button></div>
        </form>
      )}

      <section className="card" aria-labelledby="sync-h">
        <h2 id="sync-h" className="t-h2">{linked ? 4 : 3}. 동기화 상태</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          <div className="card-tint" style={{ gap: 2 }}><span className="t-overline">마지막 동기화</span><span style={{ fontSize: 14, fontWeight: 700 }}>{room.github_synced_at ? when(room.github_synced_at) : '없음'}</span></div>
          <div className="card-tint" style={{ gap: 2 }}>
            <span className="t-overline">최근 실패 사유{room.github_sync_failed_at && ` · ${when(room.github_sync_failed_at)}`}</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: room.github_sync_error ? 'var(--danger-ink)' : undefined }}>{room.github_sync_error ?? '없음'}</span>
          </div>
        </div>
      </section>

      {linked && (
        <section className="card card-danger" aria-labelledby="danger-h">
          <div className="card-head" style={{ flexWrap: 'wrap' }}>
            <div className="stack" style={{ gap: 2 }}><h2 id="danger-h" className="t-h2" style={{ color: 'var(--danger-ink)' }}>칸반 연결 해제</h2><span className="t-sub">조원 상태는 직접 선택 값만 남고, 칸반 자동 반영이 멈춰요.</span></div>
            <form action={unlinkProject.bind(null, id)}><button type="submit" className="btn btn-danger">연결 해제</button></form>
          </div>
        </section>
      )}
    </>
  );
}
