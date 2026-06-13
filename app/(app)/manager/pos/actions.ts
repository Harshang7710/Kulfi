'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth';
import { makeBillNumber, objectId, withTransaction } from '@/lib/db';
import { itemRows } from '@/lib/helpers';
import type { ItemRow, SaleDoc, SaleItemDoc, StockMovementDoc } from '@/lib/types';
import { saleSchema } from '@/lib/validation';

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

  const parsed = saleSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message || 'Invalid sale data' };
  }
  const data = parsed.data;

  try {
    const billNumber = await withTransaction(async (c, session) => {
      const rows = await itemRows(true);
      const rowById = new Map(rows.map((row) => [row.id, row]));
      const lines: { item: ItemRow; qty: number; isFree: boolean; lineTotal: number }[] = [];

      for (const line of data.lines) {
        const item = rowById.get(line.itemId);
        if (!item) throw new Error('Item not found or no longer active');
        if (line.qty > item.mainFridgeQty) throw new Error(`Insufficient Main Fridge stock for ${item.name}`);
        lines.push({
          item,
          qty: line.qty,
          isFree: line.free,
          lineTotal: line.free ? 0 : line.qty * item.mrp
        });
      }

      const total = lines.reduce((sum, line) => sum + line.lineTotal, 0);
      if (Math.abs(data.cashAmount + data.onlineAmount - total) > 0.009) {
        throw new Error('Invalid payment amount: cash + online must equal bill total');
      }

      const now = new Date();
      const billNumber = makeBillNumber();
      const sale = await c.sales.insertOne(
        {
          billNumber,
          managerId: objectId(user.id),
          totalAmount: total,
          cashAmount: data.cashAmount,
          onlineAmount: data.onlineAmount,
          remark: data.remark,
          customerName: data.customerName,
          type: 'sale',
          originalSaleId: null,
          createdAt: now,
          updatedAt: now
        } as SaleDoc,
        { session }
      );

      for (const line of lines) {
        const updated = await c.inventory.updateOne(
          { itemId: line.item._id, mainFridgeQty: { $gte: line.qty } },
          { $inc: { mainFridgeQty: -line.qty }, $set: { updatedAt: now } },
          { session }
        );
        if (!updated.modifiedCount) throw new Error(`Insufficient Main Fridge stock for ${line.item.name}`);

        const saleItem = await c.saleItems.insertOne(
          {
            saleId: sale.insertedId,
            itemId: line.item._id,
            quantity: line.qty,
            mrp: line.item.mrp,
            isFree: line.isFree,
            lineTotal: line.lineTotal,
            originalSaleItemId: null,
            createdAt: now,
            updatedAt: now
          } as SaleItemDoc,
          { session }
        );

        await c.stockMovements.insertOne(
          {
            itemId: line.item._id,
            movementType: 'pos_sale',
            quantityPieces: -line.qty,
            quantityBoxes: -line.qty / line.item.piecesPerBox,
            sourceLocation: 'main_fridge',
            destinationLocation: 'customer',
            notes: 'POS sale',
            saleId: sale.insertedId,
            saleItemId: saleItem.insertedId,
            createdBy: objectId(user.id),
            createdAt: now
          } as StockMovementDoc,
          { session }
        );
      }

      return billNumber;
    });

    for (const path of [
      '/manager/pos',
      '/manager',
      '/manager/stock',
      '/manager/returns',
      '/owner',
      '/owner/inventory',
      '/owner/movements',
      '/owner/reports'
    ]) {
      revalidatePath(path);
    }

    return { ok: true, billNumber };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Unable to save the sale' };
  }
}
