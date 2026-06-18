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
          secondFridgeQty: { $ifNull: ['$inventory.secondFridgeQty', 0] },
          numericItemCode: { $convert: { input: '$itemCode', to: 'int', onError: 0, onNull: 0 } }
        }
      },
      { $sort: { numericItemCode: 1, name: 1 } }
    ])
    .toArray();
  return rows.map((r) => mapDoc(r as any)) as unknown as ItemRow[];
}

export async function todaySummary(managerId: string | ObjectId): Promise<TodaySummary> {
  const { from, to } = todayBounds();
  const { sales } = await getCollections();
  const [summary] = await sales
    .aggregate<TodaySummary>([
      { $match: { managerId: objectId(managerId), createdAt: { $gte: from, $lte: to } } },
      { $lookup: { from: 'sale_items', localField: '_id', foreignField: 'saleId', as: 'lineItems' } },
      {
        $group: {
          _id: null,
          total: { $sum: '$totalAmount' },
          cash: { $sum: '$cashAmount' },
          online: { $sum: '$onlineAmount' },
          pieces: { $sum: { $sum: '$lineItems.quantity' } }
        }
      },
      { $project: { _id: 0, total: 1, cash: 1, online: 1, pieces: 1 } }
    ])
    .toArray();
  return summary || { total: 0, cash: 0, online: 0, pieces: 0 };
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

export function pagination(q: { page?: string; limit?: string; pageSize?: string }, defaultLimit = 50) {
  const requestedLimit = Number(q.limit || q.pageSize);
  const allowed = [10, 25, 50, 100];
  const limit = allowed.includes(requestedLimit) ? requestedLimit : defaultLimit;
  const requestedPage = Number(q.page);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1;
  return { page, limit, skip: (page - 1) * limit };
}

export async function reports(range: DateRange, opts: { page?: number; limit?: number; all?: boolean } = {}): Promise<ReportResult> {
  const { sales } = await getCollections();
  const page = Math.max(1, Math.floor(opts.page || 1));
  const limit = Math.max(1, Math.min(5000, Math.floor(opts.limit || 50)));
  const skip = opts.all ? 0 : (page - 1) * limit;
  const pageStages = opts.all ? [] : [{ $skip: skip }, { $limit: limit }];
  const [result] = await sales
    .aggregate<any>([
      { $match: { createdAt: { $gte: range.from, $lte: range.to } } },
      { $sort: { createdAt: -1 } },
      { $lookup: { from: 'users', localField: 'managerId', foreignField: '_id', as: 'manager' } },
      { $unwind: '$manager' },
      { $lookup: { from: 'sale_items', localField: '_id', foreignField: 'saleId', as: 'lineItems' } },
      { $unwind: '$lineItems' },
      { $lookup: { from: 'items', localField: 'lineItems.itemId', foreignField: '_id', as: 'item' } },
      { $unwind: '$item' },
      {
        $facet: {
          rows: pageStages,
          rowCount: [{ $count: 'count' }],
          lineTotals: [
            {
              $group: {
                _id: null,
                gross: { $sum: { $cond: [{ $eq: ['$type', 'sale'] }, '$lineItems.lineTotal', 0] } },
                returns: { $sum: { $cond: [{ $eq: ['$type', 'return'] }, { $abs: '$lineItems.lineTotal' }, 0] } },
                pieces: { $sum: '$lineItems.quantity' }
              }
            }
          ]
        }
      }
    ])
    .toArray();

  const paymentTotals = await sales
    .aggregate<any>([
      { $match: { createdAt: { $gte: range.from, $lte: range.to } } },
      { $group: { _id: null, cash: { $sum: '$cashAmount' }, online: { $sum: '$onlineAmount' } } }
    ])
    .toArray();

  const mapped: ReportRow[] = ((result?.rows || []) as any[]).map((r) => ({
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
  const lineTotals = result?.lineTotals?.[0] || {};
  const payments = paymentTotals[0] || {};
  const totalRows = Number(result?.rowCount?.[0]?.count || 0);
  return {
    rows: mapped,
    totals: {
      gross: Number(lineTotals.gross || 0),
      returns: Number(lineTotals.returns || 0),
      pieces: Number(lineTotals.pieces || 0),
      cash: Number(payments.cash || 0),
      online: Number(payments.online || 0)
    },
    pagination: { page, limit, totalRows, totalPages: Math.max(1, Math.ceil(totalRows / limit)) }
  };
}

export async function getDashboardData(): Promise<DashboardData> {
  const { from, to } = todayBounds();
  const sevenDaysFrom = new Date(from);
  sevenDaysFrom.setDate(sevenDaysFrom.getDate() - 6);
  const { sales, users, stockMovements } = await getCollections();

  const [todaySales, trendRows, topItemRows, managers, inventory, movements] = await Promise.all([
    sales
      .aggregate<any>([
        { $match: { createdAt: { $gte: from, $lte: to } } },
        { $lookup: { from: 'sale_items', localField: '_id', foreignField: 'saleId', as: 'lineItems' } },
        {
          $group: {
            _id: null,
            total: { $sum: '$totalAmount' },
            cash: { $sum: '$cashAmount' },
            online: { $sum: '$onlineAmount' },
            pieces: { $sum: { $sum: '$lineItems.quantity' } }
          }
        }
      ])
      .toArray(),
    sales
      .aggregate<any>([
        { $match: { createdAt: { $gte: sevenDaysFrom, $lte: to } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, amount: { $sum: '$totalAmount' } } },
        { $sort: { _id: 1 } }
      ])
      .toArray(),
    sales
      .aggregate<any>([
        { $match: { createdAt: { $gte: from, $lte: to } } },
        { $lookup: { from: 'sale_items', localField: '_id', foreignField: 'saleId', as: 'lineItems' } },
        { $unwind: '$lineItems' },
        { $group: { _id: '$lineItems.itemId', qty: { $sum: '$lineItems.quantity' }, amount: { $sum: '$lineItems.lineTotal' } } },
        { $sort: { qty: -1 } },
        { $limit: 5 },
        { $lookup: { from: 'items', localField: '_id', foreignField: '_id', as: 'item' } },
        { $unwind: '$item' },
        { $project: { _id: 0, name: '$item.name', qty: 1, amount: 1 } }
      ])
      .toArray(),
    users.find({ role: 'manager' }, { projection: { name: 1 } }).sort({ name: 1 }).toArray(),
    itemRows(true),
    stockMovements
      .aggregate([
        { $sort: { createdAt: -1 } },
        { $limit: 8 },
        { $lookup: { from: 'items', localField: 'itemId', foreignField: '_id', as: 'item' } },
        { $unwind: '$item' }
      ])
      .toArray()
  ]);

  const summary = {
    total: Number(todaySales[0]?.total || 0),
    cash: Number(todaySales[0]?.cash || 0),
    online: Number(todaySales[0]?.online || 0)
  };
  const pieces = Number(todaySales[0]?.pieces || 0);
  const inventorySummary = inventory.reduce(
    (acc, i) => {
      acc.main += i.mainFridgeQty;
      acc.second += i.secondFridgeQty;
      if (i.mainFridgeQty <= i.lowStockThreshold) acc.low += 1;
      return acc;
    },
    { main: 0, second: 0, low: 0 }
  );

  const stats = (
    [
      ['Today’s total sales amount', `₹${money(summary.total)}`],
      ['Today’s total pieces sold', pieces],
      ['Today’s cash collection total', `₹${money(summary.cash)}`],
      ['Today’s online payment total', `₹${money(summary.online)}`],
      ['Main fridge pieces total', inventorySummary.main],
      ['Second fridge boxes total', inventorySummary.second],
      ['Low-stock item count', inventorySummary.low]
    ] as const
  ).map(([label, value]) => ({ label, value }));

  const trendByDay = new Map(trendRows.map((r) => [r._id, Number(r.amount || 0)]));
  const trend: { day: string; amount: number; heightPct: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(from);
    d.setDate(d.getDate() - i);
    const day = d.toISOString().slice(0, 10);
    trend.push({ day, amount: trendByDay.get(day) || 0, heightPct: 0 });
  }
  const trendMax = Math.max(...trend.map((t) => t.amount), 1);
  trend.forEach((t) => {
    t.heightPct = Math.min(100, Math.max(5, Math.round(((t.amount / trendMax) * 100) / 5) * 5));
  });

  const managerStats = await Promise.all(managers.map(async (m) => ({ name: m.name, ...(await todaySummary(m._id)) })));

  return {
    stats,
    summary,
    trend,
    inventory: inventory.filter((i) => i.mainFridgeQty <= i.lowStockThreshold),
    topItems: topItemRows as DashboardData['topItems'],
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

export async function movementHistory(filter: {
  itemId?: string;
  type?: string;
  page?: number;
  limit?: number;
}): Promise<{ rows: MovementRow[]; totalRows: number; totalPages: number; page: number; limit: number }> {
  const { stockMovements } = await getCollections();
  const match: Record<string, unknown> = {};
  if (filter.type) match.movementType = filter.type;
  if (filter.itemId) match.itemId = objectId(filter.itemId);
  const page = Math.max(1, Math.floor(filter.page || 1));
  const limit = Math.max(1, Math.min(100, Math.floor(filter.limit || 10)));
  const [result] = await stockMovements
    .aggregate([
      { $match: match },
      { $sort: { createdAt: -1 } },
      {
        $facet: {
          rows: [
            { $skip: (page - 1) * limit },
            { $limit: limit },
            { $lookup: { from: 'items', localField: 'itemId', foreignField: '_id', as: 'item' } },
            { $unwind: '$item' },
            { $lookup: { from: 'users', localField: 'createdBy', foreignField: '_id', as: 'creator' } },
            { $unwind: '$creator' }
          ],
          rowCount: [{ $count: 'count' }]
        }
      }
    ])
    .toArray();
  const totalRows = Number((result as any)?.rowCount?.[0]?.count || 0);
  return {
    rows: ((result as any)?.rows || []).map((r: any) => mapDoc(r)) as unknown as MovementRow[],
    totalRows,
    totalPages: Math.max(1, Math.ceil(totalRows / limit)),
    page,
    limit
  };
}
