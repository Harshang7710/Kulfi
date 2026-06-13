import PageHeader from '@/components/PageHeader';
import { itemRows, MOVEMENT_TYPES, movementHistory } from '@/lib/helpers';
import { money } from '@/lib/db';
import { recordMovementAction } from './actions';

export default async function OwnerMovementsPage({
  searchParams
}: {
  searchParams: Promise<{ itemId?: string; type?: string }>;
}) {
  const query = await searchParams;
  const items = await itemRows(true);
  const rows = await movementHistory({ itemId: query.itemId, type: query.type });

  return (
    <>
      <PageHeader title="Movement" />

      <section className="grid two">
        <article className="card">
          <h2>Movement</h2>
          <p className="muted">
            Move stock between fridges, receive vendor stock into the Second Fridge, or return damaged stock back to the
            vendor.
          </p>
          <form action={recordMovementAction} className="form-grid two-col">
            <label>
              Workflow
              <select name="movementAction">
                <option value="transfer_second_to_main">Second Fridge → Main Fridge</option>
                <option value="vendor_stock_in">Vendor intake → Second Fridge</option>
                <option value="vendor_return">Damaged stock → Vendor return</option>
              </select>
            </label>
            <label>
              Item
              <select name="itemId" required defaultValue="">
                <option value="" disabled>
                  Select item
                </option>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} ({i.piecesPerBox} pcs/box)
                  </option>
                ))}
              </select>
            </label>
            <label>
              Quantity (boxes)
              <input name="boxes" type="number" min={1} step={1} required />
            </label>
            <label>
              Notes
              <input name="notes" placeholder="Invoice, reason, or damage details" />
            </label>
            <button className="primary">Record movement</button>
          </form>
        </article>
        <article className="card">
          <h2>Unit logic</h2>
          <ul className="feed">
            <li>
              <span>Main Fridge</span>
              <span>Tracked as individual pieces for retail sales.</span>
            </li>
            <li>
              <span>Second Fridge</span>
              <span>Tracked as boxes for vendor/wholesale stock.</span>
            </li>
            <li>
              <span>Transfers</span>
              <span>Entered in boxes and converted to pieces automatically.</span>
            </li>
          </ul>
        </article>
      </section>

      <article className="card">
        <h2>Movement history</h2>
        <form className="form-grid two-col" method="get">
          <label>
            Filter by item
            <select name="itemId" defaultValue={query.itemId || ''}>
              <option value="">All items</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Filter by type
            <select name="type" defaultValue={query.type || ''}>
              <option value="">All types</option>
              {MOVEMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </label>
          <button className="btn secondary">Filter</button>
          {(query.itemId || query.type) && (
            <a className="btn secondary" href="/owner/movements">
              Clear filters
            </a>
          )}
        </form>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Item</th>
                <th>Type</th>
                <th>Pieces</th>
                <th>Boxes</th>
                <th>Source</th>
                <th>Destination</th>
                <th>Created by</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.createdAt).toLocaleString()}</td>
                  <td>{r.item.name}</td>
                  <td>{r.movementType.replaceAll('_', ' ')}</td>
                  <td>{r.quantityPieces}</td>
                  <td>{money(r.quantityBoxes)}</td>
                  <td>{r.sourceLocation || ''}</td>
                  <td>{r.destinationLocation || ''}</td>
                  <td>{r.creator.name}</td>
                  <td>{r.notes || ''}</td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={9} className="empty">
                    No stock movement records found.
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
