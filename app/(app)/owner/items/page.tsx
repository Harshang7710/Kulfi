import PageHeader from '@/components/PageHeader';
import { itemRows } from '@/lib/helpers';
import { money } from '@/lib/db';
import ImageUploadField from './ImageUploadField';
import { addItemAction, updateItemsAction } from './actions';

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
          <button className="primary">Add item</button>
        </form>
      </article>

      <article className="card">
        <h2>Item catalog</h2>
        <div className="table-wrap">
          <form action={updateItemsAction}>
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
                  <tr key={r.id}>
                    <td>{r.imageData ? <img className="item-thumb" src={r.imageData} alt={`${r.name} image`} /> : '—'}</td>
                    <td>
                      <input
                        name={`itemCode_${r.id}`}
                        type="number"
                        min={1}
                        step={1}
                        defaultValue={r.itemCode}
                        required
                        aria-label={`Item ID for ${r.name}`}
                      />
                    </td>
                    <td>
                      <input name={`name_${r.id}`} defaultValue={r.name} required aria-label={`Name for item ${r.itemCode}`} />
                    </td>
                    <td>
                      <input
                        name={`mrp_${r.id}`}
                        type="number"
                        min={0.01}
                        step={0.01}
                        defaultValue={money(r.mrp)}
                        required
                        aria-label={`MRP for ${r.name}`}
                      />
                    </td>
                    <td>
                      <input
                        name={`piecesPerBox_${r.id}`}
                        type="number"
                        min={1}
                        step={1}
                        defaultValue={r.piecesPerBox ?? ''}
                        aria-label={`Pieces per box for ${r.name}`}
                      />
                    </td>
                    <td>
                      <input
                        name={`lowStockThreshold_${r.id}`}
                        type="number"
                        min={0}
                        step={1}
                        defaultValue={r.lowStockThreshold ?? ''}
                        aria-label={`Low stock threshold for ${r.name}`}
                      />
                    </td>
                    <td>
                      <label className="inline-check">
                        <input type="checkbox" name={`active_${r.id}`} defaultChecked={r.active} /> Active
                      </label>
                      <label className="inline-check">
                        <input type="checkbox" name={`hidden_${r.id}`} defaultChecked={r.hidden} /> Hidden
                      </label>
                    </td>
                    <td>
                      <button className="btn secondary" type="submit">
                        Edit
                      </button>
                    </td>
                  </tr>
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
            <p className="actions">
              <button className="primary">Save catalog changes</button>
            </p>
          </form>
        </div>
      </article>
    </>
  );
}
