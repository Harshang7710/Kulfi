import PageHeader from '@/components/PageHeader';
import { getDashboardData } from '@/lib/helpers';
import { money } from '@/lib/db';

export default async function OwnerDashboardPage() {
  const { stats, summary, trend, inventory, topItems, managers, movements } = await getDashboardData();

  return (
    <>
      <PageHeader title="Owner Dashboard" />

      <section className="grid stats">
        {stats.map((s) => (
          <article className="card stat" key={s.label}>
            <span>{s.label}</span>
            <span className="stat-value">{s.value}</span>
          </article>
        ))}
      </section>

      <section className="grid two">
        <article className="card">
          <h2>Seven-day revenue trend</h2>
          <div className="bars">
            {trend.map((r) => (
              <div key={r.day}>
                <span className={`bar-h-${r.heightPct}`} />
                <small>
                  {r.day.slice(5)}
                  <br />₹{money(r.amount)}
                </small>
              </div>
            ))}
          </div>
        </article>
        <article className="card">
          <h2>Payment mode breakdown</h2>
          <div className="donut">
            <div>
              Cash
              <br />
              <span>₹{money(summary.cash)}</span>
            </div>
            <div>
              Online
              <br />
              <span>₹{money(summary.online)}</span>
            </div>
          </div>
        </article>
      </section>

      <section className="grid two">
        <article className="card">
          <h2>Inventory health</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Main</th>
                  <th>Second</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {inventory.map((i) => (
                  <tr key={i.id}>
                    <td>{i.name}</td>
                    <td>{i.mainFridgeQty}</td>
                    <td>{i.secondFridgeQty}</td>
                    <td>
                      <span className="badge danger">Low stock</span>
                    </td>
                  </tr>
                ))}
                {!inventory.length && (
                  <tr>
                    <td colSpan={4} className="empty">
                      No low-stock items right now.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
        <article className="card">
          <h2>Manager performance</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Manager</th>
                  <th>Sales</th>
                  <th>Pieces</th>
                  <th>Cash</th>
                  <th>Online</th>
                </tr>
              </thead>
              <tbody>
                {managers.map((m) => (
                  <tr key={m.name}>
                    <td>{m.name}</td>
                    <td>₹{money(m.total)}</td>
                    <td>{m.pieces}</td>
                    <td>₹{money(m.cash)}</td>
                    <td>₹{money(m.online)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <section className="grid two">
        <article className="card">
          <h2>Top kulfi items today</h2>
          <ul className="feed">
            {topItems.map((i) => (
              <li key={i.name}>
                <span>{i.name}</span>
                <span>
                  {i.qty} pcs · ₹{money(i.amount)}
                </span>
              </li>
            ))}
            {!topItems.length && <li className="empty">No sales yet today.</li>}
          </ul>
        </article>
        <details className="card movement-dropdown">
          <summary>
            <span>Recent stock movement feed</span>
            <span className="dropdown-arrow">⌄</span>
          </summary>
          <ul className="feed">
            {movements.map((m) => (
              <li key={m.id}>
                <span>{m.name}</span>
                <span>
                  {m.movementType.replaceAll('_', ' ')} · {m.quantityPieces} pcs
                </span>
              </li>
            ))}
            {!movements.length && <li className="empty">No stock movements yet.</li>}
          </ul>
        </details>
      </section>
    </>
  );
}
