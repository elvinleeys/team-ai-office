'use client';

// F11: 방의 열린 이슈 목록 팝오버 (시안 v3 Main.dc.html). 항목을 누르면 그 조원을 선택한다. 해결은 MCP resolve_issue로만 한다 (웹은 읽기 전용).
import { STATUS_LABEL } from '@/constants/office';
import { time } from './HistoryPanel';
import type { IssueRow, Seat } from './Room';
import { I24 } from './ui';

export function IssueBoard({ issues, seats, onPick, onClose }: {
  issues: IssueRow[];
  seats: Seat[];
  onPick: (memberId: string) => void;
  onClose: () => void;
}) {
  const seatOf = new Map(seats.map((s) => [s.member.id, s]));
  return (
    <div className="popover" role="dialog" aria-label="열린 이슈 목록">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong style={{ fontSize: 15 }}>열린 이슈 {issues.length}</strong>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="이슈 목록 닫기" style={{ margin: '-10px -10px -10px 0' }}><I24 name="close" size={18} stroke={2} /></button>
      </div>
      {issues.length === 0 ? (
        <p className="t-sub">열린 이슈가 없어요.</p>
      ) : (
        issues.map((i) => {
          const s = seatOf.get(i.member_id);
          return (
            <button key={i.id} type="button" className="issue-item" onClick={() => onPick(i.member_id)}>
              <span className="issue-dot">!</span>
              <span className="stack" style={{ gap: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>#{i.id} {i.title}</span>
                <span className="t-cap">{s ? `${s.member.name} · ${s.mpOut ? 'MP 회복 중' : STATUS_LABEL[s.presence]}` : '(방을 나간 조원)'} · {time(i.created_at)}</span>
              </span>
            </button>
          );
        })
      )}
      <p className="hint" style={{ margin: 0 }}>해결은 Claude에게 “이슈 #번호 해결”이라고 말하세요.</p>
    </div>
  );
}
