const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const morgan = require('morgan');
const bcrypt = require('bcryptjs');
const { stringify } = require('csv-stringify/sync');
const { z } = require('zod');
const { connect, collections, seedIfEmpty, todayBounds, money, makeBillNumber, objectId, withTransaction, databaseConfigSummary } = require('./db');
const { attachUser, requireRole, login, setSessionCookie, clearSessionCookie } = require('./auth');
const { validateEnv, csrfProtection, authLimiter } = require('./security');

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      formAction: ["'self'"],
      frameAncestors: ["'none'"]
    }
  }
}));
app.use(morgan('dev'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get(['/favicon.ico', '/favicon.png'], (req, res) => res.redirect(302, '/logo.svg'));
app.use(csrfProtection);

const PORT = process.env.PORT || 3000;
const aw = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
let startupPromise;

async function ensureRuntimeReady() {
  if (!startupPromise) {
    startupPromise = Promise.resolve()
      .then(() => validateEnv())
      .then(() => connect())
      .then(() => seedIfEmpty())
      .catch((error) => {
        startupPromise = null;
        throw error;
      });
  }
  await startupPromise;
}
const notice = (req) => req.query.ok ? { type: 'success', message: req.query.ok } : req.query.err ? { type: 'error', message: req.query.err } : null;
const redirectWith = (res, path, key, msg) => res.redirect(`${path}?${key}=${encodeURIComponent(msg)}`);
const number = (v) => Number(v || 0);
const int = (v) => Math.trunc(Number(v || 0));
const bool = (v) => v === true || v === '1' || v === 'on';
const optionalNumber = (v, fallback = 0) => String(v ?? '').trim() === '' ? fallback : Number(v);
const stockDisplay = (row) => ({ secondBoxes: Number(row.secondFridgeQty || 0), mainPieces: Number(row.mainFridgeQty || 0), secondPieces: Number(row.secondFridgeQty || 0) * Number(row.piecesPerBox || 0) });

function render(req, res, view, data = {}) {
  const baseData = { ...data, user: req.user, path: req.path, notice: notice(req), money, isProduction: process.env.NODE_ENV === 'production' };
  if (data.status) res.status(data.status);
  res.render(view, baseData, (viewError, body) => {
    if (viewError) {
      console.error(viewError);
      return res.status(500).send('Unable to render the requested page. Please verify deployment assets are included.');
    }

    return res.render('layout', { ...baseData, title: data.title || 'Dashboard', body }, (layoutError, html) => {
      if (layoutError) {
        console.error(layoutError);
        return res.status(500).send('Unable to render the application layout. Please try again.');
      }
      return res.send(html);
    });
  });
}

function dateRange(q) {
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

function mapDoc(doc) {
  if (!doc) return doc;
  return { ...doc, id: String(doc._id), _id: doc._id };
}

async function itemRows(activeOnly = false) {
  const c = collections();
  const match = activeOnly ? { active: true, hidden: false } : {};
  const rows = await c.items.aggregate([
    { $match: match },
    { $lookup: { from: 'inventory', localField: '_id', foreignField: 'itemId', as: 'inventory' } },
    { $unwind: { path: '$inventory', preserveNullAndEmptyArrays: true } },
    { $addFields: { mainFridgeQty: { $ifNull: ['$inventory.mainFridgeQty', 0] }, secondFridgeQty: { $ifNull: ['$inventory.secondFridgeQty', 0] } } },
    { $sort: { name: 1 } }
  ]).toArray();
  return rows.map(mapDoc);
}

async function todaySummary(managerId) {
  const { from, to } = todayBounds();
  const c = collections();
  const sales = await c.sales.find({ managerId: objectId(managerId), createdAt: { $gte: from, $lte: to } }).toArray();
  const saleIds = sales.map(s => s._id);
  const items = saleIds.length ? await c.saleItems.find({ saleId: { $in: saleIds } }).toArray() : [];
  return {
    total: sales.reduce((a, s) => a + Number(s.totalAmount || 0), 0),
    cash: sales.reduce((a, s) => a + Number(s.cashAmount || 0), 0),
    online: sales.reduce((a, s) => a + Number(s.onlineAmount || 0), 0),
    pieces: items.reduce((a, i) => a + Number(i.quantity || 0), 0)
  };
}

async function returnableLines(managerId) {
  const { from, to } = todayBounds();
  const c = collections();
  const rows = await c.saleItems.aggregate([
    { $lookup: { from: 'sales', localField: 'saleId', foreignField: '_id', as: 'sale' } },
    { $unwind: '$sale' },
    { $match: { 'sale.type': 'sale', 'sale.managerId': objectId(managerId), 'sale.createdAt': { $gte: from, $lte: to } } },
    { $lookup: { from: 'items', localField: 'itemId', foreignField: '_id', as: 'item' } },
    { $unwind: '$item' },
    { $lookup: { from: 'sale_items', localField: '_id', foreignField: 'originalSaleItemId', as: 'returns' } },
    { $addFields: { returnedQty: { $sum: { $map: { input: '$returns', as: 'r', in: { $abs: '$$r.quantity' } } } } } },
    { $sort: { 'sale.createdAt': -1 } }
  ]).toArray();
  return rows.map(r => ({
    ...mapDoc(r),
    saleId: String(r.sale._id),
    itemId: String(r.item._id),
    billNumber: r.sale.billNumber,
    name: r.item.name,
    itemCode: r.item.itemCode,
    returnedQty: Number(r.returnedQty || 0)
  })).filter(r => r.quantity - r.returnedQty > 0);
}

async function reports(range) {
  const c = collections();
  const rows = await c.sales.aggregate([
    { $match: { createdAt: { $gte: range.from, $lte: range.to } } },
    { $lookup: { from: 'users', localField: 'managerId', foreignField: '_id', as: 'manager' } },
    { $unwind: '$manager' },
    { $lookup: { from: 'sale_items', localField: '_id', foreignField: 'saleId', as: 'lineItems' } },
    { $unwind: '$lineItems' },
    { $lookup: { from: 'items', localField: 'lineItems.itemId', foreignField: '_id', as: 'item' } },
    { $unwind: '$item' },
    { $sort: { createdAt: -1 } }
  ]).toArray();
  const mapped = rows.map(r => ({
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
  const saleMap = new Map(mapped.map(r => [r.id, r]));
  return {
    rows: mapped,
    totals: {
      gross: mapped.filter(r => r.type === 'sale').reduce((a, r) => a + Number(r.lineTotal || 0), 0),
      returns: mapped.filter(r => r.type === 'return').reduce((a, r) => a + Math.abs(Number(r.lineTotal || 0)), 0),
      pieces: mapped.reduce((a, r) => a + Number(r.quantity || 0), 0),
      cash: [...saleMap.values()].reduce((a, r) => a + Number(r.cashAmount || 0), 0),
      online: [...saleMap.values()].reduce((a, r) => a + Number(r.onlineAmount || 0), 0)
    }
  };
}

app.use(aw(async (req, res, next) => {
  await ensureRuntimeReady();
  next();
}));
app.use(aw(attachUser));

app.get('/', (req, res) => res.redirect(req.user ? (req.user.role === 'owner' ? '/owner' : '/manager') : '/login'));
app.get('/login', (req, res) => req.user ? res.redirect(req.user.role === 'owner' ? '/owner' : '/manager') : render(req, res, 'login', { title: 'Login', error: req.query.err, next: req.query.next }));
app.post('/login', authLimiter, aw(async (req, res) => {
  const user = await login(req.body.identifier || req.body.email, req.body.password);
  if (!user) return res.redirect('/login?err=Invalid%20user%20ID/email%20or%20password');
  setSessionCookie(res, user);
  if (user.mustChangePassword) return res.redirect(`/password-setup?next=${encodeURIComponent(req.body.next || '')}`);
  res.redirect(req.body.next || (user.role === 'owner' ? '/owner' : '/manager'));
}));
app.get('/password-setup', aw(async (req, res) => {
  if (!req.user) return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
  render(req, res, 'login', { title: 'Set New Password', mode: 'passwordSetup', error: req.query.err, next: req.query.next });
}));
app.post('/password-setup', aw(async (req, res) => {
  if (!req.user) return res.redirect('/login');
  try {
    const data = z.object({ password: z.string().min(8), confirmPassword: z.string().min(8), next: z.string().optional() }).parse(req.body);
    if (data.password !== data.confirmPassword) throw new Error('New password and confirmation do not match');
    await collections().users.updateOne({ _id: objectId(req.user.id) }, { $set: { passwordHash: bcrypt.hashSync(data.password, 12), mustChangePassword: false, updatedAt: new Date() } });
    const user = await collections().users.findOne({ _id: objectId(req.user.id) });
    setSessionCookie(res, { ...user, mustChangePassword: false });
    res.redirect(data.next || (user.role === 'owner' ? '/owner' : '/manager'));
  } catch (e) {
    res.redirect(`/password-setup?err=${encodeURIComponent(e.message)}&next=${encodeURIComponent(req.body.next || '')}`);
  }
}));
app.post('/logout', (req, res) => { clearSessionCookie(res); res.redirect('/login'); });
app.get('/health', aw(async (req, res) => {
  try {
    await collections().users.findOne({}, { projection: { _id: 1 } });
    res.json({ ok: true, database: 'mongodb reachable' });
  } catch {
    res.status(503).json({ ok: false, error: 'Database is not reachable' });
  }
}));

app.get('/owner', requireRole('owner'), aw(async (req, res) => {
  const { from, to } = todayBounds();
  const c = collections();
  const sales = await c.sales.find({ createdAt: { $gte: from, $lte: to } }).toArray();
  const saleIds = sales.map(s => s._id);
  const saleItems = saleIds.length ? await c.saleItems.find({ saleId: { $in: saleIds } }).toArray() : [];
  const inventory = await itemRows(true);
  const summary = {
    total: sales.reduce((a, s) => a + Number(s.totalAmount || 0), 0),
    cash: sales.reduce((a, s) => a + Number(s.cashAmount || 0), 0),
    online: sales.reduce((a, s) => a + Number(s.onlineAmount || 0), 0)
  };
  const pieces = saleItems.reduce((a, i) => a + Number(i.quantity || 0), 0);
  const profitValue = saleItems.reduce((a, si) => {
    const item = inventory.find(i => String(i._id) === String(si.itemId));
    return a + Number(si.lineTotal || 0) * Number(item?.profitPercentage || 0) / 100;
  }, 0);
  const main = inventory.reduce((a, i) => a + i.mainFridgeQty, 0);
  const second = inventory.reduce((a, i) => a + i.secondFridgeQty, 0);
  const low = inventory.filter(i => i.mainFridgeQty <= i.lowStockThreshold).length;
  const stats = [
    ['Today’s total sales amount', `₹${money(summary.total)}`], ['Today’s total pieces sold', pieces],
    ['Today’s cash collection total', `₹${money(summary.cash)}`], ['Today’s online payment total', `₹${money(summary.online)}`],
    ['Profit value', `₹${money(profitValue)}`], ['Main fridge pieces total', main],
    ['Second fridge boxes total', second], ['Low-stock item count', low]
  ].map(([label, value]) => ({ label, value }));
  const trend = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const end = new Date(d);
    end.setHours(23, 59, 59, 999);
    const amountRows = await c.sales.find({ createdAt: { $gte: d, $lte: end } }).toArray();
    trend.push({ day: d.toISOString().slice(0, 10), amount: amountRows.reduce((a, s) => a + Number(s.totalAmount || 0), 0) });
  }
  const trendMax = Math.max(...trend.map(t => t.amount), 1);
  trend.forEach(t => { t.heightPct = Math.min(100, Math.max(5, Math.round((t.amount / trendMax) * 100 / 5) * 5)); });
  const itemById = new Map(inventory.map(i => [String(i._id), i]));
  const topItems = Object.values(saleItems.reduce((acc, si) => {
    const key = String(si.itemId);
    const item = itemById.get(key);
    if (!item) return acc;
    acc[key] ||= { name: item.name, qty: 0, amount: 0 };
    acc[key].qty += si.quantity;
    acc[key].amount += si.lineTotal;
    return acc;
  }, {})).sort((a, b) => b.qty - a.qty).slice(0, 5);
  const managers = await c.users.find({ role: 'manager' }).sort({ name: 1 }).toArray();
  const managerStats = await Promise.all(managers.map(async m => ({ name: m.name, ...(await todaySummary(m._id)) })));
  const movements = await c.stockMovements.aggregate([
    { $sort: { createdAt: -1 } }, { $limit: 8 },
    { $lookup: { from: 'items', localField: 'itemId', foreignField: '_id', as: 'item' } }, { $unwind: '$item' }
  ]).toArray();
  render(req, res, 'dashboard', { title: 'Owner Dashboard', stats, summary, trend, inventory: inventory.filter(i => i.mainFridgeQty <= i.lowStockThreshold), topItems, managers: managerStats, movements: movements.map(m => ({ ...m, name: m.item.name })) });
}));

app.get('/owner/items', requireRole('owner'), aw(async (req, res) => {
  const rows = await itemRows(false);
  render(req, res, 'owner-items', { title: 'Item Catalog', rows });
}));

app.post('/owner/items', requireRole('owner'), aw(async (req, res) => {
  try {
    const schema = z.object({ itemCode: z.coerce.number().int().positive().transform(String), name: z.string().min(1), mrp: z.coerce.number().positive(), profitPercentage: z.preprocess(v => optionalNumber(v, 0), z.number().min(0)), piecesPerBox: z.preprocess(v => optionalNumber(v, 1), z.number().int().positive()), lowStockThreshold: z.preprocess(v => optionalNumber(v, 0), z.number().int().min(0)), imageData: z.string().max(600000).optional().default('') });
    const data = schema.parse(req.body);
    const now = new Date();
    await withTransaction(async (c, session) => {
      const exists = await c.items.findOne({ $or: [{ itemCode: data.itemCode }, { name: data.name }] }, { collation: { locale: 'en', strength: 2 }, session });
      if (exists) throw new Error('Duplicate item ID or item name is not allowed');
      const item = await c.items.insertOne({ ...data, active: true, hidden: false, createdAt: now, updatedAt: now }, { session });
      await c.inventory.insertOne({ itemId: item.insertedId, mainFridgeQty: 0, secondFridgeQty: 0, createdAt: now, updatedAt: now }, { session });
    });
    redirectWith(res, '/owner/items', 'ok', 'Item added successfully');
  } catch (e) { redirectWith(res, '/owner/items', 'err', e.message); }
}));

app.post('/owner/items/update', requireRole('owner'), aw(async (req, res) => {
  try {
    const rows = await itemRows(false);
    await withTransaction(async (c, session) => {
      for (const r of rows) {
        const data = z.object({ itemCode: z.coerce.number().int().positive().transform(String), name: z.string().min(1), mrp: z.coerce.number().positive(), profitPercentage: z.preprocess(v => optionalNumber(v, 0), z.number().min(0)), piecesPerBox: z.preprocess(v => optionalNumber(v, 1), z.number().int().positive()), lowStockThreshold: z.preprocess(v => optionalNumber(v, 0), z.number().int().min(0)) }).parse({
          itemCode: req.body[`itemCode_${r.id}`],
          name: req.body[`name_${r.id}`],
          mrp: req.body[`mrp_${r.id}`],
          profitPercentage: req.body[`profitPercentage_${r.id}`],
          piecesPerBox: req.body[`piecesPerBox_${r.id}`],
          lowStockThreshold: req.body[`lowStockThreshold_${r.id}`]
        });
        const duplicate = await c.items.findOne({ _id: { $ne: r._id }, $or: [{ itemCode: data.itemCode }, { name: data.name }] }, { collation: { locale: 'en', strength: 2 }, session });
        if (duplicate) throw new Error(`Duplicate item ID or name near ${data.name}`);
        await c.items.updateOne({ _id: r._id }, { $set: { ...data, active: bool(req.body[`active_${r.id}`]), hidden: bool(req.body[`hidden_${r.id}`]), updatedAt: new Date() } }, { session });
      }
    });
    redirectWith(res, '/owner/items', 'ok', 'Catalog changes saved');
  } catch (e) { redirectWith(res, '/owner/items', 'err', e.message); }
}));

app.get('/owner/inventory', requireRole('owner'), aw(async (req, res) => {
  const rows = await itemRows(false);
  render(req, res, 'owner-inventory', { title: 'Inventory Management', rows });
}));

app.post('/owner/inventory', requireRole('owner'), aw(async (req, res) => {
  try {
    const rows = await itemRows(false);
    await withTransaction(async (c, session) => {
      for (const r of rows) {
        const main = int(req.body[`main_${r.id}`]);
        const second = int(req.body[`second_${r.id}`]);
        if (main < 0 || second < 0) throw new Error('Stock cannot be negative');
        const delta = (main - r.mainFridgeQty) + ((second - r.secondFridgeQty) * r.piecesPerBox);
        await c.inventory.updateOne({ itemId: r._id }, { $set: { mainFridgeQty: main, secondFridgeQty: second, updatedAt: new Date() } }, { session });
        if (delta !== 0) await c.stockMovements.insertOne({ itemId: r._id, movementType: 'stock_adjustment', quantityPieces: delta, quantityBoxes: second - r.secondFridgeQty, sourceLocation: 'manual_adjustment', destinationLocation: 'inventory', notes: 'Owner bulk stock balance update', createdBy: objectId(req.user.id), createdAt: new Date() }, { session });
      }
    });
    redirectWith(res, '/owner/inventory', 'ok', 'Inventory balances saved');
  } catch (e) { redirectWith(res, '/owner/inventory', 'err', e.message); }
}));

app.get('/owner/movements', requireRole('owner'), aw(async (req, res) => {
  const c = collections();
  const items = await itemRows(true);
  const filter = {};
  if (req.query.type) filter.movementType = req.query.type;
  if (req.query.itemId) filter.itemId = objectId(req.query.itemId);
  const rows = await c.stockMovements.aggregate([
    { $match: filter }, { $sort: { createdAt: -1 } }, { $limit: 200 },
    { $lookup: { from: 'items', localField: 'itemId', foreignField: '_id', as: 'item' } }, { $unwind: '$item' },
    { $lookup: { from: 'users', localField: 'createdBy', foreignField: '_id', as: 'creator' } }, { $unwind: '$creator' }
  ]).toArray();
  const movementTypes = ['stock_adjustment', 'transfer_second_to_main', 'vendor_stock_in', 'vendor_return', 'pos_sale', 'return_movement'];
  render(req, res, 'owner-movements', { title: 'Movement', items, rows, movementTypes, query: req.query });
}));

app.post('/owner/movements', requireRole('owner'), aw(async (req, res) => {
  try {
    const data = z.object({ movementAction: z.enum(['transfer_second_to_main', 'vendor_stock_in', 'vendor_return']), itemId: z.string().min(1), boxes: z.coerce.number().int().positive(), notes: z.string().optional().default('') }).parse(req.body);
    await withTransaction(async (c, session) => {
      const itemId = objectId(data.itemId);
      const item = await c.items.findOne({ _id: itemId }, { session });
      if (!item) throw new Error('Item not found');
      const pieces = data.boxes * Number(item.piecesPerBox || 1);
      const now = new Date();
      const base = { itemId, quantityBoxes: data.boxes, createdBy: objectId(req.user.id), createdAt: now, notes: data.notes || '' };
      if (data.movementAction === 'transfer_second_to_main') {
        const updated = await c.inventory.updateOne({ itemId, secondFridgeQty: { $gte: data.boxes } }, { $inc: { secondFridgeQty: -data.boxes, mainFridgeQty: pieces }, $set: { updatedAt: now } }, { session });
        if (!updated.modifiedCount) throw new Error('Second Fridge boxes are insufficient');
        await c.stockMovements.insertOne({ ...base, movementType: 'transfer_second_to_main', quantityPieces: pieces, sourceLocation: 'second_fridge', destinationLocation: 'main_fridge' }, { session });
      } else if (data.movementAction === 'vendor_stock_in') {
        await c.inventory.updateOne({ itemId }, { $inc: { secondFridgeQty: data.boxes }, $set: { updatedAt: now } }, { session });
        await c.stockMovements.insertOne({ ...base, movementType: 'vendor_stock_in', quantityPieces: pieces, sourceLocation: 'vendor', destinationLocation: 'second_fridge' }, { session });
      } else {
        const updated = await c.inventory.updateOne({ itemId, secondFridgeQty: { $gte: data.boxes } }, { $inc: { secondFridgeQty: -data.boxes }, $set: { updatedAt: now } }, { session });
        if (!updated.modifiedCount) throw new Error('Second Fridge boxes are insufficient for vendor return');
        await c.stockMovements.insertOne({ ...base, movementType: 'vendor_return', quantityPieces: -pieces, quantityBoxes: -data.boxes, sourceLocation: 'second_fridge', destinationLocation: 'vendor' }, { session });
      }
    });
    redirectWith(res, '/owner/movements', 'ok', 'Movement recorded successfully');
  } catch (e) { redirectWith(res, '/owner/movements', 'err', e.message); }
}));

app.get('/owner/reports', requireRole('owner'), aw(async (req, res) => {
  const range = dateRange(req.query);
  const report = await reports(range);
  render(req, res, 'owner-reports', { title: 'Sales Reports', range, report });
}));

app.get('/owner/reports.csv', requireRole('owner'), aw(async (req, res) => {
  const range = dateRange(req.query);
  const report = await reports(range);
  const csv = stringify(report.rows.map(r => ({ dateTime: new Date(r.createdAt).toISOString(), billId: r.billNumber, managerName: r.managerName, customerName: r.customerName || '', itemId: r.itemCode, itemName: r.itemName, quantity: r.quantity, mrp: r.mrp, freeItem: r.isFree ? 'yes' : 'no', lineTotal: r.lineTotal, cashAmount: r.cashAmount, onlineAmount: r.onlineAmount, billTotal: r.totalAmount, remarks: r.remark || '', returnReference: r.originalSaleItemId || r.originalSaleId || '' })), { header: true });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="sales-report-${range.fromDate}-to-${range.toDate}.csv"`);
  res.send(csv);
}));

app.get('/owner/users', requireRole('owner'), aw(async (req, res) => {
  const rows = (await collections().users.find({}, { projection: { passwordHash: 0 } }).sort({ createdAt: -1 }).toArray()).map(mapDoc);
  render(req, res, 'owner-users', { title: 'User Management', rows });
}));

app.post('/owner/users', requireRole('owner'), aw(async (req, res) => {
  try {
    const data = z.object({ userId: z.string().min(1), name: z.string().min(1), email: z.string().email(), role: z.enum(['owner', 'manager']), password: z.string().min(8) }).parse(req.body);
    const now = new Date();
    await collections().users.insertOne({ userId: data.userId, name: data.name, email: data.email, role: data.role, passwordHash: bcrypt.hashSync(data.password, 12), mustChangePassword: true, active: true, createdAt: now, updatedAt: now });
    redirectWith(res, '/owner/users', 'ok', 'User created successfully');
  } catch (e) { redirectWith(res, '/owner/users', 'err', e.code === 11000 ? 'Duplicate email or user ID not allowed' : e.message); }
}));

app.post('/owner/users/:id/toggle', requireRole('owner'), aw(async (req, res) => {
  const c = collections();
  const user = await c.users.findOne({ _id: objectId(req.params.id) });
  if (!user) return redirectWith(res, '/owner/users', 'err', 'User not found');
  await c.users.updateOne({ _id: user._id }, { $set: { active: !user.active, updatedAt: new Date() } });
  redirectWith(res, '/owner/users', 'ok', 'User updated');
}));

app.get('/manager', requireRole('manager'), aw(async (req, res) => {
  const s = await todaySummary(req.user.id);
  render(req, res, 'manager-home', { title: 'Manager Home', s });
}));

app.get('/manager/stock', requireRole('manager'), aw(async (req, res) => {
  const rows = await itemRows(true);
  render(req, res, 'manager-stock', { title: 'Available Stock', rows, stockDisplay });
}));

app.get('/manager/pos', requireRole('manager'), aw(async (req, res) => {
  const rows = await itemRows(true);
  render(req, res, 'manager-pos', { title: 'POS Billing', rows, stockDisplay });
}));

app.post('/manager/pos', requireRole('manager'), aw(async (req, res) => {
  try {
    await withTransaction(async (c, session) => {
      const rows = await itemRows(true);
      const lines = [];
      for (const r of rows) {
        const qty = int(req.body[`qty_${r.id}`]);
        if (qty > 0) {
          if (qty > r.mainFridgeQty) throw new Error(`Insufficient Main Fridge stock for ${r.name}`);
          const isFree = bool(req.body[`free_${r.id}`]);
          lines.push({ item: r, qty, isFree, lineTotal: isFree ? 0 : qty * r.mrp });
        }
      }
      if (!lines.length) throw new Error('Sale rejected: no items are selected');
      const total = lines.reduce((a, l) => a + l.lineTotal, 0);
      const cash = number(req.body.cashAmount);
      const online = number(req.body.onlineAmount);
      if (Math.abs((cash + online) - total) > 0.009) throw new Error('Invalid payment amount: cash + online must equal bill total');
      const now = new Date();
      const sale = await c.sales.insertOne({ billNumber: makeBillNumber(), managerId: objectId(req.user.id), totalAmount: total, cashAmount: cash, onlineAmount: online, remark: req.body.remark || '', customerName: req.body.customerName || '', type: 'sale', originalSaleId: null, createdAt: now, updatedAt: now }, { session });
      for (const l of lines) {
        const updated = await c.inventory.updateOne({ itemId: l.item._id, mainFridgeQty: { $gte: l.qty } }, { $inc: { mainFridgeQty: -l.qty }, $set: { updatedAt: now } }, { session });
        if (!updated.modifiedCount) throw new Error(`Insufficient Main Fridge stock for ${l.item.name}`);
        const si = await c.saleItems.insertOne({ saleId: sale.insertedId, itemId: l.item._id, quantity: l.qty, mrp: l.item.mrp, isFree: l.isFree, lineTotal: l.lineTotal, originalSaleItemId: null, createdAt: now, updatedAt: now }, { session });
        await c.stockMovements.insertOne({ itemId: l.item._id, movementType: 'pos_sale', quantityPieces: -l.qty, quantityBoxes: -l.qty / l.item.piecesPerBox, sourceLocation: 'main_fridge', destinationLocation: 'customer', notes: 'POS sale', saleId: sale.insertedId, saleItemId: si.insertedId, createdBy: objectId(req.user.id), createdAt: now }, { session });
      }
    });
    redirectWith(res, '/manager/pos', 'ok', 'Bill saved successfully');
  } catch (e) { redirectWith(res, '/manager/pos', 'err', e.message); }
}));

app.get('/manager/returns', requireRole('manager'), aw(async (req, res) => {
  const rows = await returnableLines(req.user.id);
  render(req, res, 'manager-returns', { title: 'POS Returns', rows });
}));

app.post('/manager/returns', requireRole('manager'), aw(async (req, res) => {
  try {
    await withTransaction(async (c, session) => {
      const qty = int(req.body.quantity);
      if (qty <= 0) throw new Error('Reject invalid return request');
      const rows = await returnableLines(req.user.id);
      const line = rows.find(r => String(r.id) === String(req.body.saleItemId));
      if (!line) throw new Error('Sale line not found or not returnable today by this manager');
      const remaining = line.quantity - line.returnedQty;
      if (qty > remaining) throw new Error('Return quantity cannot exceed remaining returnable quantity');
      const refund = line.isFree ? 0 : qty * line.mrp;
      const now = new Date();
      const sale = await c.sales.insertOne({ billNumber: makeBillNumber('RET'), managerId: objectId(req.user.id), totalAmount: -refund, cashAmount: -refund, onlineAmount: 0, remark: `Return against ${line.billNumber}`, type: 'return', originalSaleId: objectId(line.saleId), createdAt: now, updatedAt: now }, { session });
      const si = await c.saleItems.insertOne({ saleId: sale.insertedId, itemId: objectId(line.itemId), quantity: -qty, mrp: line.mrp, isFree: line.isFree, lineTotal: -refund, originalSaleItemId: objectId(line.id), createdAt: now, updatedAt: now }, { session });
      await c.inventory.updateOne({ itemId: objectId(line.itemId) }, { $inc: { mainFridgeQty: qty }, $set: { updatedAt: now } }, { session });
      await c.stockMovements.insertOne({ itemId: objectId(line.itemId), movementType: 'return_movement', quantityPieces: qty, quantityBoxes: 0, sourceLocation: 'customer', destinationLocation: 'main_fridge', notes: 'POS return', saleId: sale.insertedId, saleItemId: si.insertedId, createdBy: objectId(req.user.id), createdAt: now }, { session });
    });
    redirectWith(res, '/manager/returns', 'ok', 'Return processed and stock added to Main Fridge');
  } catch (e) { redirectWith(res, '/manager/returns', 'err', e.message); }
}));

app.use((req, res) => {
  render(req, res, 'error', { title: 'Page not found', status: 404, message: "The page you're looking for doesn't exist or may have moved." });
});

app.use((err, req, res, next) => {
  const status = err.status && err.status < 500 ? err.status : 503;
  console.error('Application error', { message: err.message, name: err.name, status });
  let message;
  if (err.status && err.status < 500) {
    message = err.message;
  } else {
    const config = databaseConfigSummary();
    const reason = config.hasUri ? err.message : 'MONGODB_URI is missing in this deployment environment';
    message = process.env.NODE_ENV === 'production'
      ? `Database connection failed or the application could not finish startup. ${reason}. Check Vercel Project Settings > Environment Variables and MongoDB Atlas Network Access, then redeploy.`
      : `Database error or unexpected application error: ${err.message}`;
  }
  const title = status === 403 ? 'Access denied' : status === 429 ? 'Too many attempts' : 'Something went wrong';
  render(req, res, 'error', { title, status, message });
});

async function start() {
  await ensureRuntimeReady();
  app.listen(PORT, () => console.log(`Desi Mastaani Matka Kulfi app running on http://localhost:${PORT}`));
}

if (require.main === module) {
  start().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = app;
module.exports.app = app;
module.exports.start = start;
module.exports.ensureRuntimeReady = ensureRuntimeReady;
