// node src/components/labelLayout.test.ts  (Node 22.18+ 타입 제거 실행, 의존성 없음)
import assert from 'node:assert/strict';
import { layoutLabels, placeZoneLabels, type LabelItem } from './labelLayout.ts';

const opts = { candidates: [[0, 0], [0, -22], [-60, -6], [60, -6]] as [number, number][], belowCandidates: [0, -70, 70], margin: 3 };
const item = (id: string, ax: number, extra: Partial<LabelItem> = {}): LabelItem => ({
  id, ax, head: 200, feet: 260, w: 100, h: 50, pw: 80, ph: 24, bubble: true, pinnedOpen: false, wantCollapsed: false, prio: 2,
  body: { x: ax - 20, y: 210, w: 40, h: 50 }, ...extra,
});
const B = { w: 800, h: 600 };

// 혼자면 머리 바로 위
assert.deepEqual(layoutLabels([item('a', 400)], [], B, opts).a, { dx: 0, dy: 0, below: false, collapsed: false });

// 나란히 붙은 두 명: 먼저 놓인 쪽이 기본 자리, 다른 쪽은 옮겨진다 (겹치지 않음)
const two = layoutLabels([item('a', 400), item('b', 430)], [], B, opts);
assert.deepEqual(two.a, { dx: 0, dy: 0, below: false, collapsed: false });
assert.notDeepEqual([two.b.dx, two.b.dy, two.b.below], [0, 0, false]);

// 우선순위: 선택된 조원(prio 0)이 기본 자리를 가진다
const sel = layoutLabels([item('a', 400), item('b', 430, { prio: 0, pinnedOpen: true })], [], B, opts);
assert.deepEqual(sel.b, { dx: 0, dy: 0, below: false, collapsed: false });

// HUD가 머리 위를 막으면 다른 후보로 피한다
const hud = layoutLabels([item('a', 400)], [{ x: 340, y: 140, w: 120, h: 70 }], B, opts);
assert.ok(hud.a.dx !== 0 || hud.a.below);

// 어디도 안 되면 말풍선을 접는다 (선택 안 된 조원). 선택된 조원은 접지 않는다
const tight = { w: 120, h: 300 };
assert.equal(layoutLabels([item('a', 60, { head: 40 })], [], tight, opts).a.collapsed, true);
assert.equal(layoutLabels([item('a', 60, { head: 40, pinnedOpen: true })], [], tight, opts).a.collapsed, false);

// "선택만" 보기: 접힌 이름표만 놓는다
assert.equal(layoutLabels([item('a', 400, { wantCollapsed: true })], [], B, opts).a.collapsed, true);

// 바닥 구역 이름: 겹치면 옮기고, 그래도 안 되면 숨긴다
const z = placeZoneLabels([{ id: 'z', r: { x: 0, y: 100, w: 50, h: 20 } }], [{ x: 0, y: 80, w: 50, h: 60 }]);
assert.equal(z.z, null);
assert.equal(placeZoneLabels([{ id: 'z', r: { x: 0, y: 100, w: 50, h: 20 } }], []).z, 0);
console.log('labelLayout ok');
