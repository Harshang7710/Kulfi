import PageHeader from '@/components/PageHeader';
import { dateRange, pagination, reports } from '@/lib/helpers';
import { money } from '@/lib/db';
import SalesReportTable from './SalesReportTable';

export default async function OwnerReportsPage({
  searchParams
}: {
  searchParams: Promise<{ from?: string; to?: string; page?: string; limit?: string }>;
}) {
  const query = await searchParams;
  const range = dateRange(query);
  const pager = pagination(query);
  const report = await reports(range, { page: pager.page, limit: pager.limit });

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
          <input type="hidden" name="page" value="1" />
          <input type="hidden" name="limit" value={String(pager.limit)} />
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
        <div className="movement-pagination">
          <form className="movement-page-size" method="get">
            <input type="hidden" name="from" value={range.fromDate} />
            <input type="hidden" name="to" value={range.toDate} />
            <input type="hidden" name="page" value="1" />
            <span>Show</span>
            <select name="limit" defaultValue={String(report.pagination.limit)} aria-label="Rows per page">
              {[10, 25, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size} entries
                </option>
              ))}
            </select>
            <button className="btn secondary" type="submit">
              Apply
            </button>
          </form>
          <div className="movement-page-controls">
            <span>
              Page {report.pagination.page} of {report.pagination.totalPages} ({report.pagination.totalRows} rows)
            </span>
            <a
              className={`btn secondary ${report.pagination.page <= 1 ? 'disabled' : ''}`}
              href={`/owner/reports?from=${range.fromDate}&to=${range.toDate}&page=${Math.max(1, report.pagination.page - 1)}&limit=${report.pagination.limit}`}
            >
              Previous
            </a>
            <a
              className={`btn secondary ${report.pagination.page >= report.pagination.totalPages ? 'disabled' : ''}`}
              href={`/owner/reports?from=${range.fromDate}&to=${range.toDate}&page=${Math.min(report.pagination.totalPages, report.pagination.page + 1)}&limit=${report.pagination.limit}`}
            >
              Next
            </a>
          </div>
        </div>
      </article>
    </>
  );
}
