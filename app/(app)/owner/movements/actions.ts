'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth';
import { objectId, withTransaction } from '@/lib/db';
import { movementSchema } from '@/lib/validation';
import type { StockMovementDoc } from '@/lib/types';

export async function recordMovementAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'owner') redirect('/login');

  const parsed = movementSchema.safeParse({
    movementAction: formData.get('movementAction'),
    itemId: formData.get('itemId'),
    boxes: formData.get('boxes'),
    notes: formData.get('notes')
  });
  if (!parsed.success) {
    redirect(`/owner/movements?err=${encodeURIComponent(parsed.error.issues[0]?.message || 'Invalid movement data')}`);
  }
  const data = parsed.data;

  try {
    await withTransaction(async (c, session) => {
      const itemId = objectId(data.itemId);
      const item = await c.items.findOne({ _id: itemId }, { session });
      if (!item) throw new Error('Item not found');
      const pieces = data.boxes * Number(item.piecesPerBox || 1);
      const now = new Date();
      const base = { itemId, quantityBoxes: data.boxes, createdBy: objectId(user.id), createdAt: now, notes: data.notes || '' };

      if (data.movementAction === 'transfer_second_to_main') {
        const updated = await c.inventory.updateOne(
          { itemId, secondFridgeQty: { $gte: data.boxes } },
          { $inc: { secondFridgeQty: -data.boxes, mainFridgeQty: pieces }, $set: { updatedAt: now } },
          { session }
        );
        if (!updated.modifiedCount) throw new Error('Second Fridge boxes are insufficient');
        await c.stockMovements.insertOne(
          { ...base, movementType: 'transfer_second_to_main', quantityPieces: pieces, sourceLocation: 'second_fridge', destinationLocation: 'main_fridge' } as StockMovementDoc,
          { session }
        );
      } else if (data.movementAction === 'vendor_stock_in') {
        await c.inventory.updateOne({ itemId }, { $inc: { secondFridgeQty: data.boxes }, $set: { updatedAt: now } }, { session });
        await c.stockMovements.insertOne(
          { ...base, movementType: 'vendor_stock_in', quantityPieces: pieces, sourceLocation: 'vendor', destinationLocation: 'second_fridge' } as StockMovementDoc,
          { session }
        );
      } else {
        const updated = await c.inventory.updateOne(
          { itemId, secondFridgeQty: { $gte: data.boxes } },
          { $inc: { secondFridgeQty: -data.boxes }, $set: { updatedAt: now } },
          { session }
        );
        if (!updated.modifiedCount) throw new Error('Second Fridge boxes are insufficient for vendor return');
        await c.stockMovements.insertOne(
          { ...base, movementType: 'vendor_return', quantityPieces: -pieces, quantityBoxes: -data.boxes, sourceLocation: 'second_fridge', destinationLocation: 'vendor' } as StockMovementDoc,
          { session }
        );
      }
    });
  } catch (e) {
    redirect(`/owner/movements?err=${encodeURIComponent((e as Error).message)}`);
  }

  revalidatePath('/owner/movements');
  revalidatePath('/owner/inventory');
  revalidatePath('/owner');
  revalidatePath('/manager/pos');
  revalidatePath('/manager/stock');
  redirect('/owner/movements?ok=Movement%20recorded%20successfully');
}
