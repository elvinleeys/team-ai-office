// 팀 작업 현황 3D 오피스 — 디자인 시안 v2 기준 상수
// 좌표계: Three.js 월드 좌표 (Y = 위, 바닥 = 0). 바닥 X -9~9, Z -7~7 (18 x 14).
// 왼쪽 벽 = X=-9 평면, 뒤쪽 벽 = Z=-7 평면 (출입문은 뒤쪽 벽 오른쪽 끝).
// 카메라는 (+X, +Y, +Z) 방향에서 내려다보는 정사영 아이소메트릭.

export type Status = 'coding' | 'meeting' | 'break' | 'done' | 'idle';
export type Presence = Status | 'offline';           // offline = 미연결 (status 와 별개로 판단)
export type Part = 'dev' | 'design' | 'plan';
export type Source = 'kanban' | 'timed' | 'pinned';  // 칸반 연동 / 직접 선택·시간 만료 / 직접 선택·고정
export type KanbanColumn = 'Backlog' | 'Ready' | 'In progress' | 'In review' | 'Done';
export type CharacterId = 'nyang' | 'sprout' | 'ppi' | 'mong';
export type Vec3 = [number, number, number];

export const ROOM = { halfX: 9, halfZ: 7, wallHeight: 3.6 } as const;

// ---------- 1. 문구
export const STATUS_LABEL: Record<Presence, string> = {
  coding: '작업 중', meeting: '회의 중', break: '휴식 중', done: '완료 정리', idle: '대기', offline: '미연결',
};
export const KANBAN_COLUMN: Record<KanbanColumn, { label: string; status: Status; review?: boolean; note?: string }> = {
  'Backlog':     { label: '백로그',  status: 'idle' },
  'Ready':       { label: '준비됨',  status: 'idle' },
  'In progress': { label: '진행 중', status: 'coding' },
  'In review':   { label: '검토 중', status: 'coding', review: true },          // 말풍선 앞 "검토 중" 태그
  'Done':        { label: '완료',    status: 'done', note: '완료 구역 30분 → 대기석' },
};
export const DONE_TO_IDLE_MS = 30 * 60 * 1000;

// ---------- 색 (상태·파트는 색만으로 구분하지 않고 아이콘·텍스트를 같이 쓴다)
export const STATUS_COLOR: Record<Presence, { dot: string; text: string }> = {
  coding:  { dot: '#4C7DE8', text: '#2F5BC4' },
  meeting: { dot: '#E8873A', text: '#A3530F' },
  break:   { dot: '#2FA37A', text: '#1E7556' },
  done:    { dot: '#8A63D2', text: '#6844AE' },
  idle:    { dot: '#B08A5A', text: '#7A5A30' },
  offline: { dot: '#A79FBF', text: '#5A5370' },
};
export const PARTS: Record<Part, { label: string; icon: 'code' | 'brush' | 'clipboard'; bg: string; text: string; seat: string; costume: string; short: string }> = {
  dev:    { label: '개발',  icon: 'code',      bg: '#E3ECFD', text: '#2F5BC4', seat: '모니터 책상', costume: '헤드셋 + 마이크', short: '모니터 책상 · 헤드셋' },
  design: { label: '디자인', icon: 'brush',     bg: '#FCE4EC', text: '#A8325F', seat: '드로잉 책상(태블릿·펜)', costume: '베레모 + 붓', short: '드로잉 책상 · 베레모와 붓' },
  plan:   { label: '기획',  icon: 'clipboard', bg: '#FFF1C9', text: '#7A5300', seat: '화이트보드 앞', costume: '동그란 안경 + 클립보드', short: '화이트보드 · 안경과 클립보드' },
};
export const SOURCE_META: Record<Source, { icons: string[]; tooltip: (p: { minutesAgo?: number; remain?: string }) => string }> = {
  kanban: { icons: ['link'],          tooltip: ({ minutesAgo }) => `칸반 연동 · ${minutesAgo}분 전 동기화` },
  timed:  { icons: ['pencil', 'clock'], tooltip: ({ remain }) => `${remain} 후 칸반 복귀` },   // 만료 10분 이내 → 시계 아이콘 강조색 #E8590C
  pinned: { icons: ['pencil', 'pin'],   tooltip: () => '직접 해제할 때까지 유지' },
};
export const EXPIRY_WARN_MIN = 10;
export const OVERRIDE_DEFAULT_MS = 2 * 60 * 60 * 1000; // "2시간 후 자동 복귀"

// ---------- 2·3. 구역과 자리 (자리는 앞에서부터 채움)
const MEETING_CENTER: [number, number] = [0, 4.2];
const stools: Vec3[] = [1, 0, 2, 5, 3, 4].map((i) => {
  const a = Math.PI / 6 + (i * Math.PI) / 3;
  return [MEETING_CENTER[0] + 2.05 * Math.cos(a), 0.52, MEETING_CENTER[1] + 2.05 * Math.sin(a)];
});

