import { redirect } from 'next/navigation';
import PageHeader from '@/components/PageHeader';
import { getCurrentUser } from '@/lib/auth';
import { money } from '@/lib/format';
import { returnableLines } from '@/lib/helpers';
import { submitReturnAction } from './actions';

export default async function ManagerReturnsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const rows = await returnableLines(user.id);

  return (
    <>
      <PageHeader title="POS Returns" />

      <article className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Bill</th>
                <th>Item</th>
                <th>Sold</th>
                <th>Returned</th>
                <th>Remaining</th>
                <th>Refund/pc</th>
                <th>Return</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const remaining = r.quantity - r.returnedQty;
                return (
                  <tr key={r.id}>
                    <td>{r.billNumber}</td>
                    <td>{r.name}</td>
                    <td>{r.quantity}</td>
                    <td>{r.returnedQty}</td>
                    <td>{remaining}</td>
                    <td>₹{r.isFree ? '0.00' : money(r.mrp)}</td>
                    <td>
                      <form className="actions" action={submitReturnAction}>
                        <input type="hidden" name="saleItemId" value={r.id} />
                        <input
                          name="quantity"
                          type="number"
                          min={1}
                          max={remaining}
                          required
                          aria-label={`Return quantity for ${r.name} from bill ${r.billNumber}`}
                        />
                        <button className="btn secondary">Process return</button>
                      </form>
                    </td>
                  </tr>
                );
              })}
              {!rows.length && (
                <tr>
                  <td colSpan={7} className="empty">
                    No returnable items for your sales today.
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
