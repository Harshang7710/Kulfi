import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import SubmitButton from '@/components/SubmitButton';
import { itemRows } from '@/lib/helpers';
import { money } from '@/lib/db';
import { updateInventoryAction } from './actions';

export default async function OwnerInventoryPage() {
  const rows = await itemRows(false);

  const totalValue = rows.reduce((a, r) => a + (r.mainFridgeQty + r.secondFridgeQty * r.piecesPerBox) * r.mrp, 0);
  const outCount = rows.filter((r) => r.mainFridgeQty <= 0).length;
  const lowCount = rows.filter((r) => r.mainFridgeQty > 0 && r.mainFridgeQty <= r.lowStockThreshold).length;
  const healthyCount = rows.length - outCount - lowCount;

  return (
    <>
      <PageHeader title="Inventory Management" />

      <section className="grid stats">
        <StatCard icon="rupee" tone="brand" label="Total stock value" value={`₹${money(totalValue)}`} />
        <StatCard icon="box" tone="success" label="Healthy items" value={healthyCount} />
        <StatCard icon="alert" tone="gold" label="Low stock" value={lowCount} />
        <StatCard icon="alert" tone="danger" label="Out of stock" value={outCount} />
      </section>

      <article className="card">
        <h2>Inventory balances</h2>
        <div className="table-wrap">
          <form action={updateInventoryAction}>
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Main Fridge (pcs)</th>
                  <th>Second Fridge (boxes)</th>
                  <th>Total value</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const out = r.mainFridgeQty <= 0;
                  const low = !out && r.mainFridgeQty <= r.lowStockThreshold;
                  return (
                    <tr key={r.id}>
                      <td>{r.name}</td>
                      <td>
                        <input
                          name={`main_${r.id}`}
                          type="number"
                          min={0}
                          defaultValue={r.mainFridgeQty}
                          aria-label={`Main Fridge pieces for ${r.name}`}
                        />
                      </td>
                      <td>
                        <input
                          name={`second_${r.id}`}
                          type="number"
                          min={0}
                          defaultValue={r.secondFridgeQty}
                          aria-label={`Second Fridge boxes for ${r.name}`}
                        />
                      </td>
                      <td>₹{money((r.mainFridgeQty + r.secondFridgeQty * r.piecesPerBox) * r.mrp)}</td>
                      <td>
                        <span className={`badge ${out ? 'danger' : low ? 'warn' : 'ok'}`}>
                          {out ? 'Out of stock' : low ? 'Low stock' : 'Healthy'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {!rows.length && (
                  <tr>
                    <td colSpan={5} className="empty">
                      No items yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <p>
              <SubmitButton pendingText="Saving…">Save stock balances</SubmitButton>
            </p>
          </form>
        </div>
      </article>
    </>
  );
}
