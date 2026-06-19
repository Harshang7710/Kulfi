import type { ReactNode } from 'react';

export type StatTone = 'brand' | 'gold' | 'success' | 'info' | 'danger';
export type StatIcon =
  | 'rupee'
  | 'pieces'
  | 'cash'
  | 'online'
  | 'profit'
  | 'fridge'
  | 'box'
  | 'alert'
  | 'cart'
  | 'receipt';

const ICONS: Record<StatIcon, ReactNode> = {
  rupee: <path d="M6 3h12M6 8h12M6 13h12M9 3c4 0 4 5 0 5M6 13l7 8" />,
  pieces: <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />,
  cash: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  online: (
    <>
      <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
      <path d="M11 18h2" />
    </>
  ),
  profit: <path d="M3 17l6-6 4 4 8-8M21 7v5M21 7h-5" />,
  fridge: (
    <>
      <rect x="6" y="2.5" width="12" height="19" rx="2" />
      <path d="M6 10h12M9.5 5.5v2M9.5 13v3" />
    </>
  ),
  box: <path d="M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8" />,
  alert: <path d="M12 3l9 16H3zM12 9v5M12 17.5v.5" />,
  cart: (
    <>
      <path d="M3 4h2l2.4 12.3a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.2L22 8H6" />
      <circle cx="9.5" cy="20" r="1" />
      <circle cx="18" cy="20" r="1" />
    </>
  ),
  receipt: <path d="M5 3v18l2.5-1.5L10 21l2-1.5 2 1.5 2.5-1.5L19 21V3l-2.5 1.5L14 3l-2 1.5L10 3 7.5 4.5z M9 8h6M9 12h6" />
};

export default function StatCard({
  icon,
  label,
  value,
  sub,
  tone = 'brand'
}: {
  icon: StatIcon;
  label: string;
  value: string | number;
  sub?: ReactNode;
  tone?: StatTone;
}) {
  return (
    <article className={`stat-card tone-${tone}`}>
      <span className="stat-card-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          {ICONS[icon]}
        </svg>
      </span>
      <span className="stat-card-body">
        <span className="stat-card-label">{label}</span>
        <span className="stat-card-value">{value}</span>
        {sub != null && <span className="stat-card-sub">{sub}</span>}
      </span>
    </article>
  );
}
