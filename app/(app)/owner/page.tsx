import PageHeader from '@/components/PageHeader';
import StatCard, { type StatIcon, type StatTone } from '@/components/StatCard';
import TrendChart from '@/components/TrendChart';
import Donut from '@/components/Donut';
import { dayOverDayChange, getDashboardData } from '@/lib/helpers';
import { money } from '@/lib/db';

// Parallel to the fixed order of stats returned by getDashboardData().
const STAT_META: { icon: StatIcon; tone: StatTone }[] = [
  { icon: 'rupee', tone: 'brand' },
  { icon: 'pieces', tone: 'gold' },
  { icon: 'cash', tone: 'success' },
  { icon: 'online', tone: 'info' },
  { icon: 'profit', tone: 'brand' },
  { icon: 'fridge', tone: 'info' },
  { icon: 'box', tone: 'gold' },
  { icon: 'alert', tone: 'danger' }
];

export default async function OwnerDashboardPage() {
  const { stats, summary, trend, inventory, topItems, managers, movements } = await getDashboardData();
  const topQty = Math.max(...topItems.map((i) => i.qty), 1);
  const change = dayOverDayChange(trend);

  return (
    <>
      <PageHeader title="Owner Dashboard" />

      <section className="grid stats">
        {stats.map((s, i) => (
          <StatCard
            key={s.label}
            icon={STAT_META[i]?.icon ?? 'rupee'}
            tone={STAT_META[i]?.tone ?? 'brand'}
            label={s.label}
            value={s.value}
            sub={
              i === 0 && change ? (
                <span className={`trend-badge ${change.up ? 'up' : 'down'}`}>
                  {change.up ? '▲' : '▼'} {change.pct}% vs yesterday
                </span>
              ) : undefined
            }
          />
        ))}
      </section>

      <section className="grid two">
        <article className="card">
          <div className="card-head">
            <h2>Seven-day revenue trend</h2>
            <span className="badge ok">Today ₹{money(summary.total)}</span>
          </div>
          <TrendChart points={trend} />
        </article>
        <details className="card expandable-card" open>
          <summary>
            <span>Payment mode breakdown</span>
            <span className="dropdown-arrow">⌄</span>
          </summary>
          <Donut
            segments={[
              { label: 'Cash', value: summary.cash, className: 'seg-cash' },
              { label: 'Online', value: summary.online, className: 'seg-online' }
            ]}
            centerLabel="today"
            centerValue={`₹${money(summary.total)}`}
          />
        </details>
      </section>

      <section className="grid two">
        <details className="card expandable-card" open>
          <summary>
            <span>Inventory health</span>
            <span className="dropdown-arrow">⌄</span>
          </summary>
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
                {inventory.map((i) => {
                  const out = i.mainFridgeQty <= 0;
                  return (
                    <tr key={i.id}>
                      <td>{i.name}</td>
                      <td>{i.mainFridgeQty}</td>
                      <td>{i.secondFridgeQty}</td>
                      <td>
                        <span className={`badge ${out ? 'danger' : 'warn'}`}>
                          {out ? 'Out of stock' : `Low · ${i.mainFridgeQty}/${i.lowStockThreshold}`}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {!inventory.length && (
                  <tr>
                    <td colSpan={4} className="empty">
                      All items are well stocked. ✓
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </details>
        <details className="card expandable-card" open>
          <summary>
            <span>Manager performance</span>
            <span className="dropdown-arrow">⌄</span>
          </summary>
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
                {!managers.length && (
                  <tr>
                    <td colSpan={5} className="empty">
                      No managers yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </details>
      </section>

      <section className="grid two">
        <details className="card expandable-card" open>
          <summary>
            <span>Top kulfi items today</span>
            <span className="dropdown-arrow">⌄</span>
          </summary>
          <ul className="rank-list">
            {topItems.map((i, idx) => (
              <li key={i.name}>
                <span className="rank-num">{idx + 1}</span>
                <span className="rank-name">{i.name}</span>
                <span className="rank-bar" aria-hidden="true">
                  <span className={`rank-fill rank-fill-${Math.max(5, Math.round((i.qty / topQty) * 100 / 5) * 5)}`} />
                </span>
                <span className="rank-val">
                  {i.qty} pcs · ₹{money(i.amount)}
                </span>
              </li>
            ))}
            {!topItems.length && <li className="empty">No sales yet today.</li>}
          </ul>
        </details>
        <details className="card movement-dropdown expandable-card">
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
