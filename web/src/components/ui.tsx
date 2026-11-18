// 시안 v3 공용 조각: 24px 선 아이콘(design-guide 4장), 뒤로 가기, 서비스 로고(아이소메트릭 큐브). 스타일은 office-ui.css 클래스.
import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';

const P = {
  back: <path d="M19 12H5M11 18l-6-6 6-6" />,
  next: <path d="M9 6l6 6-6 6" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  check: <path d="M5 12l5 5L20 7" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.5h.01" /></>,
  alert: <><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></>,
  failed: <><circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 16.5h.01" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  link: <><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></>,
  lock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  terminal: <path d="M4 17l6-5-6-5M12 19h8" />,
  board: <><rect x="3" y="4" width="18" height="14" rx="2" /><path d="M8 21h8M7 9h4M7 13h7" /></>,
  spin: <path d="M21 12a9 9 0 1 1-6.2-8.6" />,
  wifiOff: <path d="M2 2l20 20M8.5 16.5a5 5 0 0 1 7 0M5 12.9a10 10 0 0 1 5.2-2.8M19 12.9a10 10 0 0 0-2-1.5M12 20h.01" />,
  code: <path d="M8 7l-5 5 5 5M16 7l5 5-5 5" />,
  brush: <><path d="M18 3l3 3-9.5 9.5-3-3z" /><path d="M8.5 12.5C6 12.5 4 14.5 4 17c0 1.5-1 2.5-2 3 4 1 8.5 0 8.5-4.5z" /></>,
  clipboard: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V2.5h6V4M9 10h6M9 14h6M9 18h3" /></>,
} as const;
export type I24Name = keyof typeof P;

/** 24px 박스 선 아이콘. 장식이면 aria-hidden, 뜻이 있으면 label */
export function I24({ name, size = 16, stroke = 2.4, label, className, style }: {
  name: I24Name; size?: number; stroke?: number; label?: string; className?: string; style?: CSSProperties;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
      className={className} style={style} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {P[name]}
    </svg>
  );
}

export function GitHubMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.56-.29-5.25-1.28-5.25-5.68 0-1.25.45-2.28 1.19-3.08-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.08 0 4.41-2.7 5.38-5.26 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5z" />
    </svg>
  );
}

/** 서비스 로고: 3면 아이소메트릭 큐브 (윗면 #F9C6BC, 왼면 #FDE6E0, 오른면 #EFA3A3). white면 방 목록 아이콘용 흰 큐브 */
export function Cube({ size = 24, white = false }: { size?: number; white?: boolean }) {
  const [t, l, r] = white ? ['#FFFFFF', '#FFFFFF', '#FFFFFF'] : ['#F9C6BC', '#FDE6E0', '#EFA3A3'];
  return (
    <svg width={size} height={size} viewBox="0 0 26 26" aria-hidden="true">
      <polygon points="13,3 23,8.5 13,14 3,8.5" fill={t} opacity={white ? 0.9 : 1} />
      <polygon points="3,8.5 13,14 13,24 3,18.5" fill={l} opacity={white ? 0.6 : 1} />
      <polygon points="23,8.5 13,14 13,24 23,18.5" fill={r} opacity={white ? 0.35 : 1} />
    </svg>
  );
}

export function Back({ href, children }: { href: string; children: ReactNode }) {
  return <Link className="back" href={href}><I24 name="back" stroke={2.6} />{children}</Link>;
}

/** 오류·안내 배너 (주소의 ?error= / ?notice=) */
export function Notice({ error, notice }: { error?: unknown; notice?: unknown }) {
  return (
    <>
      {typeof error === 'string' && <div className="banner banner-danger" role="alert"><I24 name="alert" stroke={2} /><span className="banner-text">{error}</span></div>}
      {typeof notice === 'string' && <div className="banner banner-ok" role="status"><I24 name="check" stroke={3} /><span className="banner-text">{notice}</span></div>}
    </>
  );
}
