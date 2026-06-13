'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth';
import { makeBillNumber, objectId, withTransaction } from '@/lib/db';
import { returnableLines } from '@/lib/helpers';
import { returnSchema } from '@/lib/validation';
import type { SaleDoc, SaleItemDoc, StockMovementDoc } from '@/lib/types';

export async function submitReturnAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'manager') redirect('/login');

  const parsed = returnSchema.safeParse({
    saleItemId: formData.get('saleItemId'),
    quantity: formData.get('quantity')
  });
  if (!parsed.success) {
    redirect(`/manager/returns?err=${encodeURIComponent(parsed.error.issues[0]?.message || 'Invalid return request')}`);
  }
  const data = parsed.data;

  try {
    await withTransaction(async (c, session) => {
      const rows = await returnableLines(user.id);
      const line = rows.find((r) => String(r.id) === String(data.saleItemId));
      if (!line) throw new Error('Sale line not found or not returnable today by this manager');
      const remaining = line.quantity - line.returnedQty;
      if (data.quantity > remaining) throw new Error('Return quantity cannot exceed remaining returnable quantity');
      const refund = line.isFree ? 0 : data.quantity * line.mrp;
      const now = new Date();
      const sale = await c.sales.insertOne(
        {
          billNumber: makeBillNumber('RET'),
          managerId: objectId(user.id),
          totalAmount: -refund,
          cashAmount: -refund,
          onlineAmount: 0,
          remark: `Return against ${line.billNumber}`,
          customerName: '',
          type: 'return',
          originalSaleId: objectId(line.saleId),
          createdAt: now,
          updatedAt: now
        } as SaleDoc,
        { session }
      );
      const si = await c.saleItems.insertOne(
        {
          saleId: sale.insertedId,
          itemId: objectId(line.itemId),
          quantity: -data.quantity,
          mrp: line.mrp,
          isFree: line.isFree,
          lineTotal: -refund,
          originalSaleItemId: objectId(line.id),
          createdAt: now,
          updatedAt: now
        } as SaleItemDoc,
        { session }
      );
      await c.inventory.updateOne(
        { itemId: objectId(line.itemId) },
        { $inc: { mainFridgeQty: data.quantity }, $set: { updatedAt: now } },
        { session }
      );
      await c.stockMovements.insertOne(
        {
          itemId: objectId(line.itemId),
          movementType: 'return_movement',
          quantityPieces: data.quantity,
          quantityBoxes: 0,
          sourceLocation: 'customer',
          destinationLocation: 'main_fridge',
          notes: 'POS return',
          saleId: sale.insertedId,
          saleItemId: si.insertedId,
          createdBy: objectId(user.id),
          createdAt: now
        } as StockMovementDoc,
        { session }
      );
    });
  } catch (e) {
    redirect(`/manager/returns?err=${encodeURIComponent((e as Error).message)}`);
  }

  revalidatePath('/manager/returns');
  revalidatePath('/manager');
  revalidatePath('/manager/stock');
  revalidatePath('/manager/pos');
  revalidatePath('/owner');
  revalidatePath('/owner/inventory');
  revalidatePath('/owner/movements');
  revalidatePath('/owner/reports');
  redirect('/manager/returns?ok=Return%20processed%20and%20stock%20added%20to%20Main%20Fridge');
}
