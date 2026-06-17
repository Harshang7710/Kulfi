import PageHeader from '@/components/PageHeader';
import { dateRange, reports } from '@/lib/helpers';
import { money } from '@/lib/db';
import SalesReportTable from './SalesReportTable';

export default async function OwnerReportsPage({
  searchParams
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const query = await searchParams;
  const range = dateRange(query);
  const report = await reports(range);

  return (
    <>
      <PageHeader title="Sales Reports" />

      <article className="card">
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
        <article className="card stat">
          <span>Gross sales</span>
          <span className="stat-value">₹{money(report.totals.gross)}</span>
        </article>
        <article className="card stat">
          <span>Returns</span>
          <span className="stat-value">₹{money(report.totals.returns)}</span>
        </article>
        <article className="card stat">
          <span>Net sales</span>
          <span className="stat-value">₹{money(report.totals.gross - report.totals.returns)}</span>
        </article>
        <article className="card stat">
          <span>Pieces</span>
          <span className="stat-value">{report.totals.pieces}</span>
        </article>
      </section>

      <article className="card sales-report-card">
        <SalesReportTable rows={report.rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }))} />
      </article>
    </>
  );
}
