import type { ObjectId } from 'mongodb';
import { getCollections, money, objectId, todayBounds } from './db';
import type {
  DashboardData,
  DateRange,
  ItemRow,
  ReportResult,
  ReportRow,
  ReturnableLine,
  StockDisplay,
  StockMovementDoc,
  TodaySummary
} from './types';

export const number = (v: unknown): number => Number(v || 0);
export const int = (v: unknown): number => Math.trunc(Number(v || 0));
export const bool = (v: unknown): boolean => v === true || v === '1' || v === 'on';
export const optionalNumber = (v: unknown, fallback = 0): number =>
  String(v ?? '').trim() === '' ? fallback : Number(v);

export function stockDisplay(row: { mainFridgeQty: number; secondFridgeQty: number; piecesPerBox: number }): StockDisplay {
  return {
    secondBoxes: Number(row.secondFridgeQty || 0),
    mainPieces: Number(row.mainFridgeQty || 0),
    secondPieces: Number(row.secondFridgeQty || 0) * Number(row.piecesPerBox || 0)
  };
}

export function dateRange(q: { from?: string; to?: string }): DateRange {
  const today = new Date().toISOString().slice(0, 10);
  const fromDate = q.from || today;
  const toDate = q.to || today;
  return {
    fromDate,
    toDate,
    from: new Date(`${fromDate}T00:00:00.000Z`),
    to: new Date(`${toDate}T23:59:59.999Z`)
  };
}

export function mapDoc<T extends { _id: ObjectId }>(doc: T): T & { id: string } {
  return { ...doc, id: String(doc._id) };
}

export async function itemRows(activeOnly = false): Promise<ItemRow[]> {
  const { items } = await getCollections();
  const match = activeOnly ? { active: true, hidden: false } : {};
  const rows = await items
    .aggregate([
      { $match: match },
      { $lookup: { from: 'inventory', localField: '_id', foreignField: 'itemId', as: 'inventory' } },
      { $unwind: { path: '$inventory', preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          mainFridgeQty: { $ifNull: ['$inventory.mainFridgeQty', 0] },
          secondFridgeQty: { $ifNull: ['$inventory.secondFridgeQty', 0] }
        }
      },
      { $sort: { name: 1 } }
    ])
    .toArray();
  return rows.map((r) => mapDoc(r as any)) as unknown as ItemRow[];
}

export async function todaySummary(managerId: string | ObjectId): Promise<TodaySummary> {
  const { from, to } = todayBounds();
  const { sales, saleItems } = await getCollections();
  const salesRows = await sales.find({ managerId: objectId(managerId), createdAt: { $gte: from, $lte: to } }).toArray();
  const saleIds = salesRows.map((s) => s._id);
  const items = saleIds.length ? await saleItems.find({ saleId: { $in: saleIds } }).toArray() : [];
  return {
    total: salesRows.reduce((a, s) => a + Number(s.totalAmount || 0), 0),
    cash: salesRows.reduce((a, s) => a + Number(s.cashAmount || 0), 0),
    online: salesRows.reduce((a, s) => a + Number(s.onlineAmount || 0), 0),
    pieces: items.reduce((a, i) => a + Number(i.quantity || 0), 0)
  };
}

export async function returnableLines(managerId: string | ObjectId): Promise<ReturnableLine[]> {
  const { from, to } = todayBounds();
  const { saleItems } = await getCollections();
  const rows = await saleItems
    .aggregate([
      { $lookup: { from: 'sales', localField: 'saleId', foreignField: '_id', as: 'sale' } },
      { $unwind: '$sale' },
      { $match: { 'sale.type': 'sale', 'sale.managerId': objectId(managerId), 'sale.createdAt': { $gte: from, $lte: to } } },
      { $lookup: { from: 'items', localField: 'itemId', foreignField: '_id', as: 'item' } },
      { $unwind: '$item' },
      { $lookup: { from: 'sale_items', localField: '_id', foreignField: 'originalSaleItemId', as: 'returns' } },
      { $addFields: { returnedQty: { $sum: { $map: { input: '$returns', as: 'r', in: { $abs: '$$r.quantity' } } } } } },
      { $sort: { 'sale.createdAt': -1 } }
    ])
    .toArray();
  return (rows as any[])
    .map((r) => ({
      ...mapDoc(r),
      saleId: String(r.sale._id),
      itemId: String(r.item._id),
      billNumber: r.sale.billNumber,
      name: r.item.name,
      itemCode: r.item.itemCode,
      returnedQty: Number(r.returnedQty || 0)
    }))
    .filter((r) => r.quantity - r.returnedQty > 0) as unknown as ReturnableLine[];
}

