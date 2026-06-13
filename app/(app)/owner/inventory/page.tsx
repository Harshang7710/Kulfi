import PageHeader from '@/components/PageHeader';
import { itemRows } from '@/lib/helpers';
import { money } from '@/lib/db';
import { updateInventoryAction } from './actions';

export default async function OwnerInventoryPage() {
  const rows = await itemRows(false);

  return (
    <>
      <PageHeader title="Inventory Management" />

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
                {rows.map((r) => (
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
                      <span className={`badge ${r.mainFridgeQty <= r.lowStockThreshold ? 'danger' : 'ok'}`}>
                        {r.mainFridgeQty <= r.lowStockThreshold ? 'Low stock' : 'Healthy'}
                      </span>
                    </td>
                  </tr>
                ))}
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
              <button className="primary">Save stock balances</button>
            </p>
          </form>
        </div>
      </article>
    </>
  );
}
