// 작은 선 아이콘 (상태·파트·출처를 색만으로 구분하지 않기 위해 텍스트와 같이 쓴다)
const PATHS = {
  code: 'M5.5 4 2 8l3.5 4M10.5 4 14 8l-3.5 4',
  brush: 'M13 2.5 7.2 8.3M6.4 9c-1.6.2-2.4 1.3-2.4 2.6 0 .9-.6 1.6-1.5 1.9 2.6.9 5.6 0 5.6-2.6',
  clipboard: 'M5.5 3H4v11h8V3h-1.5M6 2h4v2.2H6zM6 7h4M6 9.5h4M6 12h2.5',
  link: 'M6.6 9.4a2.6 2.6 0 0 0 3.7 0l2.4-2.4a2.6 2.6 0 0 0-3.7-3.7l-.8.8M9.4 6.6a2.6 2.6 0 0 0-3.7 0L3.3 9a2.6 2.6 0 0 0 3.7 3.7l.8-.8',
  pencil: 'M11 2.5 13.5 5 6 12.5H3.5V10z',
  clock: 'M8 2.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zM8 5v3.2l2 1.3',
  pin: 'M6 2h4M7 2v4.5L4.5 9h7L9 6.5V2M8 9v5',
  bubble: 'M2.5 3.5h11v7H7l-3 2.5v-2.5H2.5z',
  check: 'M3 8.5 6.5 12 13 4.5',
  alert: 'M8 2 14.5 13.5h-13zM8 6.5v3M8 11.5v.5',
} as const;
export type IconName = keyof typeof PATHS;

export function Icon({ name, label, className }: { name: IconName; label?: string; className?: string }) {
  return (
    <svg className={`icon${className ? ` ${className}` : ''}`} viewBox="0 0 16 16" width="12" height="12"
      role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <path d={PATHS[name]} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
