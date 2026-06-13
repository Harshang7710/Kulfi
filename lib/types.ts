import type { ObjectId } from 'mongodb';

export type Role = 'owner' | 'manager';

export interface UserDoc {
  _id: ObjectId;
  userId?: string;
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  mustChangePassword: boolean;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ItemDoc {
  _id: ObjectId;
  itemCode: string;
  name: string;
  mrp: number;
  profitPercentage: number;
  piecesPerBox: number;
  lowStockThreshold: number;
  imageData?: string;
  active: boolean;
  hidden: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface InventoryDoc {
  _id: ObjectId;
  itemId: ObjectId;
  mainFridgeQty: number;
  secondFridgeQty: number;
  createdAt: Date;
  updatedAt: Date;
}

export type SaleType = 'sale' | 'return';

export interface SaleDoc {
  _id: ObjectId;
  billNumber: string;
  managerId: ObjectId;
  totalAmount: number;
  cashAmount: number;
  onlineAmount: number;
  remark: string;
  customerName: string;
  type: SaleType;
  originalSaleId: ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SaleItemDoc {
  _id: ObjectId;
  saleId: ObjectId;
  itemId: ObjectId;
  quantity: number;
  mrp: number;
  isFree: boolean;
  lineTotal: number;
  originalSaleItemId: ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface StockMovementDoc {
  _id: ObjectId;
  itemId: ObjectId;
  movementType: string;
  quantityPieces: number;
  quantityBoxes: number;
  sourceLocation?: string;
  destinationLocation?: string;
  notes?: string;
  saleId?: ObjectId;
  saleItemId?: ObjectId;
  createdBy: ObjectId;
  createdAt: Date;
}

/** JWT session payload */
export interface SessionPayload {
  id: string;
  role: Role;
  name: string;
  email: string;
  userId?: string;
}

/** Authoritative current-user record, re-fetched from MongoDB on every request */
export interface CurrentUser {
  id: string;
  _id: ObjectId;
  userId?: string;
  name: string;
  email: string;
  role: Role;
  mustChangePassword: boolean;
  active: boolean;
}

/** Item joined with its inventory levels, as returned by itemRows() */
export interface ItemRow {
  id: string;
  _id: ObjectId;
  itemCode: string;
  name: string;
  mrp: number;
  profitPercentage: number;
  piecesPerBox: number;
  lowStockThreshold: number;
  imageData?: string;
  active: boolean;
  hidden: boolean;
  mainFridgeQty: number;
  secondFridgeQty: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface StockDisplay {
  secondBoxes: number;
  mainPieces: number;
  secondPieces: number;
}

export interface TodaySummary {
  total: number;
  cash: number;
  online: number;
  pieces: number;
}

export interface ReturnableLine {
  id: string;
  saleId: string;
  itemId: string;
  billNumber: string;
  name: string;
  itemCode: string;
  quantity: number;
  mrp: number;
  isFree: boolean;
  returnedQty: number;
}

export interface ReportRow {
  id: string;
  billNumber: string;
  managerName: string;
  totalAmount: number;
  cashAmount: number;
  onlineAmount: number;
  remark: string;
  customerName: string;
  type: SaleType;
  originalSaleId: string;
  createdAt: Date;
  saleItemId: string;
  quantity: number;
  mrp: number;
  isFree: boolean;
  lineTotal: number;
  originalSaleItemId: string;
  itemCode: string;
  itemName: string;
}

export interface ReportResult {
  rows: ReportRow[];
  totals: {
    gross: number;
    returns: number;
    pieces: number;
    cash: number;
    online: number;
  };
}

export interface DateRange {
  fromDate: string;
  toDate: string;
  from: Date;
  to: Date;
}

export interface DashboardStat {
  label: string;
  value: string | number;
}

export interface DashboardTrendPoint {
  day: string;
  amount: number;
  heightPct: number;
}

export interface DashboardTopItem {
  name: string;
  qty: number;
  amount: number;
}

export interface DashboardManagerStat extends TodaySummary {
  name: string;
}

export interface DashboardMovement extends StockMovementDoc {
  id: string;
  name: string;
}

export interface DashboardData {
  stats: DashboardStat[];
  summary: { total: number; cash: number; online: number };
  trend: DashboardTrendPoint[];
  inventory: ItemRow[];
  topItems: DashboardTopItem[];
  managers: DashboardManagerStat[];
  movements: DashboardMovement[];
}
