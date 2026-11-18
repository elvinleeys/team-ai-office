'use client';

// 캐릭터 형태는 시안 v2 team-office-3d-v2/source/scene-reference.js 의 buildChar() + partCostume()를 옮긴 것.
// 이름표 블록(말풍선·이름표·게이지)의 위치는 Room의 겹침 방지 배치(docs/overlap-rules.md)가 정해 offset으로 넘긴다.
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { type ReactNode, type RefObject, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { CHARACTER_KIND, CHARACTERS, type CharacterId, CHARACTER_IDS, DOORWAYS, type Part, type Vec3, WANDER_RANGE } from '@/constants/office';

type Kind = (typeof CHARACTER_KIND)[CharacterId];

function buildChar(kind: Kind, base: string, accent: string, part: Part | null, faded: boolean) {
  const root = new THREE.Group();
  // 걸을 때 흔드는 다리·팔. 원래 위치를 userData.base에 둔다
  const legs: THREE.Mesh[] = [], arms: THREE.Mesh[] = [];
  const limb = (list: THREE.Mesh[], m: THREE.Mesh) => { m.userData.base = m.position.clone(); list.push(m); };
  const mats = new Map<string, THREE.Material>();
  const mat = (color: string, rough: number, glossy = false, extra: THREE.MeshPhysicalMaterialParameters = {}) => {
    const k = color + rough + glossy + JSON.stringify(extra);
    if (!mats.has(k))
      mats.set(k, new THREE.MeshPhysicalMaterial({
        color, roughness: Math.min(rough, 0.6), metalness: 0,
        clearcoat: glossy ? 0.8 : 0.35, clearcoatRoughness: glossy ? 0.25 : 0.35,
        // 미연결 조원은 반투명 (시안 opacity 0.45)
        transparent: faded, opacity: faded ? 0.45 : 1, ...extra,
      }));
    return mats.get(k)!;
  };
  const add = <T extends THREE.Object3D>(m: T) => { m.traverse((o) => { o.castShadow = !faded; o.receiveShadow = true; }); root.add(m); return m; };
  const blob = (x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string, rough: number) => {
    const m = add(new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), mat(color, rough)));
    m.scale.set(sx, sy, sz);
    m.position.set(x, y, z);
    return m;
  };
  // 카메라(+X+Z)를 보는 좌표계: f = 앞, side = 옆
  const face = (f: number, side: number, y: number): [number, number, number] => {
    const k = Math.SQRT1_2;
    return [f * k + side * k, y, f * k - side * k];
  };
  const HM = mat(base, 0.32, true);

  for (const sd of [-0.11, 0.11]) { const [x, , z] = face(0.02, sd, 0); limb(legs, blob(x, 0.08, z, 0.1, 0.1, 0.1, base, 0.32)); }
  add(new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.1, 10, 32), HM)).position.set(0, 0.3, 0);
  blob(...face(0.13, 0, 0.28), 0.11, 0.12, 0.11, '#FFF6EE', 0.32);
  for (const sd of [-0.23, 0.23]) { const [x, , z] = face(0.03, sd, 0); limb(arms, blob(x, 0.3, z, 0.07, 0.12, 0.07, base, 0.32)); }
  const hy = 0.78;
  const head = add(new THREE.Mesh(new THREE.SphereGeometry(0.4, 48, 32), HM));
  head.scale.set(1.05, 0.9, 1.05);
  head.position.set(0, hy, 0);
  for (const sd of [-0.14, 0.14]) {
    blob(...face(0.385, sd, hy - 0.01), 0.045, 0.06, 0.045, '#2B2540', 0.15);
    blob(...face(0.41, sd + 0.015, hy + 0.02), 0.013, 0.013, 0.013, '#FFFFFF', 0.1);
    blob(...face(0.36, sd * 1.65, hy - 0.11), 0.065, 0.035, 0.065, '#FF9DAE', 0.5);
  }
  blob(...face(0.4, 0, hy - 0.11), 0.03, 0.018, 0.03, '#C2546A', 0.4);

  if (kind === 'cat') {
    for (const sd of [-0.22, 0.22]) {
      const [x, , z] = face(-0.02, sd, 0);
      const ear = add(new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.24, 32), HM));
      ear.position.set(x, hy + 0.34, z);
      ear.quaternion.setFromAxisAngle(new THREE.Vector3(Math.SQRT1_2, 0, Math.SQRT1_2), sd > 0 ? -0.4 : 0.4);
    }
  } else if (kind === 'sprout') {
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.18, 12), mat('#6CC27A', 0.38, true))).position.set(0, hy + 0.41, 0);
    for (const sd of [-1, 1]) {
      const [x, , z] = face(0, sd * 0.12, 0);
      const l = blob(x, hy + 0.53, z, 0.13, 0.05, 0.08, accent, 0.35);
      l.rotation.y = Math.PI / 4;
      l.rotation.z = sd * 0.35;
    }
  } else if (kind === 'antenna') {
    for (const sd of [-0.13, 0.13]) {
      const [x, , z] = face(-0.03, sd, 0);
      const [x2, , z2] = face(-0.03, sd * 1.6, 0);
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.25, 12), mat(accent, 0.38, true))).position.set((x + x2) / 2, hy + 0.43, (z + z2) / 2);
      blob(x2, hy + 0.58, z2, 0.07, 0.07, 0.07, accent, 0.3);
    }
  } else {
    for (const sd of [-0.27, 0.27]) {
      const [x, , z] = face(-0.03, sd, 0);
      blob(x, hy + 0.3, z, 0.13, 0.13, 0.08, base, 0.32).rotation.y = Math.PI / 4;
      const [x2, , z2] = face(0.02, sd, 0);
      blob(x2, hy + 0.3, z2, 0.075, 0.075, 0.04, accent, 0.4).rotation.y = Math.PI / 4;
    }
    const scarf = add(new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.06, 16, 40), mat(accent, 0.45, true)));
    scarf.rotation.x = Math.PI / 2;
    scarf.position.set(0, 0.45, 0);
  }

  // 파트 옷차림: 개발 헤드셋+마이크 / 디자인 베레모+붓 / 기획 안경+클립보드
  const FWD = new THREE.Vector3(Math.SQRT1_2, 0, Math.SQRT1_2), SIDE = new THREE.Vector3(Math.SQRT1_2, 0, -Math.SQRT1_2);
  const G = (c: string, r = 0.38) => mat(c, r, true);
  if (part === 'dev') {
    const band = add(new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.04, 16, 48, Math.PI), G('#5E6688', 0.35)));
    band.rotation.y = Math.PI / 4; band.position.set(0, hy + 0.02, 0); band.scale.set(1, 0.95, 1);
    for (const sd of [-1, 1]) {
      const cup = add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.1, 32), G('#5E6688', 0.35)));
      cup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), SIDE);
      const p = SIDE.clone().multiplyScalar(sd * 0.43); cup.position.set(p.x, hy, p.z);
      const cushion = add(new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.03, 32), G('#9FE0CC', 0.35)));
      cushion.quaternion.copy(cup.quaternion);
      const p2 = SIDE.clone().multiplyScalar(sd * 0.49); cushion.position.set(p2.x, hy, p2.z);
    }
    const start = SIDE.clone().multiplyScalar(-0.45).add(new THREE.Vector3(0, hy - 0.05, 0));
    const end = FWD.clone().multiplyScalar(0.36).add(SIDE.clone().multiplyScalar(-0.16)).add(new THREE.Vector3(0, hy - 0.16, 0));
    const dir = end.clone().sub(start);
    const boom = add(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, dir.length(), 10), G('#5E6688')));
    boom.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    boom.position.copy(start.clone().add(end).multiplyScalar(0.5));
    blob(end.x, end.y, end.z, 0.045, 0.045, 0.045, '#5E6688', 0.3);
  } else if (part === 'design') {
    blob(-0.04, hy + 0.33, -0.04, 0.33, 0.1, 0.33, '#E8788F', 0.45).rotation.set(-0.15, 0, 0.18);
    blob(-0.04, hy + 0.44, -0.04, 0.04, 0.05, 0.04, '#E8788F', 0.45);
    const g = new THREE.Group();
    g.position.copy(FWD.clone().multiplyScalar(0.08).add(SIDE.clone().multiplyScalar(0.25)).add(new THREE.Vector3(0, 0.28, 0)));
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.016, 0.42, 12), G('#E2B583')); handle.position.y = 0.12;
    const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.024, 0.06, 12), G('#C9CDD8', 0.2)); ferrule.position.y = 0.35;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 16), G('#6FA8F2')); tip.position.y = 0.43;
    g.add(handle, ferrule, tip);
    g.quaternion.setFromAxisAngle(FWD, -0.5);
    add(g);
    const d = FWD.clone().multiplyScalar(0.235).add(new THREE.Vector3(0, 0.33, 0)).add(SIDE.clone().multiplyScalar(-0.03));
    blob(d.x, d.y, d.z, 0.025, 0.025, 0.025, '#FBD77A', 0.3);
  } else if (part === 'plan') {
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), FWD);
    for (const sd of [-0.14, 0.14]) {
      const ring = add(new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.016, 12, 32), G('#5E6688', 0.3)));
      ring.quaternion.copy(q);
      const p = FWD.clone().multiplyScalar(0.41).add(SIDE.clone().multiplyScalar(sd)); ring.position.set(p.x, hy - 0.005, p.z);
    }
    const br = add(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.11, 8), G('#5E6688')));
    br.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), SIDE);
    const bp = FWD.clone().multiplyScalar(0.43); br.position.set(bp.x, hy + 0.02, bp.z);
    const g = new THREE.Group();
    const bd = new THREE.Mesh(new RoundedBoxGeometry(0.3, 0.38, 0.03, 4, 0.012), G('#E2B583', 0.45));
    const paper = new THREE.Mesh(new RoundedBoxGeometry(0.25, 0.3, 0.01, 2, 0.004), mat('#FFFFFF', 0.6)); paper.position.set(0, -0.02, 0.02);
    const clip = new THREE.Mesh(new RoundedBoxGeometry(0.12, 0.05, 0.04, 3, 0.012), G('#A9B8F5', 0.3)); clip.position.set(0, 0.18, 0.02);
    g.add(bd, paper, clip);
    for (const [y, col] of [[0.08, '#A9B8F5'], [0.02, '#F7A99A'], [-0.04, '#A9B8F5'], [-0.1, '#9FE0CC']] as const) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.018, 0.005), mat(col, 0.6)); l.position.set(-0.02, y, 0.027); g.add(l);
    }
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), FWD);
    const p = FWD.clone().multiplyScalar(0.26).add(SIDE.clone().multiplyScalar(-0.06)); g.position.set(p.x, 0.36, p.z);
    g.rotateX(-0.2);
    add(g);
  }
  root.userData = { legs, arms };
  return root;
}

