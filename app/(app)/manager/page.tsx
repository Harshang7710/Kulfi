import Link from 'next/link';
import { redirect } from 'next/navigation';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import TrendChart from '@/components/TrendChart';
import Donut from '@/components/Donut';
import { getCurrentUser } from '@/lib/auth';
import { money } from '@/lib/format';
import { managerToday } from '@/lib/helpers';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const QUICK_ACTIONS: { href: string; label: string; desc: string; icon: React.ReactNode }[] = [
  {
    href: '/manager/pos',
    label: 'New Sale',
    desc: 'Open the billing counter',
    icon: <path d="M3 4h2l2.4 12.3a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.2L22 8H6" />
  },
  {
    href: '/manager/returns',
    label: 'Returns',
    desc: "Refund today's bills",
    icon: <path d="M3 7v6h6M3 13a9 9 0 1 0 3-7.7L3 8" />
  },
  {
    href: '/manager/stock',
    label: 'Available Stock',
    desc: 'Check fridge levels',
    icon: <path d="M6 2.5h12a1.5 1.5 0 0 1 1.5 1.5v16a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 20V4A1.5 1.5 0 0 1 6 2.5zM8 7h8M8 11h8M8 15h5" />
  }
];

export default async function ManagerHomePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const { summary, billCount, topItems, trend } = await managerToday(user.id);
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
  const avgBill = billCount > 0 ? summary.total / billCount : 0;
  const topQty = Math.max(...topItems.map((t) => t.qty), 1);

  return (
    <>
      <PageHeader title="Manager Home" />

      <section className="card welcome-banner">
        <div>
          <p className="eyebrow">{today}</p>
          <h2>
            {greeting()}, {user.name.split(' ')[0]} 👋
          </h2>
          <p className="muted">Here is how your counter is doing today.</p>
        </div>
        <Link href="/manager/pos" className="btn primary welcome-cta">
          Start billing →
        </Link>
      </section>

      <section className="grid stats">
        <StatCard icon="rupee" tone="brand" label="Today’s sales" value={`₹${money(summary.total)}`} sub={`${billCount} ${billCount === 1 ? 'bill' : 'bills'}`} />
        <StatCard icon="pieces" tone="gold" label="Pieces sold" value={summary.pieces} />
        <StatCard icon="cash" tone="success" label="Cash collected" value={`₹${money(summary.cash)}`} />
        <StatCard icon="online" tone="info" label="Online collected" value={`₹${money(summary.online)}`} />
      </section>

      <section className="grid two">
        <article className="card">
          <div className="card-head">
            <h2>Your 7-day sales</h2>
            <span className="badge ok">Avg bill ₹{money(avgBill)}</span>
          </div>
          <TrendChart points={trend} />
        </article>
        <article className="card">
          <h2>Today’s payment split</h2>
          <Donut
            segments={[
              { label: 'Cash', value: summary.cash, className: 'seg-cash' },
              { label: 'Online', value: summary.online, className: 'seg-online' }
            ]}
            centerLabel="collected"
            centerValue={`₹${money(summary.total)}`}
          />
        </article>
      </section>

      <section className="grid two">
        <article className="card">
          <h2>Your top sellers today</h2>
          <ul className="rank-list">
            {topItems.map((t, i) => (
              <li key={t.name}>
                <span className="rank-num">{i + 1}</span>
                <span className="rank-name">{t.name}</span>
                <span className="rank-bar" aria-hidden="true">
                  <span className={`rank-fill rank-fill-${Math.max(5, Math.round((t.qty / topQty) * 100 / 5) * 5)}`} />
                </span>
                <span className="rank-val">{t.qty} pcs</span>
              </li>
            ))}
            {!topItems.length && <li className="empty">No sales recorded yet today.</li>}
          </ul>
        </article>
        <article className="card">
          <h2>Quick actions</h2>
          <div className="quick-actions">
            {QUICK_ACTIONS.map((a) => (
              <Link key={a.href} href={a.href} className="quick-action">
                <span className="quick-action-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                    {a.icon}
                  </svg>
                </span>
                <span className="quick-action-text">
                  <strong>{a.label}</strong>
                  <small>{a.desc}</small>
                </span>
                <span className="quick-action-arrow" aria-hidden="true">→</span>
              </Link>
            ))}
          </div>
        </article>
      </section>
    </>
  );
}
