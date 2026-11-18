'use client';

// F12: HP(7일)·MP(5시간) 게이지. DB에는 쓴 양을 저장하고, 게이지는 남은 양(100 − 사용률)으로 그린다 (2026-11-17 확정).
// 마우스를 올리거나 포커스하면 "100% 중 몇 % 남음"을 풀어서 보여준다.

export type UsageRow = {
  member_id: string; hp_pct: number; mp_pct: number;
  hp_resets_at: string | null; mp_resets_at: string | null; source: string; updated_at: string;
};

const LOW = 20; // 남은 양이 이 % 이하면 깜빡인다

const GAUGE = {
  hp: { label: 'HP', title: '주간(7일) 한도' },
  mp: { label: 'MP', title: '5시간 한도' },
} as const;

/** 1시간 미만은 분, 하루 미만은 시간·분, 그 이상은 일·시간 */
function span(ms: number) {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return `${m}분`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간${m % 60 ? ` ${m % 60}분` : ''}`;
  return `${Math.floor(h / 24)}일${h % 24 ? ` ${h % 24}시간` : ''}`;
}

/** 리셋 시각이 지났으면 그 사이 한도가 다시 찼으므로 100% 남은 것으로 본다 */
export function remaining(usedPct: number, resetsAt: string | null, now: number) {
  const reset = resetsAt !== null && Date.parse(resetsAt) <= now;
  return { left: reset ? 100 : Math.round(100 - usedPct), reset };
}

function GaugeBar({ kind, used, resetsAt, now, reportedAgo }: {
  kind: 'hp' | 'mp'; used: number; resetsAt: string | null; now: number; reportedAgo: string;
}) {
  const { label, title } = GAUGE[kind];
  const { left, reset } = remaining(used, resetsAt, now);
  const until = resetsAt && !reset ? span(Date.parse(resetsAt) - now) : null;
  return (
    <span
      className={`mg ${kind}${left <= LOW ? ' low' : ''}`}
      role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={left}
      aria-label={`${label} ${left}% 남음`} tabIndex={0}
    >
      <b>{label}</b>
      <span className="bar"><span style={{ width: `${left}%` }} /></span>
      <small>{until ?? `${left}%`}</small>
      <span className="tip" role="tooltip">
        <strong>{label} · {title}</strong>
        <span className="big">{left}% <small>/ 100% 남음</small></span>
        <span>{reset ? '리셋 시각이 지나 가득 찬 것으로 표시' : `${Math.round(used)}% 사용`}</span>
        {until && <span>리셋까지 {until}</span>}
        <span className="dim">{reportedAgo}</span>
      </span>
    </span>
  );
}

/** 이력 패널: HP·MP 한 줄 2칸 (시안 v3 design-guide 3.13 — 라벨, %, 바, 리셋까지) */
export function PanelGauges({ usage, now }: { usage: UsageRow | null; now: number }) {
  return (
    <section aria-label="사용량" className="usage-2">
      {(['hp', 'mp'] as const).map((kind) => {
        const used = usage ? usage[`${kind}_pct`] : null;
        const resetsAt = usage ? usage[`${kind}_resets_at`] : null;
        const r = used === null ? null : remaining(used, resetsAt, now);
        const until = r && resetsAt && !r.reset ? span(Date.parse(resetsAt) - now) : null;
        return (
          <div key={kind} className="stack" style={{ gap: 4 }}>
            <span className="usage-head">
              <strong style={{ color: `var(--${kind}-ink)` }}>{GAUGE[kind].label} <span className="usage-sub">{kind === 'hp' ? '주간' : '5시간'}</span></strong>
              <strong>{r ? `${r.left}%` : '-'}</strong>
            </span>
            <div className={`gauge gauge-${kind}`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={r?.left ?? 0} aria-label={`${GAUGE[kind].label} ${r ? `${r.left}% 남음` : '보고 없음'}`}>
              <span className={r && r.left <= LOW ? 'blink' : undefined} style={{ width: `${r?.left ?? 0}%` }} />
            </div>
            <span className="t-cap" style={{ fontSize: 11 }}>{r ? (until ? `리셋까지 ${until}` : r.reset ? '리셋됨' : '리셋 시각 없음') : '아직 보고 없음'}</span>
          </div>
        );
      })}
    </section>
  );
}

export function Gauges({ usage, now }: { usage: UsageRow; now: number }) {
  const reportedAgo = `${usage.source === 'auto' ? '자동 수집' : '자기 보고'} · ${span(now - Date.parse(usage.updated_at))} 전`;
  return (
    <span className="mgs">
      <GaugeBar kind="hp" used={usage.hp_pct} resetsAt={usage.hp_resets_at} now={now} reportedAgo={reportedAgo} />
      <GaugeBar kind="mp" used={usage.mp_pct} resetsAt={usage.mp_resets_at} now={now} reportedAgo={reportedAgo} />
    </span>
  );
}
