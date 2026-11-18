'use client';

// 메인 3D 방 (시안 v2 docs/screens.md 1장). 데이터는 브라우저에서 로그인 사용자 권한으로 읽기만 한다 (RLS).
// 최종 상태(직접 선택·칸반 우선순위)는 DB 뷰 effective_statuses 한 곳에서 계산된 값을 그대로 쓴다.
import { Html, OrthographicCamera } from '@react-three/drei';
import { Canvas, type RootState, useThree } from '@react-three/fiber';
import Link from 'next/link';
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { refreshRoom } from '@/app/actions';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  CAMERA, EXPIRY_WARN_MIN, LABEL_LAYOUT, LONG_TASK_MS, PARTS, type Part, type Presence, SOURCE_META, type Status,
  STATUS_COLOR, STATUS_LABEL, takeWorkSlot, truncateTitle, type Vec3, ZONE_INFO, ZONE_SLOTS,
} from '@/constants/office';
import { Avatar, characterOf, HEAD_Y, type LabelPlacement, NO_POINTER } from './Avatar';
import { Furniture } from './Furniture';
import { Gauges, remaining, type UsageRow } from './GaugeBar';
import { HistoryPanel } from './HistoryPanel';
import { Icon, type IconName } from './Icons';
import { I24 } from './ui';
import { IssueBoard } from './IssueBoard';
import { layoutLabels, placeZoneLabels, type Rect } from './labelLayout';
import { supabaseBrowser } from './supabaseBrowser';

// DB 변경은 Realtime으로 받는다. 시간이 지나 바뀌는 상태(Done 30분·직접 선택 만료·MP 리셋)는 이벤트가 없어 이 주기로 다시 읽는다
const POLL_MS = 30_000;

export type RoomMember = { id: string; login: string; name: string; character: string | null; part: Part | null; statusSource: string };
// effective_statuses 뷰 한 행
export type StatusRow = {
  member_id: string | null; status: string | null; task: string | null; started_at: string | null;
  source: string | null; expires_at: string | null; review: boolean | null; part: string | null; status_source: string | null;
  card_url: string | null; card_number: number | null; card_draft: boolean | null; progress_count: number | null;
  shadow_status: string | null; shadow_task: string | null; shadow_review: boolean | null;
  shadow_card_url: string | null; shadow_card_number: number | null; shadow_card_draft: boolean | null;
};
const STATUS_COLS = 'member_id, status, task, started_at, source, expires_at, review, part, status_source, card_url, card_number, card_draft, progress_count, shadow_status, shadow_task, shadow_review, shadow_card_url, shadow_card_number, shadow_card_draft';
type SyncInfo = { project_owner: string | null; github_synced_at: string | null; github_sync_error: string | null };
export type IssueRow = { id: number; member_id: string; title: string; created_at: string };
type RoomData = { statuses: StatusRow[]; issues: IssueRow[]; usage: UsageRow[]; sync: SyncInfo | null; at: number }; // at = 조회 시각

// 시안 v2 화면(1420×1020)과 같은 틀: 1단위 = 58.83px, 원점이 위에서 580px
const DESIGN = { w: 1420, h: 1020, ox: 710, oy: 580 };
const PX = CAMERA.pxPerUnit;
const FIT = { w: DESIGN.w / PX, h: DESIGN.h / PX };
const CENTER_Y = -(DESIGN.oy - DESIGN.h / 2) / 48; // 화면 위로 70px 올라간 원점을 맞추려 장면을 내린다 (월드 y 1 = 48px)
/** 월드 좌표 → 방 컨테이너 px (시안 README 3장 공식, 컨테이너 너비 비율로 곱함) */
const project = (x: number, y: number, z: number, k: number) => ({ x: (DESIGN.ox + (x - z) * 41.6) * k, y: (DESIGN.oy + (x + z) * 24 - y * 48) * k });

