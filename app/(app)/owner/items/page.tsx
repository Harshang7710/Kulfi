import PageHeader from '@/components/PageHeader';
import SubmitButton from '@/components/SubmitButton';
import { itemRows } from '@/lib/helpers';
import { money } from '@/lib/db';
import ImageUploadField from './ImageUploadField';
import EditableItemRow from './EditableItemRow';
import { addItemAction, updateItemAction } from './actions';

export default async function OwnerItemsPage() {
  const rows = await itemRows(false);

  return (
    <>
      <PageHeader title="Item Catalog" />

      <article className="card">
        <h2>Add item</h2>
        <form action={addItemAction} className="form-grid">
          <label>
            Numeric Item ID
            <input name="itemCode" type="number" min={1} step={1} required />
          </label>
          <label>
            Name
            <input name="name" required />
          </label>
          <label>
            MRP
            <input name="mrp" type="number" min={0.01} step={0.01} required />
          </label>
          <label>
            Pieces/box
            <input name="piecesPerBox" type="number" min={1} step={1} placeholder="Blank" />
          </label>
          <label>
            Low threshold
            <input name="lowStockThreshold" type="number" min={0} step={1} placeholder="Blank" />
          </label>
          <ImageUploadField />
          <SubmitButton pendingText="Adding…">Add item</SubmitButton>
        </form>
      </article>

      <article className="card">
        <div className="card-head">
          <h2>Item catalog</h2>
          <span className="count-chip">{rows.length} {rows.length === 1 ? 'item' : 'items'}</span>
        </div>
        <div className="table-wrap">
          <table>
              <thead>
                <tr>
                  <th>Image</th>
                  <th>ID</th>
                  <th>Name</th>
                  <th>MRP</th>
                  <th>Pieces/box</th>
                  <th>Low</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <EditableItemRow
                    key={r.id}
                    action={updateItemAction}
                    id={r.id}
                    itemCode={r.itemCode}
                    name={r.name}
                    mrp={money(r.mrp)}
                    piecesPerBox={r.piecesPerBox ?? ''}
                    lowStockThreshold={r.lowStockThreshold ?? ''}
                    active={r.active}
                    hidden={r.hidden}
                    imageData={r.imageData}
                  />
                ))}
                {!rows.length && (
                  <tr>
                    <td colSpan={8} className="empty">
                      No items yet.
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
