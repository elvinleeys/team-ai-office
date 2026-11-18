'use client';

// 시안 v2 team-office-3d-v2/source/scene-reference.js 의 buildRoom3()를 옮긴 것 (18×14, 5구역 + 통로). 형태·색은 시안 그대로 둔다.
// 구역 바닥·파티션·자리 좌표는 constants/office.ts(ZONES·PARTITIONS·ZONE_SLOTS·WORK_SLOTS)에서 읽는다.
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { PALETTE as P, PARTITIONS, ROOM, ZONES } from '@/constants/office';

const CHAR = '#7A7FA8';

function build(): THREE.Group {
  const root = new THREE.Group();
  const mats = new Map<string, THREE.Material>();
  const mat = (color: string, rough = 0.72, extra: THREE.MeshPhysicalMaterialParameters = {}) => {
    const k = color + rough + JSON.stringify(extra);
    if (!mats.has(k)) mats.set(k, new THREE.MeshPhysicalMaterial({ color, roughness: Math.min(rough, 0.6), metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.35, ...extra }));
    return mats.get(k)!;
  };
  const GL = (c: string, r = 0.38) => mat(c, r, { clearcoat: 0.8, clearcoatRoughness: 0.25 });
  const add = <T extends THREE.Object3D>(o: T) => {
    o.traverse((m) => { m.castShadow = true; m.receiveShadow = true; });
    root.add(o);
    return o;
  };
  const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color: string, r = 0.08, m?: THREE.Material) => {
    const w = x1 - x0, h = y1 - y0, d = z1 - z0;
    const rr = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
    const g = rr > 0.002 ? new RoundedBoxGeometry(w, h, d, 5, rr) : new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(g, m ?? mat(color));
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return add(mesh);
  };
  const cyl = (cx: number, cz: number, r: number, y0: number, y1: number, color: string, rTop?: number, seg = 40, m?: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop ?? r, r, y1 - y0, seg), m ?? mat(color));
    mesh.position.set(cx, (y0 + y1) / 2, cz);
    return add(mesh);
  };
  const blob = (x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string, rough = 0.85) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), mat(color, rough));
    mesh.scale.set(sx, sy, sz);
    mesh.position.set(x, y, z);
    return add(mesh);
  };
  const rand = (seed: number) => { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; };
  const mix = (c: string) => '#' + new THREE.Color(c).lerp(new THREE.Color('#ffffff'), 0.25).getHexString();
  const pot = (x: number, z: number, s: number, potC: string) => {
    cyl(x, z, 0.26 * s, 0, 0.5 * s, potC, 0.33 * s, 40, GL(potC));
    cyl(x, z, 0.34 * s, 0.46 * s, 0.58 * s, potC, 0.34 * s, 40, GL(mix(potC)));
    cyl(x, z, 0.3 * s, 0.58 * s, 0.59 * s, '#8A6047');
  };
  const roundPlant = (x: number, z: number, s: number, potC: string) => {
    pot(x, z, s, potC);
    blob(x, 0.95 * s, z, 0.42 * s, 0.42 * s, 0.42 * s, '#93D69A', 0.4);
    blob(x + 0.18 * s, 1.25 * s, z - 0.1 * s, 0.28 * s, 0.28 * s, 0.28 * s, '#A9E2AD', 0.4);
    blob(x - 0.2 * s, 1.18 * s, z + 0.12 * s, 0.25 * s, 0.25 * s, 0.25 * s, '#84CC8C', 0.4);
  };
  const conePlant = (x: number, z: number, s: number, potC: string) => {
    pot(x, z, s, potC);
    for (const [y, r] of [[0.75, 0.42], [1.05, 0.34], [1.32, 0.25]]) cyl(x, z, r * s, y * s - 0.22 * s, y * s + 0.12 * s, '#7FCB91', 0.02, 32, GL('#7FCB91', 0.45));
  };
  const pad = (x: readonly number[], z: readonly number[], c: string) => box(x[0], x[1], 0, 0.03, z[0], z[1], '', 0.015, mat(c, 0.7));
  const partition = (x0: number, x1: number, z0: number, z1: number, h = 1.05) => {
    box(x0, x1, 0, h, z0, z1, P.cream, 0.08, GL(P.cream, 0.5));
    const alongX = x1 - x0 > z1 - z0;
    const ends = alongX ? [[x0, (z0 + z1) / 2], [x1, (z0 + z1) / 2]] : [[(x0 + x1) / 2, z0], [(x0 + x1) / 2, z1]];
    for (const [x, z] of ends) { cyl(x, z, 0.13, 0, h + 0.05, P.peach, 0.13, 32, GL(P.peach)); blob(x, h + 0.08, z, 0.15, 0.1, 0.15, P.peach, 0.35); }
  };

  const EX = ROOM.halfX, EZ = ROOM.halfZ, H = ROOM.wallHeight;
  box(-EX - 0.4, EX + 0.1, -0.75, -0.2, -EZ - 0.4, EZ + 0.1, P.slab, 0.3, GL(P.slab));
  box(-EX - 0.35, EX + 0.05, -0.24, -0.07, -EZ - 0.35, EZ + 0.05, P.slabLayer, 0.1, GL(P.slabLayer));
  box(-EX - 0.3, EX, -0.09, 0, -EZ - 0.3, EZ, P.floor, 0.03, mat(P.floor, 0.8));
  box(-EX - 0.3, -EX, -0.05, H, -EZ - 0.3, EZ, P.wallLeft, 0.06, mat(P.wallLeft, 0.85));
  box(-EX - 0.3, EX, -0.05, H, -EZ - 0.3, -EZ, P.wallBack, 0.06, mat(P.wallBack, 0.85));
  box(-EX - 0.3, -EX + 0.02, H - 0.04, H + 0.06, -EZ - 0.3, EZ, P.cream, 0.05);
  box(-EX - 0.3, EX, H - 0.04, H + 0.06, -EZ - 0.3, -EZ + 0.02, P.cream, 0.05);
  box(-EX, EX, 0, 0.18, -EZ, -EZ + 0.06, '#F3D9C9', 0.03);
  box(-EX, -EX + 0.06, 0, 0.18, -EZ, EZ, '#F2C6C2', 0.03);

  // 구역 바닥 (통로는 바닥색 그대로 + 가운데 점선)
  for (const [k, zn] of Object.entries(ZONES)) if (k !== 'aisle') pad(zn.x, zn.z, zn.tint);
  for (let x = -8.4; x < 8.6; x += 0.9) box(x, x + 0.45, 0, 0.035, -0.06, 0.06, '', 0.01, mat('#EBD9D2', 0.7));
  for (const { from, to } of PARTITIONS) {
    const t = 0.08;
    if (from[1] === to[1]) partition(from[0], to[0], from[1] - t, from[1] + t);
    else partition(from[0] - t, from[0] + t, from[1], to[1]);
  }

  // ---------- 작업: 이슈 보드(왼쪽 벽)
  box(-EX, -EX + 0.09, 1.15, 3.05, -5.9, -1.9, P.lilac, 0.08, GL(P.lilac));
  box(-EX + 0.06, -EX + 0.11, 1.27, 2.93, -5.78, -2.02, '#FFFDF8', 0.03);
  const rr = rand(11);
  for (const [z, y, c] of [[-5.4, 2.3, P.peach], [-4.5, 2.35, P.butter], [-3.6, 2.25, P.periwinkle], [-2.7, 2.3, P.mint], [-5.0, 1.5, P.butter], [-4.0, 1.55, '#F8BFD3'], [-3.0, 1.5, P.periwinkle]] as const) {
    const m = box(-EX + 0.11, -EX + 0.14, y, y + 0.5, z, z + 0.6, c, 0.02); m.rotation.x = (rr() - 0.5) * 0.16;
    blob(-EX + 0.16, y + 0.42, z + 0.3, 0.045, 0.045, 0.045, '#F06C6C', 0.3);
  }
  const SX = [-7.6, -6.15, -4.7];
  const chair = (c: number, cz: number) => {
    cyl(c, cz, 0.28, 0, 0.06, '#E8E3F5', 0.28, 32, GL('#E8E3F5'));
    cyl(c, cz, 0.05, 0.06, 0.38, '#E8E3F5');
    box(c - 0.32, c + 0.32, 0.36, 0.5, cz - 0.3, cz + 0.3, P.mint, 0.1, GL(P.mint));
    box(c - 0.3, c + 0.3, 0.5, 1.05, cz + 0.22, cz + 0.36, P.mint, 0.1, GL(P.mint));
  };
  const deskBase = (dz0: number, dz1: number) => {
    box(-8.4, -3.9, 0.7, 0.84, dz0, dz1, P.wood, 0.07, GL(P.wood, 0.45));
    for (const xl of [-8.25, -4.05]) box(xl - 0.1, xl + 0.1, 0, 0.72, dz0 + 0.08, dz1 - 0.08, P.woodDark, 0.07, GL(P.woodDark, 0.45));
  };
  // 개발: 모니터 책상 (뒤 벽)
  deskBase(-6.9, -6.0);
  for (const c of SX) {
    const dz0 = -6.9;
    cyl(c, dz0 + 0.25, 0.2, 0.84, 0.88, '#E8E3F5');
    box(c - 0.06, c + 0.06, 0.84, 1.05, dz0 + 0.19, dz0 + 0.31, '#E8E3F5', 0.04);
    box(c - 0.48, c + 0.48, 1.0, 1.6, dz0 + 0.18, dz0 + 0.34, P.periwinkle, 0.09, GL(P.periwinkle));
    box(c - 0.42, c + 0.42, 1.05, 1.55, dz0 + 0.33, dz0 + 0.36, '#55639E', 0.02, mat('#55639E', 0.25, { emissive: '#3a4688', emissiveIntensity: 0.35 }));
    for (const [y, w, col] of [[1.42, 0.3, P.butter], [1.33, 0.46, P.mint], [1.24, 0.36, P.peach], [1.15, 0.24, P.mint]] as const) {
      box(c - 0.34, c - 0.34 + w, y, y + 0.045, dz0 + 0.36, dz0 + 0.37, col, 0.004, mat(col, 0.5, { emissive: col, emissiveIntensity: 0.4 }));
    }
    box(c - 0.34, c + 0.34, 0.84, 0.88, dz0 + 0.5, dz0 + 0.72, '#FFFFFF', 0.03, GL('#FFFFFF'));
    chair(c, -5.25);
  }
  // 디자인: 드로잉 책상 (기울인 판·태블릿·펜·물감 컵)
  deskBase(-3.95, -3.05);
  for (const c of SX) {
    const g = new THREE.Group();
    const board = new THREE.Mesh(new RoundedBoxGeometry(0.95, 0.05, 0.68, 4, 0.02), GL('#FFF9F3', 0.45));
    const tab = new THREE.Mesh(new RoundedBoxGeometry(0.66, 0.03, 0.46, 4, 0.03), mat('#4E5A8C', 0.25, { emissive: '#3a4688', emissiveIntensity: 0.25 }));
    tab.position.set(0, 0.035, 0);
    const scr = new THREE.Mesh(new THREE.CircleGeometry(0.12, 32), mat(P.peach, 0.5, { emissive: P.peach, emissiveIntensity: 0.4 }));
    scr.rotation.x = -Math.PI / 2; scr.position.set(-0.08, 0.052, 0.02);
    const scr2 = new THREE.Mesh(new THREE.CircleGeometry(0.08, 32), mat(P.mint, 0.5, { emissive: P.mint, emissiveIntensity: 0.4 }));
    scr2.rotation.x = -Math.PI / 2; scr2.position.set(0.1, 0.052, -0.06);
    const pen = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.012, 0.42, 12), GL('#FFFFFF'));
    pen.rotation.z = Math.PI / 2; pen.rotation.y = 0.5; pen.position.set(0.18, 0.07, 0.18);
    g.add(board, tab, scr, scr2, pen);
    g.position.set(c, 1.02, -3.45); g.rotation.x = 0.45;
    add(g);
    box(c - 0.06, c + 0.06, 0.84, 1.0, -3.85, -3.7, P.woodDark, 0.03);
    [P.peach, P.butter].forEach((col, i) => cyl(c + 0.38 + i * 0.12, -3.2, 0.05, 0.84, 0.95, col, 0.055, 20, GL(col)));
    chair(c, -2.3);
  }
  cyl(-4.2, -3.8, 0.1, 0.84, 0.88, CHAR);
  cyl(-4.2, -3.8, 0.025, 0.88, 1.6, CHAR, 0.025, 12);
  blob(-4.2, 1.65, -3.6, 0.2, 0.15, 0.2, P.butter, 0.35);
  // 기획: 화이트보드(뒤 벽) + 이젤
  box(-2.85, 1.25, 0.85, 2.95, -EZ, -EZ + 0.1, P.cream, 0.08, GL(P.cream));
  box(-2.72, 1.12, 0.98, 2.82, -EZ + 0.06, -EZ + 0.12, '#FFFFFF', 0.02, GL('#FFFFFF', 0.25));
  for (const [x, y, w, col] of [[-2.5, 2.45, 1.2, P.periwinkle], [-2.5, 2.2, 0.8, P.peach], [-2.5, 1.95, 1.0, P.periwinkle], [-0.6, 2.45, 0.9, P.mint], [-0.6, 2.2, 0.6, P.mint]] as const) {
    box(x, x + w, y, y + 0.05, -EZ + 0.12, -EZ + 0.13, col, 0.004, mat(col, 0.5));
  }
  for (const [x, y, col] of [[-2.4, 1.25, P.butter], [-1.85, 1.3, '#F8BFD3'], [-1.3, 1.22, P.mint], [0.3, 1.9, P.butter], [0.75, 1.95, P.peach], [0.4, 1.3, P.periwinkle]] as const) {
    box(x, x + 0.4, y, y + 0.4, -EZ + 0.12, -EZ + 0.15, col, 0.015);
  }
  box(-2.7, 1.1, 0.9, 0.96, -EZ + 0.1, -EZ + 0.28, P.woodDark, 0.025);
  for (const [x, col] of [[-2.3, CHAR], [-2.05, '#F06C6C'], [-1.8, '#6CC27A']] as const) box(x, x + 0.2, 0.96, 1.0, -EZ + 0.15, -EZ + 0.22, col, 0.015);
  for (const dx of [-0.25, 0.25]) cyl(-0.6 + dx, -4.3, 0.03, 0, 1.6, P.woodDark, 0.03, 12).rotation.x = -0.12;
  box(-1.0, -0.2, 0.9, 1.75, -4.42, -4.36, '#FFFFFF', 0.02, GL('#FFFFFF', 0.3)).rotation.x = -0.12;
  conePlant(1.5, -6.4, 0.9, P.periwinkle);
  for (const [x0, x1, y0, y1, c] of [[-8.3, -7.4, 2.2, 3.1, P.butter], [-7.0, -6.3, 2.4, 3.15, P.periwinkle]] as const) {
    box(x0, x1, y0, y1, -EZ, -EZ + 0.08, P.wood, 0.05, GL(P.wood));
    box(x0 + 0.09, x1 - 0.09, y0 + 0.09, y1 - 0.09, -EZ + 0.05, -EZ + 0.1, P.cream, 0.02);
    blob((x0 + x1) / 2, (y0 + y1) / 2, -EZ + 0.1, (x1 - x0) * 0.22, (y1 - y0) * 0.2, 0.03, c, 0.4);
  }
  const clock = add(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.12, 48), GL(P.peach)));
  clock.rotation.x = Math.PI / 2; clock.position.set(-4.9, 2.75, -EZ + 0.06);
  const clockFace = add(new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.03, 48), mat('#FFFDF8')));
  clockFace.rotation.x = Math.PI / 2; clockFace.position.set(-4.9, 2.75, -EZ + 0.13);
  box(-4.92, -4.88, 2.75, 2.98, -EZ + 0.14, -EZ + 0.16, CHAR, 0.01);
  box(-4.9, -4.72, 2.73, 2.77, -EZ + 0.14, -EZ + 0.16, CHAR, 0.01);

  // ---------- 대기석: 출입문 + 벤치 (뒤 벽 오른쪽)
  box(7.3, 8.8, 0, 2.85, -EZ, -EZ + 0.14, P.cream, 0.06, GL(P.cream));
  box(7.45, 8.65, 0.02, 2.7, -EZ + 0.1, -EZ + 0.18, P.peach, 0.06, GL(P.peach, 0.4));
  for (const [y0, y1] of [[0.25, 1.25], [1.45, 2.45]]) box(7.6, 8.5, y0, y1, -EZ + 0.17, -EZ + 0.2, '#F9BBAE', 0.05, GL('#F9BBAE', 0.4));
  blob(7.65, 1.35, -EZ + 0.24, 0.07, 0.07, 0.07, P.butter, 0.25);
  box(7.4, 8.7, 2.95, 3.3, -EZ, -EZ + 0.12, P.mint, 0.08, GL(P.mint));
  box(7.25, 8.85, 0, 0.04, -6.7, -5.7, '', 0.02, mat('#E9B9A8', 0.8));
  box(2.6, 6.95, 0.38, 0.54, -6.95, -6.05, P.wood, 0.1, GL(P.wood, 0.45));
  box(2.6, 6.95, 0.54, 1.2, -6.98, -6.78, P.wood, 0.1, GL(P.wood, 0.45));
  for (const x of [2.8, 4.75, 6.75]) box(x - 0.09, x + 0.09, 0, 0.4, -6.8, -6.2, P.woodDark, 0.05, GL(P.woodDark));
  for (const [x, c] of [[3.15, P.periwinkle], [4.2, P.butter], [5.25, '#F8BFD3'], [6.3, P.mint]] as const) box(x - 0.42, x + 0.42, 0.54, 0.62, -6.85, -6.12, c, 0.06, GL(c, 0.45));
  box(2.8, 6.6, 1.65, 3.15, -EZ, -EZ + 0.09, P.cream, 0.08, GL(P.cream));
  box(2.95, 6.45, 1.8, 3.0, -EZ + 0.05, -EZ + 0.11, '#CFE8FA', 0.02, mat('#CFE8FA', 0.15));
  box(4.65, 4.75, 1.8, 3.0, -EZ + 0.08, -EZ + 0.14, P.cream, 0.03);
  roundPlant(8.45, -2.0, 0.8, P.butter);
  cyl(2.6, -2.2, 0.22, 0, 0.05, P.woodDark, 0.22, 24, GL(P.woodDark));
  cyl(2.6, -2.2, 0.04, 0.05, 1.9, P.woodDark, 0.04, 12);
  blob(2.6, 1.95, -2.2, 0.08, 0.08, 0.08, P.woodDark, 0.4);
  blob(2.75, 1.55, -2.1, 0.16, 0.3, 0.12, P.periwinkle, 0.45);

  // ---------- 완료 정리: 책장 (왼쪽 벽 앞쪽)
  const W = P.wood, z0 = 1.6, z1 = 6.6, X0 = -EX, X1 = -8.35;
  box(X0, X1, 0, 0.12, z0, z1, W, 0.05, GL(W, 0.45));
  box(X0, X1, 2.38, 2.5, z0, z1, W, 0.05, GL(W, 0.45));
  for (const z of [z0, (z0 + z1) / 2 - 0.05, z1 - 0.1]) box(X0, X1, 0, 2.5, z, z + 0.1, W, 0.05, GL(W, 0.45));
  box(X0 + 0.02, X0 + 0.06, 0.12, 2.38, z0 + 0.1, z1 - 0.1, '#FFF1E2', 0.01);
  for (const y of [0.72, 1.32, 1.88]) box(X0, X1, y, y + 0.07, z0 + 0.1, z1 - 0.1, W, 0.03, GL(W, 0.45));
  let sd = 30;
  const books = (y: number, a: number, b: number, hm: number) => {
    const r = rand(sd++);
    const cols = [P.peach, P.butter, P.periwinkle, '#FFF9F3', P.mint, P.lilac, '#F8BFD3', '#9CD3F5'];
    let z = a;
    while (z < b - 0.12) {
      const w = 0.11 + r() * 0.12, h = hm * (0.72 + r() * 0.28);
      if (r() < 0.1) { z += 0.25; continue; }
      box(X0 + 0.06, X1 - 0.1 - r() * 0.05, y, y + h, z, Math.min(z + w, b), cols[Math.floor(r() * cols.length)], 0.03);
      z += w + 0.015;
    }
  };
  for (const y of [0.12, 0.79, 1.39, 1.95]) { books(y, z0 + 0.15, (z0 + z1) / 2 - 0.1, y > 1.9 ? 0.4 : 0.5); books(y, (z0 + z1) / 2 + 0.1, z1 - 0.15, y > 1.9 ? 0.4 : 0.5); }
  box(-EX, -EX + 0.08, 2.7, 3.35, 2.6, 5.6, P.cream, 0.08, GL(P.cream));
  for (const [z, c] of [[2.9, P.mint], [3.8, P.mint], [4.7, P.butter]] as const) blob(-EX + 0.1, 3.02, z + 0.35, 0.02, 0.17, 0.17, c, 0.35);
  blob(-4.3, 0.18, 6.0, 0.55, 0.2, 0.55, P.lilac, 0.5);
  blob(-4.25, 0.32, 5.95, 0.4, 0.12, 0.4, '#DECBFA', 0.5);
  conePlant(-3.7, 6.35, 0.8, P.butter);

  // ---------- 회의: 원형 테이블 + 스툴 6개
  const [mx, mz] = [0, 4.2];
  cyl(mx, mz, 0.55, 0, 0.09, P.woodDark, 0.55, 48, GL(P.woodDark));
  cyl(mx, mz, 0.17, 0.09, 0.72, P.woodDark, 0.2, 32, GL(P.woodDark));
  cyl(mx, mz, 1.35, 0.72, 0.86, P.wood, 1.35, 72, GL(P.wood, 0.4));
  for (const [dx, dz, col] of [[-0.5, -0.25, P.cream], [0.35, 0.45, P.peach], [0.55, -0.5, P.periwinkle], [-0.3, 0.6, P.cream]] as const) cyl(mx + dx, mz + dz, 0.1, 0.86, 1.03, col, 0.1, 24, GL(col));
  box(mx - 0.15, mx + 0.3, 0.86, 0.89, mz - 0.1, mz + 0.25, '#FFFFFF', 0.02).rotation.y = 0.3;
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 6 + (i * Math.PI) / 3;
    const x = mx + 2.05 * Math.cos(a), z = mz + 2.05 * Math.sin(a);
    cyl(x, z, 0.12, 0, 0.36, P.woodDark, 0.1, 24, GL(P.woodDark));
    cyl(x, z, 0.36, 0.34, 0.52, P.peach, 0.34, 40, GL(P.peach, 0.45));
    blob(x, 0.52, z, 0.33, 0.06, 0.33, '#F9BBAE', 0.45);
  }

  // ---------- 휴식: 소파(앞을 봄) + 커피 테이블 + 빈백
  box(3.9, 8.5, 0, 0.12, 1.35, 2.8, P.woodDark, 0.05);
  box(3.9, 8.5, 0.12, 0.45, 1.35, 2.8, '#7FD3B8', 0.14, GL('#7FD3B8', 0.5));
  for (const x of [4.9, 6.2, 7.5]) {
    box(x - 0.64, x + 0.64, 0.42, 0.66, 1.85, 2.78, P.mint, 0.16, GL(P.mint, 0.5));
    box(x - 0.62, x + 0.62, 0.5, 1.35, 1.35, 1.88, '#8ADBC2', 0.2, GL('#8ADBC2', 0.5));
  }
  box(3.65, 4.05, 0.2, 0.95, 1.3, 2.85, '#7FD3B8', 0.18, GL('#7FD3B8', 0.5));
  box(8.35, 8.75, 0.2, 0.95, 1.3, 2.85, '#7FD3B8', 0.18, GL('#7FD3B8', 0.5));
  for (const [x, c, rz] of [[4.4, P.peach, 0.2], [5.6, P.butter, -0.15], [8.0, P.lilac, 0.25]] as const) {
    const p = box(x - 0.28, x + 0.28, 0.62, 1.12, 1.85, 2.05, c, 0.12, GL(c, 0.45)); p.rotation.z = rz; p.rotation.x = 0.2;
  }
  box(4.6, 7.8, 0.36, 0.48, 3.4, 4.0, P.wood, 0.1, GL(P.wood, 0.45));
  for (const [x, z] of [[4.75, 3.55], [7.65, 3.55], [4.75, 3.85], [7.65, 3.85]]) cyl(x, z, 0.06, 0, 0.36, P.woodDark, 0.06, 16);
  cyl(5.3, 3.7, 0.09, 0.48, 0.64, P.cream, 0.09, 24, GL(P.cream));
  cyl(6.9, 3.65, 0.09, 0.48, 0.62, P.peach, 0.09, 24, GL(P.peach));
  blob(6.1, 0.56, 3.7, 0.22, 0.09, 0.22, P.butter, 0.35);
  for (const [x, c] of [[4.9, P.periwinkle], [6.2, '#F8BFD3'], [7.5, P.butter]] as const) {
    blob(x, 0.27, 5.2, 0.5, 0.3, 0.5, c, 0.5);
    blob(x - 0.05, 0.42, 5.1, 0.36, 0.14, 0.36, mix(c), 0.5);
  }
  cyl(8.55, 4.4, 0.22, 0, 0.06, CHAR, 0.22, 32, GL(CHAR));
  cyl(8.55, 4.4, 0.03, 0.06, 1.9, CHAR, 0.03, 12);
  blob(8.55, 2.0, 4.4, 0.36, 0.3, 0.36, '#FFF3C4', 0.3);
  roundPlant(8.4, 6.4, 1.1, P.butter);
  roundPlant(-8.45, -0.1, 0.75, P.mint);

  return root;
}

export function Furniture() {
  const group = useMemo(() => build(), []);
  useEffect(() => () => {
    group.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
  }, [group]);
  return <primitive object={group} />;
}