function IsoCamera() {
  const size = useThree((s) => s.size);
  return (
    <OrthographicCamera makeDefault position={CAMERA.position} near={0.1} far={200}
      zoom={Math.min(size.width / FIT.w, size.height / FIT.h)} onUpdate={(c) => c.lookAt(...CAMERA.lookAt)} />
  );
}

function setupEnvironment({ gl, scene }: RootState) {
  scene.environment = new THREE.PMREMGenerator(gl).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.38;
}

const NO_WANDER: Vec3[] = [];
const when = (iso: string) => new Date(iso).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
const hm = (iso: string) => new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
export function span(ms: number) {
  const m = Math.max(0, Math.round(ms / 60000));
  return m < 60 ? `${m}분` : `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ''}`;
}

type SourceKind = 'kanban' | 'timed' | 'pinned' | 'expired';

/** 자리 배정 + 표시 정보. 작업 구역은 파트별 하위 자리(takeWorkSlot), 나머지는 구역 자리를 앞에서부터 채운다 */
function seat(members: RoomMember[], { statuses, issues, usage, at }: RoomData) {
  const byMember = new Map(statuses.map((r) => [r.member_id, r]));
  const usageOf = new Map(usage.map((u) => [u.member_id, u]));
  const withIssue = new Set(issues.map((i) => i.member_id));
  const used: Record<string, number> = {};
  const work: Record<Part, number> = { dev: 0, design: 0, plan: 0 };
  return members.map((m) => {
    const row = byMember.get(m.id) ?? null;
    const status = row?.status && row.status in STATUS_LABEL ? (row.status as Status) : null;
    const u = usageOf.get(m.id) ?? null;
    // F13: MP가 바닥나면 실제 status와 상관없이 휴식 구역에 "MP 회복 중" (표시만 바꾸고 DB는 그대로)
    const mpOut = u !== null && remaining(u.mp_pct, u.mp_resets_at, at).left <= 0;
    const presence: Presence = mpOut ? 'break' : (status ?? 'offline');
    const part = ((row?.part as Part | null) ?? m.part) || null;
    let pos: Vec3;
    if (presence === 'coding') pos = takeWorkSlot(part ?? 'dev', work);
    else {
      const slots = ZONE_SLOTS[presence];
      const i = (used[presence] = (used[presence] ?? -1) + 1);
      pos = slots[i % slots.length];
    }
    const source: SourceKind | null = !row?.source ? null
      : row.source === 'github' ? 'kanban'
        : row.source === 'manual_pinned' ? 'pinned'
          : row.expires_at && Date.parse(row.expires_at) > at ? 'timed' : 'expired';
    const more = Math.max(0, (row?.progress_count ?? 0) - 1);
    const task = row?.task ?? '';
    return {
      member: m, row, status, presence, mpOut, pos, part, source, usage: u,
      wander: presence === 'offline' ? NO_WANDER : ZONE_INFO[presence].wander,
      issue: withIssue.has(m.id),
      // F9: 작업 중으로 같은 작업이 1시간 이상
      long: !mpOut && status === 'coding' && !!row?.started_at && at - Date.parse(row.started_at) >= LONG_TASK_MS,
      review: !mpOut && !!row?.review,
      // 말풍선: 대기·미연결은 없음. 제목 18자 말줄임 + 진행 중 카드 +n (more)
      bubble: mpOut ? 'MP 회복 중' : !status || status === 'idle' || !task ? null : truncateTitle(task),
      more: mpOut ? 0 : more,
      startedAt: row?.started_at ?? null,
    };
  });
}
export type Seat = ReturnType<typeof seat>[number];