// 작업 구역: 파트별 하위 자리. 부족하면 같은 구역 다른 파트 자리를 빌린다 (takeWorkSlot 참고)
export const WORK_SLOTS: Record<Part, Vec3[]> = {
  dev:    [[-6.15, 0.5, -5.25], [-4.7, 0.5, -5.25], [-7.6, 0.5, -5.25]],   // 모니터 책상 (뒤 벽)
  design: [[-6.15, 0.5, -2.3],  [-4.7, 0.5, -2.3],  [-7.6, 0.5, -2.3]],    // 드로잉 책상 (둘째 줄)
  plan:   [[-0.8, 0, -5.2],     [0.5, 0, -5.2],     [-2.1, 0, -5.2]],      // 화이트보드 앞 (서서)
};
export const ZONE_SLOTS: Record<Exclude<Presence, 'coding'>, Vec3[]> = {
  meeting: stools,                                                          // 원형 테이블 둘러앉음
  break: [[6.2, 0.62, 2.3], [4.9, 0.62, 2.3], [7.5, 0.62, 2.3], [6.2, 0.45, 5.2], [4.9, 0.45, 5.2], [7.5, 0.45, 5.2]], // 소파 3 + 빈백 3
  done:  [[-7.3, 0, 4.1], [-7.3, 0, 2.6], [-7.3, 0, 5.6], [-6.0, 0, 4.1], [-6.0, 0, 2.6], [-6.0, 0, 5.6]],           // 책장 앞 서서
  // 대기석: 벤치 4석(바르게 앉음) → 넘치면 벤치 앞 서는 자리
  idle:  [[3.15, 0.6, -6.4], [4.2, 0.6, -6.4], [5.25, 0.6, -6.4], [6.3, 0.6, -6.4], [3.6, 0, -4.7], [4.9, 0, -4.7], [6.2, 0, -4.7]],
  // 미연결: 가운데 통로, 반투명(opacity 0.45) + "미연결 · 이름" 묶음 라벨
  offline: [[0.3, 0, 0.05], [-1.0, 0, 0.05], [1.6, 0, 0.05], [-2.3, 0, 0.05]],
};
export const POSE: Record<Presence, string> = {
  coding: 'sit-work', meeting: 'sit-around', break: 'lean-back', done: 'stand-tidy', idle: 'sit-upright', offline: 'stand-faded',
};

export function takeWorkSlot(part: Part, used: Record<Part, number>): Vec3 {
  if (used[part] < WORK_SLOTS[part].length) return WORK_SLOTS[part][used[part]++];
  for (const p of ['dev', 'design', 'plan'] as Part[]) if (used[p] < WORK_SLOTS[p].length) return WORK_SLOTS[p][used[p]++];
  return WORK_SLOTS[part][0];
}

// 구역 범위 (바닥 패드 색)
export const ZONES = {
  work:    { x: [-8.8, 1.8], z: [-6.8, -1.25], tint: '#D9E7FC' },
  wait:    { x: [2.2, 8.8],  z: [-6.8, -1.25], tint: '#F5E7D2' },
  aisle:   { x: [-9, 9],     z: [-1, 1.2],     tint: '#F4ECE8' },
  done:    { x: [-8.8, -3.25], z: [1.25, 6.8], tint: '#EADFFC' },
  meeting: { x: [-2.75, 2.75], z: [1.25, 6.8], tint: '#FDE4D2' },
  break:   { x: [3.25, 8.8],  z: [1.25, 6.8], tint: '#D5F3E6' },
} as const;
export const DOOR = { x: [7.3, 8.8], wall: 'back' } as const;
export const PARTITIONS: { from: [number, number]; to: [number, number] }[] = [ // [x,z], 높이 1.05
  { from: [-8.8, -1], to: [-4.6, -1] }, { from: [-2.6, -1], to: [1.9, -1] },
  { from: [2.3, -1], to: [4.6, -1] },   { from: [6.4, -1], to: [8.9, -1] },
  { from: [2, -6.9], to: [2, -1] },
  { from: [-3, 1.25], to: [-3, 6.6] },  { from: [3, 1.25], to: [3, 6.6] },
];
export const ISSUE_BOARD = { wall: 'left', z: [-5.9, -1.9], y: [1.15, 3.05] } as const;

// ---------- 4. 캐릭터
export const CHARACTERS: Record<CharacterId, { name: string; desc: string; base: string; accent: string; cardBg: string }> = {
  nyang:  { name: '냥냥', desc: '쫑긋한 고양이 귀', base: '#8EB8F7', accent: '#F7A99A', cardBg: '#E3EDFD' },
  sprout: { name: '새싹', desc: '머리 위 작은 새싹', base: '#F9B3A5', accent: '#86D493', cardBg: '#FDE7E2' },
  ppi:    { name: '삐삐', desc: '반짝이는 더듬이',   base: '#C9AEF5', accent: '#FBD77A', cardBg: '#EEE6FC' },
  mong:   { name: '몽글', desc: '둥근 귀와 목도리',  base: '#93DBB8', accent: '#F7A99A', cardBg: '#DFF5EA' },
};