/** 캐릭터를 아직 안 고른 조원: github_login 해시로 임시 캐릭터 (바뀌지 않게) */
export function characterOf(login: string, chosen: string | null): CharacterId {
  if (chosen && chosen in CHARACTERS) return chosen as CharacterId;
  let h = 0;
  for (const c of login) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return CHARACTER_IDS[h % CHARACTER_IDS.length];
}

const SPEED = 2.2; // 월드 단위/초
// drei Html의 pointerEvents prop은 transform 모드에서만 적용돼서 style로 끈다 (이름표 상자가 캐릭터 클릭을 가로챘다)
export const NO_POINTER = { pointerEvents: 'none' } as const;
const K = Math.SQRT1_2; // 모델 앞쪽 = 로컬 (K, 0, K)
export const HEAD_Y = 1.45; // 이름표 기준점 (발에서 위로)

type Area = 'work' | 'wait' | 'front' | 'aisle';
const areaOf = (x: number, z: number): Area => (z < -1 ? (x < 2 ? 'work' : 'wait') : z > 1.2 ? 'front' : 'aisle');
/** 다른 구역으로 갈 때 파티션을 피해 통로를 거치는 경유지 (바닥 y=0) */
function route(fx: number, fz: number, tx: number, tz: number): THREE.Vector3[] {
  const from = areaOf(fx, fz), to = areaOf(tx, tz);
  if (from === to && from !== 'front') return [new THREE.Vector3(tx, 0, tz)];
  // 앞쪽 3구역은 x=±3 파티션으로 나뉘므로 같은 구역(같은 칸)일 때만 바로 간다
  const cell = (x: number) => (x < -3 ? 0 : x < 3 ? 1 : 2);
  if (from === 'front' && to === 'front' && cell(fx) === cell(tx)) return [new THREE.Vector3(tx, 0, tz)];
  const out = (a: Area, x: number): [number, number][] =>
    a === 'work' ? [DOORWAYS.work, [DOORWAYS.work[0], DOORWAYS.aisleZ]]
      : a === 'wait' ? [DOORWAYS.wait, [DOORWAYS.wait[0], DOORWAYS.aisleZ]]
        : a === 'front' ? [[x, DOORWAYS.aisleZ]] : [];
  const pts = [...out(from, fx), ...out(to, tx).reverse(), [tx, tz] as [number, number]];
  return pts.map(([x, z]) => new THREE.Vector3(x, 0, z));
}

