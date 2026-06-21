import PageHeader from '@/components/PageHeader';
import SubmitButton from '@/components/SubmitButton';
import { itemRows, MOVEMENT_TYPES, movementHistory } from '@/lib/helpers';
import Link from 'next/link';
import { money } from '@/lib/db';
import { recordMovementAction } from './actions';

export default async function ManagerMovementsPage({
  searchParams
}: {
  searchParams: Promise<{ itemId?: string; type?: string; page?: string; pageSize?: string }>;
}) {
  const query = await searchParams;
  const items = await itemRows(true);
  const pageSizeOptions = [5, 10, 25, 50];
  const requestedPageSize = Number(query.pageSize);
  const pageSize = pageSizeOptions.includes(requestedPageSize) ? requestedPageSize : 10;
  const requestedPage = Number(query.page);
  const currentPage = Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1;
  const rows = await movementHistory({ itemId: query.itemId, type: query.type });
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const visibleRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize);
  const pageHref = (page: number, size = pageSize) => {
    const params = new URLSearchParams();
    if (query.itemId) params.set('itemId', query.itemId);
    if (query.type) params.set('type', query.type);
    params.set('page', String(page));
    params.set('pageSize', String(size));
    return `/manager/movements?${params.toString()}`;
  };

  return (
    <>
      <PageHeader title="Movement" />

      <section className="movement-section">
        <article className="card movement-card">
          <h2>Movement</h2>
          <form action={recordMovementAction} className="movement-entry-form">
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
            <SubmitButton pendingText="Recording…">Record movement</SubmitButton>
          </form>
        </article>
      </section>

      <article className="card">
        <h2>Movement history</h2>
        <form className="movement-filter-form" method="get">
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
          <input type="hidden" name="page" value="1" />
          <input type="hidden" name="pageSize" value={String(pageSize)} />
          <button className="btn secondary">Filter</button>
          {(query.itemId || query.type) && (
            <a className="btn secondary" href="/manager/movements">
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
              {visibleRows.map((r) => (
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
              {!visibleRows.length && (
                <tr>
                  <td colSpan={9} className="empty">
                    No stock movement records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="movement-pagination">
          <form className="movement-page-size" method="get">
            <span>Show</span>
              {query.itemId && <input type="hidden" name="itemId" value={query.itemId} />}
              {query.type && <input type="hidden" name="type" value={query.type} />}
              <input type="hidden" name="page" value="1" />
              <select name="pageSize" defaultValue={String(pageSize)} aria-label="Rows per page">
                {pageSizeOptions.map((size) => (
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
              Page {safePage} of {totalPages} ({rows.length} records)
            </span>
            <Link className={`btn secondary ${safePage <= 1 ? 'disabled' : ''}`} href={pageHref(Math.max(1, safePage - 1))}>
              Previous
            </Link>
            <Link
              className={`btn secondary ${safePage >= totalPages ? 'disabled' : ''}`}
              href={pageHref(Math.min(totalPages, safePage + 1))}
            >
              Next
            </Link>
          </div>
        </div>
      </article>
    </>
  );
}
