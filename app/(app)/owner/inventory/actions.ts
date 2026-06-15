'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth';
import { objectId, withTransaction } from '@/lib/db';
import { int, itemRows } from '@/lib/helpers';
import type { StockMovementDoc } from '@/lib/types';

export async function updateInventoryAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'owner') redirect('/login');

  try {
    const rows = await itemRows(false);
    await withTransaction(async (c, session) => {
      for (const r of rows) {
        const main = int(formData.get(`main_${r.id}`));
        const second = int(formData.get(`second_${r.id}`));
        if (main < 0 || second < 0) throw new Error('Stock cannot be negative');
        const delta = main - r.mainFridgeQty + (second - r.secondFridgeQty) * r.piecesPerBox;
        await c.inventory.updateOne(
          { itemId: r._id },
          { $set: { mainFridgeQty: main, secondFridgeQty: second, updatedAt: new Date() } },
          { session }
        );
        if (delta !== 0) {
          await c.stockMovements.insertOne(
            {
              itemId: r._id,
              movementType: 'stock_adjustment',
              quantityPieces: delta,
              quantityBoxes: second - r.secondFridgeQty,
              sourceLocation: 'manual_adjustment',
              destinationLocation: 'inventory',
              notes: 'Owner bulk stock balance update',
              createdBy: objectId(user.id),
              createdAt: new Date()
            } as StockMovementDoc,
            { session }
          );
        }
      }
    });
  } catch (e) {
    redirect(`/owner/inventory?err=${encodeURIComponent((e as Error).message)}`);
  }

  revalidatePath('/owner/inventory');
  revalidatePath('/manager/movements');
  revalidatePath('/owner');
  revalidatePath('/manager/pos');
  revalidatePath('/manager/stock');
  redirect('/owner/inventory?ok=Inventory%20balances%20saved');
}