/** 각도 a에서 b로 t만큼 돈다 (짧은 쪽으로) */
const turn = (a: number, b: number, t: number) => a + ((((b - a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - Math.PI) * t;

export type LabelPlacement = { dx: number; dy: number; below: boolean; collapsed: boolean };

type Props = {
  memberId: string;
  character: CharacterId;
  part: Part | null;      // 옷차림
  x: number; y: number; z: number; // 자리 (y = 좌석 높이)
  wander: Vec3[];         // 구역 안에서 잠깐 걸어갈 지점 (미연결이면 빈 배열)
  offline: boolean;
  issue: boolean;
  selected: boolean;
  onSelect: () => void;
  portal: RefObject<HTMLDivElement>;
  placement: LabelPlacement;
  label: ReactNode;       // 말풍선·이름표·게이지 (Room이 만든다). 미연결이면 null
  registerLabel: (id: string, el: HTMLDivElement | null) => void;
};

export function Avatar({ memberId, character, part, x, y, z, wander, offline, issue, selected, onSelect, portal, placement, label, registerLabel }: Props) {
  const { base, accent } = CHARACTERS[character];
  const kind = CHARACTER_KIND[character];
  const char = useMemo(() => buildChar(kind, base, accent, part, offline), [kind, base, accent, part, offline]);
  useEffect(() => () => {
    char.traverse((o) => {
      if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); }
    });
  }, [char]);

  const group = useRef<THREE.Group>(null!);
  const body = useRef<THREE.Group>(null!); // 방향 전환·들썩임용
  const path = useRef<THREE.Vector3[]>([]); // 바닥(y=0) 위 경유지
  const placed = useRef(false);
  // out: 자리를 떠나 배회 지점에 있음, next: 다음 행동 시각(-1 = 아직 안 정함), phase: 걸음 주기
  const anim = useRef({ out: false, next: -1, phase: 0, heading: 0 });

  // 자리가 바뀌면 걸어서 이동한다. 다른 구역이면 출입구·통로를 거친다
  useEffect(() => {
    const p = group.current.position;
    if (!placed.current) { p.set(x, y, z); placed.current = true; return; }
    path.current = route(p.x, p.z, x, z);
    anim.current.out = false;
    anim.current.next = -1;
  }, [x, y, z]);

  useFrame(({ clock }, dt) => {
    const p = group.current.position, a = anim.current, now = clock.elapsedTime;

    // 배회: 자리에서 6~16초 쉬다 근처 빈 바닥으로 가서 3~6초 서 있다가 돌아온다
    if (!path.current.length && wander.length) {
      if (a.next < 0) a.next = now + (a.out ? 3 + Math.random() * 3 : 6 + Math.random() * 10);
      else if (now >= a.next) {
        a.next = -1;
        if (a.out) { path.current = [new THREE.Vector3(x, 0, z)]; a.out = false; }
        else {
          const near = wander.filter((w) => Math.hypot(w[0] - x, w[2] - z) < WANDER_RANGE);
          if (near.length) {
            const w = near[Math.floor(Math.random() * near.length)];
            path.current = [new THREE.Vector3(w[0], 0, w[2])];
            a.out = true;
          }
        }
      }
    }

    // 이동 (수평) + 진행 방향 바라보기
    let moving = false;
    const next = path.current[0];
    if (next) {
      const dx = next.x - p.x, dz = next.z - p.z, d = Math.hypot(dx, dz), step = SPEED * dt;
      if (d <= step) { p.x = next.x; p.z = next.z; path.current.shift(); }
      else { p.x += (dx / d) * step; p.z += (dz / d) * step; moving = true; a.heading = Math.atan2(dx, dz) - Math.PI / 4; }
    }
    if (!moving) a.heading = 0; // 서 있을 때는 카메라를 본다

    // 높이: 걷는 동안 바닥, 자리에 도착하면 좌석으로 올라앉는다
    const atSeat = !path.current.length && Math.hypot(p.x - x, p.z - z) < 0.01;
    const ty = atSeat ? y : 0;
    p.y += Math.sign(ty - p.y) * Math.min(Math.abs(ty - p.y), 4 * dt);

    // 걷기 동작: 다리·팔 번갈아 흔들기 + 몸 들썩임
    const b0 = body.current;
    b0.rotation.y = turn(b0.rotation.y, a.heading, 1 - Math.exp(-12 * dt));
    a.phase = moving ? a.phase + dt * 11 : 0;
    const s = Math.sin(a.phase);
    b0.position.y = moving ? Math.abs(s) * 0.05 : 0;
    const { legs, arms } = b0.children[0].userData as { legs: THREE.Mesh[]; arms: THREE.Mesh[] };
    legs.forEach((m, i) => {
      const b = m.userData.base as THREE.Vector3, k = i ? -s : s;
      m.position.set(b.x + k * 0.07 * K, b.y + Math.max(0, k) * 0.05, b.z + k * 0.07 * K);
    });
    arms.forEach((m, i) => {
      const b = m.userData.base as THREE.Vector3, k = (i ? s : -s) * 0.06;
      m.position.set(b.x + k * K, b.y, b.z + k * K);
    });
  });

  const { dx, dy, below } = placement;
  const lead = Math.hypot(dx, dy) >= 16; // 원래 자리에서 16px 이상 옮겨지면 연결선
  return (
    <group
      ref={group}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => { document.body.style.cursor = ''; }}
    >
      {/* 발밑 링: 선택 시 파랑 */}
      {selected && (
        <mesh rotation-x={-Math.PI / 2} position-y={0.03}>
          <ringGeometry args={[0.36, 0.5, 40]} />
          <meshBasicMaterial color="#4C7DE8" transparent opacity={0.7} depthWrite={false} />
        </mesh>
      )}
      <group ref={body}>
        <primitive object={char} />
      </group>
      {issue && (
        <Html position={[0, 1.25, 0]} portal={portal} zIndexRange={[60, 50]} style={NO_POINTER}>
          <b className="issue-badge head" aria-label="열린 이슈">!</b>
        </Html>
      )}
      {/* 이름표 블록: 기준점(머리 위 또는 발밑)에서 배치 결과만큼 옮긴다. 미연결은 Room의 묶음 라벨로 표시 */}
      {label && (
        <Html position={[0, below ? 0 : HEAD_Y, 0]} portal={portal} zIndexRange={selected ? [140, 130] : [100, 20]} style={NO_POINTER}>
          {lead && (
            <svg className="leader" aria-hidden width="1" height="1">
              <line x1={0} y1={0} x2={dx} y2={dy} />
            </svg>
          )}
          <div
            ref={(el) => registerLabel(memberId, el)}
            className={`label-block${below ? ' below' : ''}${placement.collapsed ? ' collapsed' : ''}${selected ? ' selected' : ''}`}
            style={{ transform: `translate(calc(-50% + ${dx}px), calc(${below ? '0%' : '-100%'} + ${dy}px))` }}
          >
            {label}
          </div>
        </Html>
      )}
    </group>
  );
}