/** 최종 상태·열린 이슈·사용량·칸반 동기화 상태. Realtime 변경 시 + 30초마다 읽고, reload()로 즉시 다시 읽는다 */
function useRoomData(roomId: string, memberIds: string) {
  // null = 아직 첫 응답 전. 그 전에 그리면 모두 미연결 자리에서 출발해 자리로 걸어가 버린다
  const [data, setData] = useState<RoomData | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const sb = supabaseBrowser();
    let alive = true;
    const load = async () => {
      const [s, i, u, r] = await Promise.all([
        sb.from('effective_statuses').select(STATUS_COLS).eq('room_id', roomId),
        sb.from('issues').select('id, member_id, title, created_at').eq('room_id', roomId).eq('state', 'open').order('created_at'),
        sb.from('usage').select('member_id, hp_pct, mp_pct, hp_resets_at, mp_resets_at, source, updated_at').in('member_id', memberIds.split(',')),
        sb.from('rooms').select('project_owner, github_synced_at, github_sync_error').eq('id', roomId).maybeSingle(),
      ]);
      for (const e of [s.error, i.error, u.error, r.error]) if (e) console.error('방 데이터 조회 실패', e.message);
      if (alive) {
        setData((prev) => ({
          statuses: (s.data as StatusRow[] | null) ?? prev?.statuses ?? [], issues: i.data ?? prev?.issues ?? [],
          usage: u.data ?? prev?.usage ?? [], sync: r.data ?? prev?.sync ?? null, at: Date.now(),
        }));
      }
    };
    // Realtime: 방 데이터가 바뀌면 다시 읽는다 (동기화가 카드를 한꺼번에 upsert하므로 300ms 묶음). DELETE는 RLS 미적용이라 구독하지 않는다
    let pending: ReturnType<typeof setTimeout> | undefined;
    const kick = () => { clearTimeout(pending); pending = setTimeout(load, 300); };
    const channel = sb.channel(`room:${roomId}`);
    const room = `room_id=eq.${roomId}`;
    const watch = [['statuses', room], ['github_cards', room], ['room_members', room], ['issues', room], ['rooms', `id=eq.${roomId}`], ['usage', `member_id=in.(${memberIds})`]] as const;
    for (const [table, filter] of watch) {
      for (const event of ['INSERT', 'UPDATE'] as const) channel.on('postgres_changes', { event, schema: 'public', table, filter }, kick);
    }
    channel.subscribe();
    load();
    const timer = setInterval(load, POLL_MS);
    return () => { alive = false; clearInterval(timer); clearTimeout(pending); void sb.removeChannel(channel); };
  }, [roomId, memberIds, tick]);
  return { data, reload: useCallback(() => setTick((t) => t + 1), []) };
}

const SOURCE_ICONS: Record<SourceKind, IconName[]> = { kanban: ['link'], timed: ['pencil', 'clock'], pinned: ['pencil', 'pin'], expired: ['pencil'] };

/** 이름표 블록: 말풍선 + (파트 배지 · 상태 점 · 이름 · 출처 아이콘) + HP·MP 미니 게이지 */
function LabelContent({ s, now, syncedAt, onSelect }: { s: Seat; now: number; syncedAt: string | null; onSelect: () => void }) {
  const p = s.part ? PARTS[s.part] : null;
  const color = STATUS_COLOR[s.presence];
  let tip = '';
  let warn = false;
  if (s.source === 'kanban') tip = SOURCE_META.kanban.tooltip({ minutesAgo: syncedAt ? Math.max(0, Math.round((now - Date.parse(syncedAt)) / 60000)) : 0 });
  else if (s.source === 'pinned') tip = SOURCE_META.pinned.tooltip({});
  else if (s.source === 'timed') {
    const left = Date.parse(s.row!.expires_at!) - now;
    warn = left <= EXPIRY_WARN_MIN * 60000;
    tip = (s.row?.status_source ?? s.member.statusSource) === 'github' ? SOURCE_META.timed.tooltip({ remain: span(left) }) : `직접 선택 · ${span(left)} 남음`;
  } else if (s.source === 'expired') tip = '직접 선택 (만료, 마지막 값 유지)';
  return (
    <>
      {s.bubble && (
        <button type="button" className={`bubble${s.long ? ' long' : ''}${s.mpOut ? ' mp' : ''}`} onClick={onSelect}>
          {s.long && <em>오래 지속 중 · 도움 필요?</em>}
          <span className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
            {s.review && <span className="tag-review">검토 중</span>}
            {s.bubble}
            {s.more > 0 && <span className="more">+{s.more}</span>}
          </span>
        </button>
      )}
      <span className="plate">
        <button type="button" className="nameplate" onClick={onSelect} aria-label={`${s.member.name} 작업 이력 보기`}>
          {p && s.part && <span className={`pbadge pbadge-${s.part}`}><Icon name={p.icon} />{p.label}</span>}
          <i className="dot" style={{ background: color.dot }} aria-label={STATUS_LABEL[s.presence]} />
          {s.member.name}
          {s.source && (
            <span className={`source${warn ? ' warn' : ''}`} title={tip} aria-label={tip}>
              {SOURCE_ICONS[s.source].map((n) => <Icon key={n} name={n} />)}
            </span>
          )}
          {s.bubble && <span className="bubble-icon" aria-hidden><Icon name="bubble" /></span>}
        </button>
        {s.usage && <Gauges usage={s.usage} now={now} />}
      </span>
    </>
  );
}

