import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import { dateRange, reports } from '@/lib/helpers';
import { money } from '@/lib/db';
import SalesReportTable from './SalesReportTable';

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function datePresets(): { label: string; from: string; to: string }[] {
  const today = new Date();
  const t = ymd(today);
  const minus = (days: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - days);
    return ymd(d);
  };
  const monthStart = ymd(new Date(today.getFullYear(), today.getMonth(), 1));
  return [
    { label: 'Today', from: t, to: t },
    { label: 'Last 7 days', from: minus(6), to: t },
    { label: 'Last 30 days', from: minus(29), to: t },
    { label: 'This month', from: monthStart, to: t }
  ];
}

export default async function OwnerReportsPage({
  searchParams
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const query = await searchParams;
  const range = dateRange(query);
  const report = await reports(range);
  const net = report.totals.gross - report.totals.returns;
  const billCount = new Set(report.rows.map((r) => r.billNumber)).size;

  return (
    <>
      <PageHeader title="Sales Reports" />

      <article className="card">
        <div className="preset-row">
          {datePresets().map((p) => {
            const active = range.fromDate === p.from && range.toDate === p.to;
            return (
              <a
                key={p.label}
                className={`preset-chip${active ? ' active' : ''}`}
                href={`/owner/reports?from=${p.from}&to=${p.to}`}
                aria-current={active ? 'true' : undefined}
              >
                {p.label}
              </a>
            );
          })}
        </div>
        <form className="form-grid" method="get">
          <label>
            From
            <input type="date" name="from" defaultValue={range.fromDate} />
          </label>
          <label>
            To
            <input type="date" name="to" defaultValue={range.toDate} />
          </label>
          <button className="primary">Filter</button>
          <a className="btn secondary" href={`/owner/reports/export?from=${range.fromDate}&to=${range.toDate}`}>
            Export CSV
          </a>
        </form>
      </article>

      <section className="grid stats">
        <StatCard icon="rupee" tone="brand" label="Gross sales" value={`₹${money(report.totals.gross)}`} sub={`${billCount} ${billCount === 1 ? 'bill' : 'bills'}`} />
        <StatCard icon="alert" tone="danger" label="Returns" value={`₹${money(report.totals.returns)}`} />
        <StatCard icon="profit" tone="success" label="Net sales" value={`₹${money(net)}`} />
        <StatCard icon="pieces" tone="gold" label="Pieces" value={report.totals.pieces} />
        <StatCard icon="cash" tone="success" label="Cash" value={`₹${money(report.totals.cash)}`} />
        <StatCard icon="online" tone="info" label="Online" value={`₹${money(report.totals.online)}`} />
      </section>

      <article className="card sales-report-card">
        <SalesReportTable rows={report.rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }))} />
      </article>
    </>
  );
}