// ---------- 6. 말풍선
export const BUBBLE = { maxChars: 18, ellipsis: '…' } as const;
export const truncateTitle = (s: string) => (s.length > BUBBLE.maxChars ? s.slice(0, BUBBLE.maxChars) + BUBBLE.ellipsis : s);

// ---------- 겹침 방지 (docs/overlap-rules.md)
export const LABEL_LAYOUT = {
  candidates: [[0, 0], [0, -22], [-60, -6], [60, -6], [0, -44], [-100, -18], [100, -18], [-60, -40], [60, -40], [0, -70], [-130, -40], [130, -40]] as [number, number][],
  belowCandidates: [0, -70, 70],
  leaderLineMinPx: 16,
  margin: 3,
} as const;

// ---------- 여기부터 구현에서 추가 (시안 v2 파일에 없는 값). 구역·좌표의 기준은 위 상수다
// DB statuses·MCP가 받는 직접 선택 4개. idle(대기)은 칸반 결과로만 정해진다 (effective_statuses 뷰)
export type ManualStatus = Exclude<Status, 'idle'>;
export const MANUAL_STATUSES: ManualStatus[] = ['coding', 'meeting', 'break', 'done'];
export const CHARACTER_IDS = Object.keys(CHARACTERS) as CharacterId[];
// 캐릭터 메시 종류 (scene-reference.js buildChar kind)
export const CHARACTER_KIND: Record<CharacterId, 'cat' | 'sprout' | 'antenna' | 'round'> = { nyang: 'cat', sprout: 'sprout', ppi: 'antenna', mong: 'round' };

// 장기 작업 경고(F9): coding 상태로 같은 작업이 이 시간 이상 (2026-11-17 사용자 결정: 1시간)
export const LONG_TASK_MS = 60 * 60 * 1000;

// 구역 이름·위치 이름·바닥 라벨 위치·배회 지점 (배회는 자리에서 WANDER_RANGE 안의 빈 바닥만)
export const WANDER_RANGE = 2.6;
export const ZONE_INFO: Record<Status, { place: string; labelPos: Vec3; wander: Vec3[] }> = {
  coding:  { place: '작업 책상',   labelPos: [-3.5, 0, -1.55], wander: [[-8.2, 0, -4.5], [-6.9, 0, -4.5], [-5.4, 0, -4.5], [-3.3, 0, -1.7], [-3.4, 0, -4.6], [0.9, 0, -3.2], [-1.9, 0, -3.4]] },
  meeting: { place: '원형 테이블', labelPos: [0, 0, 6.6],     wander: [[-1.7, 0, 1.7], [1.7, 0, 1.7], [-2.3, 0, 6.2], [2.3, 0, 6.2]] },
  break:   { place: '소파',       labelPos: [6.1, 0, 6.6],   wander: [[4.0, 0, 3.15], [8.2, 0, 3.15], [4.1, 0, 6.3], [6.2, 0, 6.4]] },
  done:    { place: '책장 앞',     labelPos: [-6.0, 0, 6.6],  wander: [[-4.5, 0, 2.3], [-4.5, 0, 3.9], [-5.0, 0, 5.3], [-7.6, 0, 1.6]] },
  idle:    { place: '대기석',     labelPos: [5.5, 0, -1.55], wander: [[3.1, 0, -3.4], [5.6, 0, -3.3], [7.6, 0, -3.6]] },
};
// 통로 쪽 출입구 (다른 구역으로 걸어갈 때 파티션을 피하는 경유지)
export const DOORWAYS = { work: [-3.6, -1.5] as [number, number], wait: [5.5, -1.5] as [number, number], aisleZ: 0.1 };

// ---------- 카메라 (시안과 동일 각도)
export const CAMERA = { position: [30, 30, 30] as Vec3, lookAt: [0, 0, 0] as Vec3, pxPerUnit: 41.6 * Math.SQRT2 };
export const PALETTE = {
  pageBg: '#FBF1EE', floor: '#F7E6DF', wallLeft: '#F9DCD8', wallBack: '#FDF1E8', slab: '#EFA3A3', slabLayer: '#F8C6C1',
  wood: '#F3D2A6', woodDark: '#E2B583', cream: '#FFF9F3',
  mint: '#9FE0CC', peach: '#F7A99A', periwinkle: '#A9B8F5', butter: '#FBD77A', lilac: '#CDB6F5',
  text: '#2B2540', subText: '#6A6283',
  hp: '#E5534B', hpTrack: '#F3DCDA', mp: '#3D7BE0', mpTrack: '#DCE6F7',
  issue: '#FF8A3D', longTaskBg: '#FFF1D6', longTaskBorder: '#E8A33D', mpEmptyBg: '#E6F0FF',
  reviewTagBg: '#FFF0C2', reviewTagBorder: '#E5B93C', reviewTagText: '#7A5300', expiryWarn: '#E8590C',
} as const;
