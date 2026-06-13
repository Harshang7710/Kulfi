import PageHeader from '@/components/PageHeader';
import { itemRows, stockDisplay } from '@/lib/helpers';

export default async function ManagerStockPage() {
  const rows = await itemRows(true);

  return (
    <>
      <PageHeader title="Available Stock" />

      <article className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Main Fridge total pcs</th>
                <th>Second Fridge boxes</th>
                <th>Pieces/box</th>
                <th>Low threshold</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const display = stockDisplay(r);
                const low = r.mainFridgeQty <= r.lowStockThreshold;
                return (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td>{display.mainPieces}</td>
                    <td>{display.secondBoxes}</td>
                    <td>{r.piecesPerBox}</td>
                    <td>{r.lowStockThreshold}</td>
                    <td>
                      <span className={`badge ${low ? 'danger' : 'ok'}`}>{low ? 'Low stock' : 'Available'}</span>
                    </td>
                  </tr>
                );
              })}
              {!rows.length && (
                <tr>
                  <td colSpan={6} className="empty">
                    No stock available.
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
