'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth';
import { makeBillNumber, objectId, withTransaction } from '@/lib/db';
import { int, itemRows, number } from '@/lib/helpers';
import type { ItemRow, SaleDoc, SaleItemDoc, StockMovementDoc } from '@/lib/types';

export interface SaleLinePayload {
  itemId: string;
  qty: number;
  free: boolean;
}

export interface SubmitSalePayload {
  lines: SaleLinePayload[];
  cashAmount: number;
  onlineAmount: number;
  customerName: string;
  remark: string;
}

export type SubmitSaleResult = { ok: true; billNumber: string } | { ok: false; error: string };

export async function submitSaleAction(payload: SubmitSalePayload): Promise<SubmitSaleResult> {
  const user = await getCurrentUser();
  if (!user || user.role !== 'manager') return { ok: false, error: 'Unauthorized' };

  try {
    const billNumber = await withTransaction(async (c, session) => {
      const rows = await itemRows(true);
      const rowById = new Map(rows.map((r) => [r.id, r]));
      const lines: { item: ItemRow; qty: number; isFree: boolean; lineTotal: number }[] = [];
      for (const l of payload.lines) {
        const qty = int(l.qty);
        if (qty <= 0) continue;
        const item = rowById.get(l.itemId);
        if (!item) throw new Error('Item not found');
        if (qty > item.mainFridgeQty) throw new Error(`Insufficient Main Fridge stock for ${item.name}`);
        const isFree = Boolean(l.free);
        lines.push({ item, qty, isFree, lineTotal: isFree ? 0 : qty * item.mrp });
      }
      if (!lines.length) throw new Error('Sale rejected: no items are selected');

      const total = lines.reduce((a, l) => a + l.lineTotal, 0);
      const cash = number(payload.cashAmount);
      const online = number(payload.onlineAmount);
      if (Math.abs(cash + online - total) > 0.009) throw new Error('Invalid payment amount: cash + online must equal bill total');

      const now = new Date();
      const billNumber = makeBillNumber();
      const sale = await c.sales.insertOne(
        {
          billNumber,
          managerId: objectId(user.id),
          totalAmount: total,
          cashAmount: cash,
          onlineAmount: online,
          remark: payload.remark || '',
          customerName: payload.customerName || '',
          type: 'sale',
          originalSaleId: null,
          createdAt: now,
          updatedAt: now
        } as SaleDoc,
        { session }
      );

      for (const l of lines) {
        const updated = await c.inventory.updateOne(
          { itemId: l.item._id, mainFridgeQty: { $gte: l.qty } },
          { $inc: { mainFridgeQty: -l.qty }, $set: { updatedAt: now } },
          { session }
        );
        if (!updated.modifiedCount) throw new Error(`Insufficient Main Fridge stock for ${l.item.name}`);
        const si = await c.saleItems.insertOne(
          {
            saleId: sale.insertedId,
            itemId: l.item._id,
            quantity: l.qty,
            mrp: l.item.mrp,
            isFree: l.isFree,
            lineTotal: l.lineTotal,
            originalSaleItemId: null,
            createdAt: now,
            updatedAt: now
          } as SaleItemDoc,
          { session }
        );
        await c.stockMovements.insertOne(
          {
            itemId: l.item._id,
            movementType: 'pos_sale',
            quantityPieces: -l.qty,
            quantityBoxes: -l.qty / l.item.piecesPerBox,
            sourceLocation: 'main_fridge',
            destinationLocation: 'customer',
            notes: 'POS sale',
            saleId: sale.insertedId,
            saleItemId: si.insertedId,
            createdBy: objectId(user.id),
            createdAt: now
          } as StockMovementDoc,
          { session }
        );
      }

      return billNumber;
    });

    revalidatePath('/manager/pos');
    revalidatePath('/manager');
    revalidatePath('/manager/stock');
    revalidatePath('/manager/returns');
    revalidatePath('/owner');
    revalidatePath('/owner/inventory');
    revalidatePath('/owner/movements');
    revalidatePath('/owner/reports');

    return { ok: true, billNumber };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
