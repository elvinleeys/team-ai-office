// 이름표·말풍선 겹침 방지 배치 (team-office-3d-v2/docs/overlap-rules.md). 순수 함수 — labelLayout.test.ts로 검사한다.
// 좌표는 방 컨테이너 기준 px. 후보 자리를 순서대로 시도해 몸통·이미 놓인 블록·HUD·방 경계와 겹치지 않는 첫 자리에 둔다.

export type Rect = { x: number; y: number; w: number; h: number };
export type LabelItem = {
  id: string;
  ax: number; head: number; feet: number;   // 기준점: 머리 위(블록 아래 가운데가 붙는 곳)·발밑의 화면 좌표
  w: number; h: number;                    // 말풍선 + 이름표 블록 크기
  pw: number; ph: number;                  // 이름표(+게이지)만의 크기 (말풍선 접힘)
  bubble: boolean;                         // 말풍선이 있는지
  pinnedOpen: boolean;                     // 선택된 조원: 말풍선을 접지 않는다
  wantCollapsed: boolean;                  // "선택만" 보기: 말풍선 접기
  prio: number;                            // 작을수록 먼저 (선택 0 → 이슈·장기 작업 1 → 나머지 2)
  body: Rect;                              // 캐릭터 몸통
};
export type Placement = { dx: number; dy: number; below: boolean; collapsed: boolean };

const hit = (a: Rect, b: Rect, m: number) => a.x < b.x + b.w + m && b.x < a.x + a.w + m && a.y < b.y + b.h + m && b.y < a.y + a.h + m;
const inside = (r: Rect, W: number, H: number) => r.x >= 0 && r.y >= 0 && r.x + r.w <= W && r.y + r.h <= H;

export function layoutLabels(
  items: LabelItem[], obstacles: Rect[], bounds: { w: number; h: number },
  opts: { candidates: readonly (readonly [number, number])[]; belowCandidates: readonly number[]; margin: number },
): Record<string, Placement> {
  const placed: Rect[] = [...obstacles];
  const out: Record<string, Placement> = {};
  // 우선순위 → 같은 순위면 뒤쪽(화면 위)부터
  const order = [...items].sort((a, b) => a.prio - b.prio || a.feet - b.feet);
  const free = (r: Rect, self: string) =>
    inside(r, bounds.w, bounds.h) && !placed.some((p) => hit(r, p, opts.margin)) && !items.some((o) => o.id !== self && hit(r, o.body, opts.margin));
  const tryPlace = (it: LabelItem, w: number, h: number): { r: Rect; p: Omit<Placement, 'collapsed'> } | null => {
    for (const [cx, cy] of opts.candidates) {
      const r = { x: it.ax + cx - w / 2, y: it.head + cy - h, w, h };
      if (free(r, it.id)) return { r, p: { dx: cx, dy: cy, below: false } };
    }
    for (const cx of opts.belowCandidates) {
      const r = { x: it.ax + cx - w / 2, y: it.feet + 4, w, h };
      if (free(r, it.id)) return { r, p: { dx: cx, dy: 4, below: true } };
    }
    return null;
  };
  for (const it of order) {
    const full = it.bubble && (it.pinnedOpen || !it.wantCollapsed) ? tryPlace(it, it.w, it.h) : null;
    if (full) { placed.push(full.r); out[it.id] = { ...full.p, collapsed: false }; continue; }
    if (it.pinnedOpen && it.bubble) {
      // 선택된 조원은 접지 않는다. 자리가 없으면 기본 자리
      placed.push({ x: it.ax - it.w / 2, y: it.head - it.h, w: it.w, h: it.h });
      out[it.id] = { dx: 0, dy: 0, below: false, collapsed: false };
      continue;
    }
    const plate = tryPlace(it, it.pw, it.ph);
    const r = plate?.r ?? { x: it.ax - it.pw / 2, y: it.head - it.ph, w: it.pw, h: it.ph };
    placed.push(r);
    out[it.id] = { ...(plate?.p ?? { dx: 0, dy: 0, below: false }), collapsed: it.bubble };
  }
  return out;
}

/** 바닥 구역 이름: 최하위 우선순위. 겹치면 ±16px 옮겨 보고, 그래도 겹치면 숨긴다 */
export function placeZoneLabels(labels: { id: string; r: Rect }[], taken: Rect[]): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const { id, r } of labels) {
    out[id] = null;
    for (const dy of [0, -16, 16]) {
      const m = { ...r, y: r.y + dy };
      if (!taken.some((t) => hit(m, t, 2))) { out[id] = dy; taken.push(m); break; }
    }
  }
  return out;
}
