import PageHeader from '@/components/PageHeader';
import { dateRange, reports } from '@/lib/helpers';
import { money } from '@/lib/db';

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

      <article className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Bill</th>
                <th>Manager</th>
                <th>Customer</th>
                <th>Type</th>
                <th>Item</th>
                <th>Qty</th>
                <th>MRP</th>
                <th>Free</th>
                <th>Line</th>
                <th>Cash</th>
                <th>Online</th>
                <th>Remark</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((r) => (
                <tr key={r.saleItemId}>
                  <td>{new Date(r.createdAt).toLocaleString()}</td>
                  <td>{r.billNumber}</td>
                  <td>{r.managerName}</td>
                  <td>{r.customerName || ''}</td>
                  <td>{r.type}</td>
                  <td>{r.itemName}</td>
                  <td>{r.quantity}</td>
                  <td>₹{money(r.mrp)}</td>
                  <td>{r.isFree ? 'Yes' : 'No'}</td>
                  <td>₹{money(r.lineTotal)}</td>
                  <td>₹{money(r.cashAmount)}</td>
                  <td>₹{money(r.onlineAmount)}</td>
                  <td>{r.remark || ''}</td>
                </tr>
              ))}
              {!report.rows.length && (
                <tr>
                  <td colSpan={13} className="empty">
                    No sales in this date range.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>
    </>
  );
}