export async function reports(range: DateRange): Promise<ReportResult> {
  const { sales } = await getCollections();
  const rows = await sales
    .aggregate([
      { $match: { createdAt: { $gte: range.from, $lte: range.to } } },
      { $lookup: { from: 'users', localField: 'managerId', foreignField: '_id', as: 'manager' } },
      { $unwind: '$manager' },
      { $lookup: { from: 'sale_items', localField: '_id', foreignField: 'saleId', as: 'lineItems' } },
      { $unwind: '$lineItems' },
      { $lookup: { from: 'items', localField: 'lineItems.itemId', foreignField: '_id', as: 'item' } },
      { $unwind: '$item' },
      { $sort: { createdAt: -1 } }
    ])
    .toArray();
  const mapped: ReportRow[] = (rows as any[]).map((r) => ({
    id: String(r._id),
    billNumber: r.billNumber,
    managerName: r.manager.name,
    totalAmount: r.totalAmount,
    cashAmount: r.cashAmount,
    onlineAmount: r.onlineAmount,
    remark: r.remark,
    customerName: r.customerName || '',
    type: r.type,
    originalSaleId: r.originalSaleId ? String(r.originalSaleId) : '',
    createdAt: r.createdAt,
    saleItemId: String(r.lineItems._id),
    quantity: r.lineItems.quantity,
    mrp: r.lineItems.mrp,
    isFree: r.lineItems.isFree,
    lineTotal: r.lineItems.lineTotal,
    originalSaleItemId: r.lineItems.originalSaleItemId ? String(r.lineItems.originalSaleItemId) : '',
    itemCode: r.item.itemCode,
    itemName: r.item.name
  }));
  const saleMap = new Map(mapped.map((r) => [r.id, r]));
  return {
    rows: mapped,
    totals: {
      gross: mapped.filter((r) => r.type === 'sale').reduce((a, r) => a + Number(r.lineTotal || 0), 0),
      returns: mapped.filter((r) => r.type === 'return').reduce((a, r) => a + Math.abs(Number(r.lineTotal || 0)), 0),
      pieces: mapped.reduce((a, r) => a + Number(r.quantity || 0), 0),
      cash: [...saleMap.values()].reduce((a, r) => a + Number(r.cashAmount || 0), 0),
      online: [...saleMap.values()].reduce((a, r) => a + Number(r.onlineAmount || 0), 0)
    }
  };
}

