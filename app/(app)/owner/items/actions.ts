'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth';
import { withTransaction } from '@/lib/db';
import { bool, itemRows } from '@/lib/helpers';
import { itemSchema, itemUpdateSchema } from '@/lib/validation';
import type { InventoryDoc, ItemDoc } from '@/lib/types';

function revalidateItemPages() {
  revalidatePath('/owner/items');
  revalidatePath('/owner/inventory');
  revalidatePath('/manager/movements');
  revalidatePath('/owner');
  revalidatePath('/manager/pos');
  revalidatePath('/manager/stock');
}

export async function addItemAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'owner') redirect('/login');

  const parsed = itemSchema.safeParse({
    itemCode: formData.get('itemCode'),
    name: formData.get('name'),
    mrp: formData.get('mrp'),
    piecesPerBox: formData.get('piecesPerBox'),
    lowStockThreshold: formData.get('lowStockThreshold'),
    imageData: formData.get('imageData') || ''
  });
  if (!parsed.success) {
    redirect(`/owner/items?err=${encodeURIComponent(parsed.error.issues[0]?.message || 'Invalid item data')}`);
  }
  const data = parsed.data;

  try {
    await withTransaction(async (c, session) => {
      const exists = await c.items.findOne(
        { $or: [{ itemCode: data.itemCode }, { name: data.name }] },
        { collation: { locale: 'en', strength: 2 }, session }
      );
      if (exists) throw new Error('Duplicate item ID or item name is not allowed');
      const now = new Date();
      const item = await c.items.insertOne(
        { ...data, active: true, hidden: false, createdAt: now, updatedAt: now } as ItemDoc,
        { session }
      );
      await c.inventory.insertOne(
        { itemId: item.insertedId, mainFridgeQty: 0, secondFridgeQty: 0, createdAt: now, updatedAt: now } as InventoryDoc,
        { session }
      );
    });
  } catch (e) {
    redirect(`/owner/items?err=${encodeURIComponent((e as Error).message)}`);
  }

  revalidateItemPages();
  redirect('/owner/items?ok=Item%20added%20successfully');
}

export async function updateItemAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'owner') redirect('/login');

  const itemId = String(formData.get('itemId') || '');
  const row = (await itemRows(false)).find((item) => item.id === itemId);
  if (!row) redirect('/owner/items?err=Item%20not%20found');

  try {
    const parsed = itemUpdateSchema.safeParse({
      itemCode: formData.get(`itemCode_${row.id}`),
      name: formData.get(`name_${row.id}`),
      mrp: formData.get(`mrp_${row.id}`),
      piecesPerBox: formData.get(`piecesPerBox_${row.id}`),
      lowStockThreshold: formData.get(`lowStockThreshold_${row.id}`),
      imageData: formData.get(`imageData_${row.id}`) || ''
    });
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || 'Invalid item data');
    const data = parsed.data;

    await withTransaction(async (c, session) => {
      const duplicate = await c.items.findOne(
        { _id: { $ne: row._id }, $or: [{ itemCode: data.itemCode }, { name: data.name }] },
        { collation: { locale: 'en', strength: 2 }, session }
      );
      if (duplicate) throw new Error(`Duplicate item ID or name near ${data.name}`);
      await c.items.updateOne(
        { _id: row._id },
        {
          $set: {
            ...data,
            active: bool(formData.get(`active_${row.id}`)),
            hidden: bool(formData.get(`hidden_${row.id}`)),
            updatedAt: new Date()
          }
        },
        { session }
      );
    });
  } catch (e) {
    redirect(`/owner/items?err=${encodeURIComponent((e as Error).message)}`);
  }

  revalidateItemPages();
  redirect('/owner/items?ok=Item%20updated%20successfully');
}
