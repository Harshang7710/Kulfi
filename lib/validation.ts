import { z } from 'zod';
import { optionalNumber } from './helpers';

/** Add-item schema — used by app/(app)/owner/items/actions.ts#addItemAction */
export const itemSchema = z.object({
  itemCode: z.coerce.number().int().positive().transform(String),
  name: z.string().min(1),
  mrp: z.coerce.number().positive(),
  profitPercentage: z.preprocess((v) => optionalNumber(v, 0), z.number().min(0)),
  piecesPerBox: z.preprocess((v) => optionalNumber(v, 1), z.number().int().positive()),
  lowStockThreshold: z.preprocess((v) => optionalNumber(v, 0), z.number().int().min(0)),
  imageData: z.string().max(600000).optional().default('')
});

/** Per-row bulk catalog edit schema (no image field) — used by updateItemsAction */
export const itemUpdateSchema = itemSchema.omit({ imageData: true });

/** Stock movement schema — used by recordMovementAction */
export const movementSchema = z.object({
  movementAction: z.enum(['transfer_second_to_main', 'vendor_stock_in', 'vendor_return']),
  itemId: z.string().min(1),
  boxes: z.coerce.number().int().positive(),
  notes: z.string().trim().max(500).optional().default('')
});
export type MovementAction = z.infer<typeof movementSchema>['movementAction'];

/** Create-user schema — used by createUserAction */
export const userSchema = z.object({
  userId: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email(),
  role: z.enum(['owner', 'manager']),
  password: z.string().min(8)
});

/** Password setup schema — used by passwordSetupAction */
export const passwordSetupSchema = z.object({
  password: z.string().min(8),
  confirmPassword: z.string().min(8)
});

/** Login schema — used by loginAction */
export const loginSchema = z.object({
  identifier: z.string().trim().min(1),
  password: z.string().min(1)
});

/** Returns schema — used by submitReturnAction */
export const returnSchema = z.object({
  saleItemId: z.string().min(1),
  quantity: z.coerce.number().int().positive()
});

/** POS sale schema — validates all client-provided billing data at the server boundary. */
export const saleSchema = z.object({
  lines: z
    .array(
      z.object({
        itemId: z.string().min(1),
        qty: z.coerce.number().int().positive(),
        free: z.boolean()
      })
    )
    .min(1, 'Sale rejected: no items are selected')
    .max(100),
  cashAmount: z.coerce.number().finite().min(0),
  onlineAmount: z.coerce.number().finite().min(0),
  customerName: z.string().trim().max(120),
  remark: z.string().trim().max(500)
});
