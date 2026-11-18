// node collector.test.ts
import assert from 'node:assert/strict';
import { toUsage } from './collector.ts';

const r = (utilization: number | null, resets_at: string | null = null) => ({ utilization, resets_at });

assert.deepEqual(toUsage({ five_hour: r(2, '2026-11-17T16:09:59Z'), seven_day: r(4, '2026-11-23T09:59:59Z') }), {
  hp_pct: 4, mp_pct: 2, hp_resets_at: '2026-11-23T09:59:59Z', mp_resets_at: '2026-11-17T16:09:59Z', source: 'auto',
});
assert.deepEqual(toUsage({ five_hour: r(120), seven_day: r(-1) }), { hp_pct: 0, mp_pct: 100, source: 'auto' }); // 0~100으로 자름, 리셋 없음은 생략
assert.equal(toUsage({ five_hour: null, seven_day: r(4) }), null); // 엔터프라이즈 등 값 없음
assert.equal(toUsage({ five_hour: r(null), seven_day: r(4) }), null);
console.log('collector ok');