export async function getDashboardData(): Promise<DashboardData> {
  const { from, to } = todayBounds();
  const { sales, users, stockMovements } = await getCollections();
  const salesRows = await sales.find({ createdAt: { $gte: from, $lte: to } }).toArray();
  const saleIds = salesRows.map((s) => s._id);
  const { saleItems } = await getCollections();
  const saleItemRows = saleIds.length ? await saleItems.find({ saleId: { $in: saleIds } }).toArray() : [];
  const inventory = await itemRows(true);

  const summary = {
    total: salesRows.reduce((a, s) => a + Number(s.totalAmount || 0), 0),
    cash: salesRows.reduce((a, s) => a + Number(s.cashAmount || 0), 0),
    online: salesRows.reduce((a, s) => a + Number(s.onlineAmount || 0), 0)
  };
  const pieces = saleItemRows.reduce((a, i) => a + Number(i.quantity || 0), 0);
  const profitValue = saleItemRows.reduce((a, si) => {
    const item = inventory.find((i) => String(i._id) === String(si.itemId));
    return a + (Number(si.lineTotal || 0) * Number(item?.profitPercentage || 0)) / 100;
  }, 0);
  const main = inventory.reduce((a, i) => a + i.mainFridgeQty, 0);
  const second = inventory.reduce((a, i) => a + i.secondFridgeQty, 0);
  const low = inventory.filter((i) => i.mainFridgeQty <= i.lowStockThreshold).length;

  const stats = (
    [
      ['Today’s total sales amount', `₹${money(summary.total)}`],
      ['Today’s total pieces sold', pieces],
      ['Today’s cash collection total', `₹${money(summary.cash)}`],
      ['Today’s online payment total', `₹${money(summary.online)}`],
      ['Profit value', `₹${money(profitValue)}`],
      ['Main fridge pieces total', main],
      ['Second fridge boxes total', second],
      ['Low-stock item count', low]
    ] as const
  ).map(([label, value]) => ({ label, value }));

  const trend: { day: string; amount: number; heightPct: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const end = new Date(d);
    end.setHours(23, 59, 59, 999);
    const amountRows = await sales.find({ createdAt: { $gte: d, $lte: end } }).toArray();
    trend.push({ day: d.toISOString().slice(0, 10), amount: amountRows.reduce((a, s) => a + Number(s.totalAmount || 0), 0), heightPct: 0 });
  }
  const trendMax = Math.max(...trend.map((t) => t.amount), 1);
  trend.forEach((t) => {
    t.heightPct = Math.min(100, Math.max(5, Math.round(((t.amount / trendMax) * 100) / 5) * 5));
  });

  const itemById = new Map(inventory.map((i) => [String(i._id), i]));
  const topItems = Object.values(
    saleItemRows.reduce<Record<string, { name: string; qty: number; amount: number }>>((acc, si) => {
      const key = String(si.itemId);
      const item = itemById.get(key);
      if (!item) return acc;
      acc[key] ||= { name: item.name, qty: 0, amount: 0 };
      acc[key].qty += si.quantity;
      acc[key].amount += si.lineTotal;
      return acc;
    }, {})
  )
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);

  const managers = await users.find({ role: 'manager' }).sort({ name: 1 }).toArray();
  const managerStats = await Promise.all(managers.map(async (m) => ({ name: m.name, ...(await todaySummary(m._id)) })));

  const movements = await stockMovements
    .aggregate([
      { $sort: { createdAt: -1 } },
      { $limit: 8 },
      { $lookup: { from: 'items', localField: 'itemId', foreignField: '_id', as: 'item' } },
      { $unwind: '$item' }
    ])
    .toArray();

  return {
    stats,
    summary,
    trend,
    inventory: inventory.filter((i) => i.mainFridgeQty <= i.lowStockThreshold),
    topItems,
    managers: managerStats,
    movements: (movements as any[]).map((m) => ({ ...mapDoc(m), name: m.item.name })) as unknown as DashboardData['movements']
  };
}

export const MOVEMENT_TYPES = ['stock_adjustment', 'transfer_second_to_main', 'vendor_stock_in', 'vendor_return', 'pos_sale', 'return_movement'] as const;

export interface MovementRow extends StockMovementDoc {
  id: string;
  item: { name: string };
  creator: { name: string };
}

export async function movementHistory(filter: { itemId?: string; type?: string }): Promise<MovementRow[]> {
  const { stockMovements } = await getCollections();
  const match: Record<string, unknown> = {};
  if (filter.type) match.movementType = filter.type;
  if (filter.itemId) match.itemId = objectId(filter.itemId);
  const rows = await stockMovements
    .aggregate([
      { $match: match },
      { $sort: { createdAt: -1 } },
      { $limit: 200 },
      { $lookup: { from: 'items', localField: 'itemId', foreignField: '_id', as: 'item' } },
      { $unwind: '$item' },
      { $lookup: { from: 'users', localField: 'createdBy', foreignField: '_id', as: 'creator' } },
      { $unwind: '$creator' }
    ])
    .toArray();
  return rows.map((r) => mapDoc(r as any)) as unknown as MovementRow[];
}