type Props = {
  roomId: string; title: string; members: RoomMember[]; meId: string; isOwner: boolean; projectLinked: boolean; syncedAt: string | null;
};

export function Room({ roomId, title, members, meId, isOwner, projectLinked, syncedAt }: Props) {
  const { data, reload } = useRoomData(roomId, members.map((m) => m.id).join(','));
  const seats = useMemo(() => (data ? seat(members, data) : []), [members, data]);
  const offline = seats.filter((s) => s.presence === 'offline');
  const [selected, setSelected] = useState<string | null>(null);
  const [popover, setPopover] = useState<'issues' | 'legend' | null>(null);
  const [bubbleMode, setBubbleMode] = useState<'all' | 'selected'>('all');
  const picked = seats.find((s) => s.member.id === selected);
  // drei Html은 기본 부착 위치가 첫 렌더 뒤에 바뀌어 첫 라벨이 사라진다. 부착 위치를 고정한다
  const overlay = useRef<HTMLDivElement>(null!);

  // ---- 겹침 방지 배치: 컨테이너 크기·이름표 실제 크기·HUD 영역을 재고, 상태·선택·크기가 바뀔 때만 계산한다
  // 크기는 ResizeObserver 콜백에서만 잰다 (이름표 블록·HUD·방 컨테이너가 등록될 때 관찰 시작)
  type Size = { bw: number; bh: number; pw: number; ph: number };
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [sizes, setSizes] = useState<Record<string, Size>>({});
  const [hud, setHud] = useState<Rect[]>([]);
  const labelEls = useRef(new Map<string, HTMLDivElement>());
  const ro = useRef<ResizeObserver | null>(null);
  const measure = useCallback(() => {
    const room = overlay.current;
    if (!room) return;
    setBox((b) => (b.w === room.clientWidth && b.h === room.clientHeight ? b : { w: room.clientWidth, h: room.clientHeight }));
    setSizes((old) => {
      let changed = false;
      const next = { ...old };
      for (const [id, el] of labelEls.current) {
        const bub = el.querySelector<HTMLElement>('.bubble'), plate = el.querySelector<HTMLElement>('.plate');
        const prev = next[id] ?? { bw: 0, bh: 0, pw: 0, ph: 0 };
        // 접힌 말풍선은 숨겨져 크기가 0이므로 마지막으로 잰 값을 쓴다
        const visible = !!bub && bub.offsetWidth > 0;
        const cur: Size = {
          bw: visible ? bub.offsetWidth : bub ? prev.bw : 0, bh: visible ? bub.offsetHeight : bub ? prev.bh : 0,
          pw: plate?.offsetWidth ?? 0, ph: plate?.offsetHeight ?? 0,
        };
        if ((Object.keys(cur) as (keyof Size)[]).some((key) => Math.abs(cur[key] - prev[key]) > 1)) { next[id] = cur; changed = true; }
      }
      return changed ? next : old;
    });
    const base = room.getBoundingClientRect();
    const rects = [...room.querySelectorAll<HTMLElement>(':scope > .hud')].map((e) => {
      const r = e.getBoundingClientRect();
      return { x: Math.round(r.left - base.left), y: Math.round(r.top - base.top), w: Math.round(r.width), h: Math.round(r.height) };
    });
    setHud((old) => (JSON.stringify(old) === JSON.stringify(rects) ? old : rects));
  }, []);
  const observe = useCallback((el: Element) => {
    ro.current ??= new ResizeObserver(() => measure());
    ro.current.observe(el);
  }, [measure]);
  useEffect(() => { observe(overlay.current); return () => ro.current?.disconnect(); }, [observe]);
  const registerLabel = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) { labelEls.current.set(id, el); observe(el); } else labelEls.current.delete(id);
  }, [observe]);
  // HUD(구석 고정 요소)는 선택·칸반 연결에 따라 나타나고 사라지므로 그때 다음 프레임에 다시 잰다
  const hudKey = `${selected ?? ''}|${projectLinked}|${popover ?? ''}`;
  useEffect(() => {
    const id = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(id);
  }, [measure, hudKey]);
  const k = box.w / DESIGN.w;
  const { placements, zoneDy } = useMemo(() => {
    const items = seats.filter((s) => s.presence !== 'offline').map((s) => {
      const [x, y, z] = s.pos;
      const head = project(x, y + HEAD_Y, z, k), feet = project(x, y, z, k), top = project(x, y + 1.25, z, k);
      const sz = sizes[s.member.id] ?? { bw: s.bubble ? 120 : 0, bh: s.bubble ? 30 : 0, pw: 120, ph: 36 };
      return {
        id: s.member.id, ax: head.x, head: head.y, feet: feet.y,
        w: Math.max(sz.bw, sz.pw), h: (sz.bh ? sz.bh + 4 : 0) + sz.ph, pw: sz.pw, ph: sz.ph,
        bubble: !!s.bubble, pinnedOpen: s.member.id === selected, wantCollapsed: bubbleMode === 'selected',
        prio: s.member.id === selected ? 0 : s.issue || s.long ? 1 : 2,
        body: { x: feet.x - 24 * k, y: top.y, w: 48 * k, h: feet.y - top.y },
      };
    });
    const placements = box.w ? layoutLabels(items, hud, box, LABEL_LAYOUT) : {};
    // 바닥 구역 이름은 맨 나중에: 캐릭터·이름표·HUD와 겹치면 옮기거나 숨긴다
    const taken: Rect[] = [...hud, ...items.map((i) => i.body), ...items.map((i) => {
      const p = placements[i.id];
      if (!p) return { x: 0, y: 0, w: 0, h: 0 };
      const w = p.collapsed ? i.pw : i.w, h = p.collapsed ? i.ph : i.h;
      return { x: i.ax + p.dx - w / 2, y: p.below ? i.feet + p.dy : i.head + p.dy - h, w, h };
    })];
    const zoneDy = placeZoneLabels((Object.keys(ZONE_INFO) as Status[]).map((st) => {
      const c = project(...ZONE_INFO[st].labelPos, k), w = (STATUS_LABEL[st].length + ZONE_INFO[st].place.length) * 12 + 30;
      return { id: st, r: { x: c.x - w / 2, y: c.y - 11, w, h: 22 } };
    }), taken);
    return { placements, zoneDy };
  }, [seats, sizes, hud, box, k, selected, bubbleMode]);

  const counts = (p: Presence) => seats.filter((s) => s.presence === p).length;
  const partCount = (part: Part) => seats.filter((s) => s.presence === 'coding' && s.part === part).length;
  const sync = data?.sync;
  const syncAgo = sync?.github_synced_at && data ? span(data.at - Date.parse(sync.github_synced_at)) : null;
  const patBroken = !!sync?.github_sync_error && /PAT/.test(sync.github_sync_error);

  const kanbanState = !projectLinked ? '연결 안 됨' : sync?.github_sync_error ? '연결 끊김' : '연결됨';
  const toggle = (p: 'issues' | 'legend') => setPopover((o) => (o === p ? null : p));
  const issueCount = data?.issues.length ?? 0;

  return (
    <>
      {isOwner && patBroken && (
        <div className="banner banner-danger" role="alert">
          <I24 name="alert" size={18} stroke={2} />
          <strong>칸반 연결이 끊겼습니다</strong><span>토큰이 만료되었거나 폐기되었습니다.</span>
          <Link className="btn btn-sm" style={{ marginLeft: 'auto', background: '#8A2E14', color: '#fff' }} href={`/rooms/${roomId}/settings`}>토큰 교체</Link>
        </div>
      )}
      <header className="row" style={{ alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <div className="stack" style={{ gap: 4, minWidth: 0 }}>
          <h1 className="t-h1 ellipsis">{title}</h1>
          <p className="t-sub row" style={{ gap: 6 }}>
            조원 {members.length}명 <span aria-hidden>·</span>
            <span className="row" style={{ gap: 5 }}>
              <span className="dot" style={{ background: kanbanState === '연결됨' ? 'var(--st-break)' : kanbanState === '연결 끊김' ? 'var(--expiry)' : 'var(--st-offline)' }} />
              칸반: {kanbanState}
            </span>
          </p>
        </div>
        <div className="row">
          <div className="seg" role="group" aria-label="말풍선 표시">
            <button type="button" className="seg-item" aria-pressed={bubbleMode === 'all'} onClick={() => setBubbleMode('all')}>모두 보기</button>
            <button type="button" className="seg-item" aria-pressed={bubbleMode === 'selected'} onClick={() => setBubbleMode('selected')}>선택만</button>
          </div>
          <button type="button" className="btn btn-secondary" aria-expanded={popover === 'issues'} onClick={() => toggle('issues')}>열린 이슈<span className="count">{issueCount}</span></button>
          {isOwner && <Link className="btn btn-secondary" href={`/rooms/${roomId}/settings`}><I24 name="gear" stroke={2} />방 설정</Link>}
        </div>
      </header>

      <div className="zones">
        {(['coding', 'meeting', 'break', 'done', 'idle', 'offline'] as Presence[]).map((p) => (
          <div key={p} className="zone" style={{ '--zc': STATUS_COLOR[p].dot, '--zi': STATUS_COLOR[p].text, opacity: p === 'offline' ? 0.75 : 1 } as CSSProperties}>
            <span className="zone-label"><span className="dot" style={{ background: STATUS_COLOR[p].dot }} />{STATUS_LABEL[p]}</span>
            <span className="zone-count">{counts(p)}</span>
            <span className="t-cap ellipsis">
              {p === 'coding' ? (Object.keys(PARTS) as Part[]).map((pt) => `${PARTS[pt].label} ${partCount(pt)}`).join(' · ')
                : p === 'offline' ? '가운데 통로' : p === 'done' ? `${ZONE_INFO.done.place} · 30분 후 대기석` : ZONE_INFO[p].place}
            </span>
          </div>
        ))}
      </div>

      <div className="room-card">
        <div className="room-stage">
          <div className="office" ref={overlay}>
            <Canvas shadows={{ type: THREE.VSMShadowMap }} dpr={[1, 2]} gl={{ toneMappingExposure: 0.95 }} onCreated={setupEnvironment} onPointerMissed={() => setSelected(null)}>
              <IsoCamera />
              <hemisphereLight args={['#fbf6ff', '#8a80c8', 0.55]} />
              <directionalLight color="#fff3e6" intensity={2.4} position={[-4, 12, 7]} castShadow shadow-mapSize={[2048, 2048]}
                shadow-camera-left={-13} shadow-camera-right={13} shadow-camera-top={13} shadow-camera-bottom={-13}
                shadow-camera-near={1} shadow-camera-far={40} shadow-radius={14} shadow-blurSamples={25} shadow-bias={-0.0004} shadow-normalBias={0.02} />
              <directionalLight color="#cfe3ff" intensity={0.35} position={[8, 5, 2]} />
              <group position={[0, CENTER_Y, 0]}>
                <Furniture />
                {(Object.keys(ZONE_INFO) as Status[]).map((st) => zoneDy[st] !== null && (
                  <Html key={st} position={ZONE_INFO[st].labelPos} center zIndexRange={[10, 0]} portal={overlay} style={NO_POINTER}>
                    <span className="floor-label" style={{ color: STATUS_COLOR[st].text, transform: `translateY(${zoneDy[st] ?? 0}px)` }}>
                      <span className="dot" style={{ width: 7, height: 7, background: STATUS_COLOR[st].dot }} />
                      {STATUS_LABEL[st]} · {ZONE_INFO[st].place}
                    </span>
                  </Html>
                ))}
                {seats.map((s) => (
                  <Avatar
                    key={s.member.id} memberId={s.member.id} character={characterOf(s.member.login, s.member.character)} part={s.member.part}
                    x={s.pos[0]} y={s.pos[1]} z={s.pos[2]} wander={s.wander} offline={s.presence === 'offline'} issue={s.issue}
                    selected={s.member.id === selected} onSelect={() => setSelected(s.member.id)} portal={overlay}
                    placement={(placements[s.member.id] as LabelPlacement | undefined) ?? { dx: 0, dy: 0, below: false, collapsed: false }}
                    registerLabel={registerLabel}
                    label={s.presence === 'offline' ? null : <LabelContent s={s} now={data!.at} syncedAt={sync?.github_synced_at ?? null} onSelect={() => setSelected(s.member.id)} />}
                  />
                ))}
                {/* 벽 이슈 보드(히트 박스)를 눌러도 이슈 목록이 열린다. 버튼은 HUD에 둔다 */}
                <mesh position={[-8.95, 2.1, -3.9]} onClick={(e) => { e.stopPropagation(); toggle('issues'); }}>
                  <boxGeometry args={[0.3, 1.9, 4]} />
                  <meshBasicMaterial transparent opacity={0} depthWrite={false} />
                </mesh>
                {offline.length > 0 && (
                  <Html position={[-0.35, 0, 0.95]} center portal={overlay} zIndexRange={[100, 20]} style={NO_POINTER}>
                    <span className="offline-tag">
                      <I24 name="wifiOff" size={12} />
                      미연결 ·{' '}
                      {offline.map((s, i) => (
                        <span key={s.member.id}>{i > 0 && ', '}{s.member.name}{s.issue && <b className="issue-badge" aria-label="열린 이슈">!</b>}</span>
                      ))}
                    </span>
                  </Html>
                )}
              </group>
            </Canvas>

            {/* HUD: 구석 고정, 이름표 배치 금지 구역 */}
            <button type="button" className="hud tl hud-board" aria-expanded={popover === 'issues'} aria-label={`이슈 보드 열기, 열린 이슈 ${issueCount}개`} onClick={() => toggle('issues')}>
              <I24 name="board" stroke={2.2} />이슈 보드<span className="count">{issueCount}</span>
            </button>
            {projectLinked && (
              <p className={`hud tr hud-sync${sync?.github_sync_error ? ' failed' : ''}`} role="status" aria-live="polite" title={sync?.github_sync_error ?? undefined}>
                {sync?.github_sync_error
                  ? <><I24 name="failed" size={12} stroke={2.6} />마지막 동기화 {syncAgo ? `${syncAgo} 전` : '없음'} · 실패</>
                  : syncAgo ? `칸반 동기화 · ${syncAgo} 전` : <><I24 name="spin" size={12} stroke={3} className="spin" />칸반 동기화 중</>}
              </p>
            )}
            {!picked && popover !== 'issues' && <p className="hud bl hud-hint">캐릭터나 이름표를 누르면 작업 이력을 볼 수 있어요</p>}
            <div className="hud br hud-legend">
              {popover === 'legend' && (
                <div id="legend" className="legend" aria-label="범례">
                  <span><Icon name="link" />칸반 연동</span>
                  <span><span className="tag-review">검토 중</span>In review 카드</span>
                  <span><Icon name="pencil" /><Icon name="clock" />직접 · 시간 지나면 복귀</span>
                  <span><span style={{ width: 18, height: 10, borderRadius: 4, background: 'var(--long-bg)', border: '2px solid var(--long-line)' }} />오래 지속된 작업</span>
                  <span><Icon name="pencil" /><Icon name="pin" />직접 · 해제할 때까지</span>
                  <span><span style={{ width: 16, height: 2, background: 'rgba(90, 80, 130, 0.5)' }} />자리를 옮긴 이름표</span>
                  <span><span className="bubble-icon" style={{ display: 'inline-flex' }}><Icon name="bubble" /></span>말풍선 접힘</span>
                  <span><span style={{ width: 12, height: 12, borderRadius: '50%', background: '#B8B0CC', opacity: 0.45 }} />반투명 = 미연결</span>
                  {(Object.keys(PARTS) as Part[]).map((p) => (
                    <span key={p}><span className={`pbadge pbadge-${p}`}><Icon name={PARTS[p].icon} />{PARTS[p].label}</span>{PARTS[p].seat}</span>
                  ))}
                </div>
              )}
              <button type="button" aria-expanded={popover === 'legend'} aria-controls="legend" onClick={() => toggle('legend')}>{popover === 'legend' ? '범례 닫기' : '범례 보기'}</button>
            </div>
            {popover === 'issues' && data && (
              <IssueBoard issues={data.issues} seats={seats} onPick={(id) => { setSelected(id); setPopover(null); }} onClose={() => setPopover(null)} />
            )}
          </div>
        </div>

        {picked && data && (
          <HistoryPanel
            roomId={roomId} seat={picked} issues={data.issues.filter((i) => i.member_id === picked.member.id)} now={data.at}
            onClose={() => setSelected(null)} isMe={picked.member.id === meId} projectLinked={projectLinked} onChanged={reload}
            syncedAt={sync?.github_synced_at ?? null} maxHeight={box.h || undefined}
          />
        )}
      </div>

      <details className="details">
        <summary><I24 name="next" size={12} stroke={3} />조원 {members.length}명 · 협업자 동기화 {syncedAt ? when(syncedAt) : '-'}</summary>
        <ul className="roster">
          {members.map((m) => {
            const s = seats.find((x) => x.member.id === m.id);
            const presence = s?.presence ?? 'offline';
            return (
              <li key={m.id} className="list-row" style={{ opacity: presence === 'offline' ? 0.6 : 1 }}>
                {m.part ? <span className={`pbadge pbadge-${m.part}`}>{PARTS[m.part].label}</span> : <span className="pbadge" style={{ background: 'var(--surface-2)' }}>파트 없음</span>}
                <span style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>{m.name}{m.id === meId && <span className="me" style={{ marginLeft: 6 }}>나</span>}</span>
                <span className="row" style={{ gap: 4, fontSize: 12, fontWeight: 700, color: STATUS_COLOR[presence].text }}>
                  <span className="dot" style={{ width: 7, height: 7, background: STATUS_COLOR[presence].dot }} />{s?.mpOut ? 'MP 회복 중' : STATUS_LABEL[presence]}
                </span>
              </li>
            );
          })}
        </ul>
        <form action={refreshRoom.bind(null, roomId)} className="row" style={{ justifyContent: 'flex-end', marginBottom: 12 }}>
          <span className="hint">저장소에 새 협업자가 생기면 다시 맞춰 주세요.</span>
          <button type="submit" className="btn btn-secondary btn-sm">협업자 새로고침</button>
        </form>
      </details>
    </>
  );
}

export { hm };
