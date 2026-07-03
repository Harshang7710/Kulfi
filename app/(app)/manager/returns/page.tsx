import { redirect } from 'next/navigation';
import PageHeader from '@/components/PageHeader';
import SubmitButton from '@/components/SubmitButton';
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

      <article className="card returns-card">
        <div className="returns-summary">
          <div>
            <p className="eyebrow">Today</p>
            <h2>Returns counter</h2>
            <p className="muted">Enter only the quantity that came back. Eligible lines are grouped from your current-day bills.</p>
          </div>
          <span className="badge warn">{rows.length} returnable lines</span>
        </div>
        <div className="table-wrap returns-table-wrap">
          <table className="returns-table">
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
                    <td><strong className="bill-chip">{r.billNumber}</strong></td>
                    <td><span className="return-item-name">{r.name}</span>{r.itemCode && <small className="return-item-code">#{r.itemCode}</small>}</td>
                    <td><span className="qty-pill">{r.quantity}</span></td>
                    <td><span className="qty-pill muted-pill">{r.returnedQty}</span></td>
                    <td><span className="qty-pill ok-pill">{remaining}</span></td>
                    <td><strong>₹{r.isFree ? '0.00' : money(r.mrp)}</strong></td>
                    <td>
                      <form className="actions return-form" action={submitReturnAction}>
                        <input type="hidden" name="saleItemId" value={r.id} />
                        <input
                          name="quantity"
                          type="number"
                          min={1}
                          max={remaining}
                          required
                          placeholder="Qty"
                          aria-label={`Return quantity for ${r.name} from bill ${r.billNumber}`}
                        />
                        <SubmitButton className="btn secondary" pendingText="Processing…">
                          Process return
                        </SubmitButton>
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
