'use client';

import { useState } from 'react';
import ImageUploadField from './ImageUploadField';

type EditableItemRowProps = {
  action: (formData: FormData) => void | Promise<void>;
  id: string;
  itemCode: string;
  name: string;
  mrp: string;
  piecesPerBox: number | string;
  lowStockThreshold: number | string;
  active: boolean;
  hidden: boolean;
  imageData?: string;
};

export default function EditableItemRow({
  id,
  itemCode,
  name,
  mrp,
  piecesPerBox,
  lowStockThreshold,
  active,
  hidden,
  imageData,
  action
}: EditableItemRowProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const formId = `edit-item-${id}`;

  function startEditing(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    setEditing(true);
  }

  function guardSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (!editing) {
      event.preventDefault();
      return;
    }
    // useFormStatus won't see this form's pending state since the Save button lives
    // outside the <form> JSX tree (wired via the `form` attribute so inputs can sit
    // in table cells) — track it manually instead. The row unmounts/resets on the
    // server-action redirect either way, so there's no "stuck" state to clear.
    setSaving(true);
  }

  return (
    <tr>
      <td>
        <ImageUploadField
          name={`imageData_${id}`}
          uploadName={`imageUpload_${id}`}
          initialSrc={imageData || ''}
          disabled={!editing}
          label={`Product image for ${name}`}
          compact
          form={formId}
        />
      </td>
      <td>
        <input
          form={formId}
          name={`itemCode_${id}`}
          type="number"
          min={1}
          step={1}
          defaultValue={itemCode}
          required
          disabled={!editing}
          aria-label={`Item ID for ${name}`}
        />
      </td>
      <td>
        <input form={formId} name={`name_${id}`} defaultValue={name} required disabled={!editing} aria-label={`Name for item ${itemCode}`} />
      </td>
      <td>
        <input
          form={formId}
          name={`mrp_${id}`}
          type="number"
          min={0.01}
          step={0.01}
          defaultValue={mrp}
          required
          disabled={!editing}
          aria-label={`MRP for ${name}`}
        />
      </td>
      <td>
        <input
          form={formId}
          name={`piecesPerBox_${id}`}
          type="number"
          min={1}
          step={1}
          defaultValue={piecesPerBox}
          disabled={!editing}
          aria-label={`Pieces per box for ${name}`}
        />
      </td>
      <td>
        <input
          form={formId}
          name={`lowStockThreshold_${id}`}
          type="number"
          min={0}
          step={1}
          defaultValue={lowStockThreshold}
          disabled={!editing}
          aria-label={`Low stock threshold for ${name}`}
        />
      </td>
      <td>
        <label className="inline-check">
          <input form={formId} type="checkbox" name={`active_${id}`} defaultChecked={active} disabled={!editing} /> Active
        </label>
        <label className="inline-check">
          <input form={formId} type="checkbox" name={`hidden_${id}`} defaultChecked={hidden} disabled={!editing} /> Hidden
        </label>
      </td>
      <td>
        <form id={formId} action={action} onSubmit={guardSubmit}>
          <input type="hidden" name="itemId" value={id} />
        </form>
        {editing ? (
          <button className="btn secondary" type="submit" form={formId} disabled={saving} aria-busy={saving}>
            {saving && <span className="btn-spinner" aria-hidden="true" />}
            {saving ? 'Saving…' : 'Save'}
          </button>
        ) : (
          <button className="btn secondary" type="button" onClick={startEditing}>
            Edit
          </button>
        )}
      </td>
    </tr>
  );
}
