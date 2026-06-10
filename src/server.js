const express = require('express');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const morgan = require('morgan');
const bcrypt = require('bcryptjs');
const { stringify } = require('csv-stringify/sync');
const { z } = require('zod');
const { connect, collections, seedIfEmpty, todayBounds, money, makeBillNumber, objectId, withTransaction } = require('./db');
const { attachUser, requireRole, login, setSessionCookie, clearSessionCookie } = require('./auth');

const app = express();
app.set('view engine', 'ejs');
app.set('views', `${process.cwd()}/views`);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan('dev'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;
const aw = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const notice = (req) => req.query.ok ? { type: 'success', message: req.query.ok } : req.query.err ? { type: 'error', message: req.query.err } : null;
const redirectWith = (res, path, key, msg) => res.redirect(`${path}?${key}=${encodeURIComponent(msg)}`);
const esc = (s = '') => String(s).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
const number = (v) => Number(v || 0);
const int = (v) => Math.trunc(Number(v || 0));
const bool = (v) => v === true || v === '1' || v === 'on';

function render(req, res, view, data = {}) {
  res.render(view, { ...data, user: req.user, path: req.path, notice: notice(req), money }, (err, body) => {
    if (err) throw err;
    res.render('layout', { title: data.title || 'Dashboard', body, user: req.user, path: req.path, notice: notice(req), money });
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

app.use(aw(attachUser));

app.get('/', (req, res) => res.redirect(req.user ? (req.user.role === 'owner' ? '/owner' : '/manager') : '/login'));
app.get('/login', (req, res) => req.user ? res.redirect(req.user.role === 'owner' ? '/owner' : '/manager') : render(req, res, 'login', { title: 'Login', error: req.query.err, next: req.query.next }));
app.post('/login', aw(async (req, res) => {
  const user = await login(req.body.email, req.body.password);
  if (!user) return res.redirect('/login?err=Invalid%20email%20or%20password');
  setSessionCookie(res, user);
  res.redirect(req.body.next || (user.role === 'owner' ? '/owner' : '/manager'));
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
  const invValue = inventory.reduce((a, i) => a + (i.mainFridgeQty + i.secondFridgeQty) * i.mrp, 0);
  const main = inventory.reduce((a, i) => a + i.mainFridgeQty, 0);
  const second = inventory.reduce((a, i) => a + i.secondFridgeQty, 0);
  const low = inventory.filter(i => i.mainFridgeQty <= i.lowStockThreshold).length;
  const stats = [
    ['Today’s total sales amount', `₹${money(summary.total)}`], ['Today’s total pieces sold', pieces],
    ['Today’s cash collection total', `₹${money(summary.cash)}`], ['Today’s online payment total', `₹${money(summary.online)}`],
    ['Current total inventory value', `₹${money(invValue)}`], ['Main fridge stock total', main],
    ['Second fridge stock total', second], ['Low-stock item count', low]
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
  render(req, res, 'dashboard', { title: 'Owner Dashboard', stats, summary, trend, inventory, topItems, managers: managerStats, movements: movements.map(m => ({ ...m, name: m.item.name })) });
}));

app.get('/owner/items', requireRole('owner'), aw(async (req, res) => {
  const rows = await itemRows(false);
  const form = `<form method="post" action="/owner/items" class="form-grid"><label>Item ID<input name="itemCode" required></label><label>Name<input name="name" required></label><label>MRP<input name="mrp" type="number" min="0.01" step="0.01" required></label><label>Profit %<input name="profitPercentage" type="number" min="0" step="0.01" value="0"></label><label>Pieces/box<input name="piecesPerBox" type="number" min="1" value="24"></label><label>Low threshold<input name="lowStockThreshold" type="number" min="0" value="0"></label><button class="primary">Add item</button></form>`;
  const table = `<table><thead><tr><th>ID</th><th>Name</th><th>MRP</th><th>Box</th><th>Low</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.itemCode)}</td><td>${esc(r.name)}</td><td>₹${money(r.mrp)}</td><td>${r.piecesPerBox}</td><td>${r.lowStockThreshold}</td><td><span class="badge ${r.active ? 'ok' : 'danger'}">${r.active ? 'Active' : 'Inactive'}</span> <span class="badge ${r.hidden ? 'warn' : 'ok'}">${r.hidden ? 'Hidden' : 'Visible'}</span></td><td><form class="actions" method="post" action="/owner/items/${r.id}/toggle"><button name="field" value="active" class="btn secondary">Toggle active</button><button name="field" value="hidden" class="btn secondary">Hide/unhide</button></form></td></tr>`).join('') || '<tr><td colspan="7" class="empty">No items yet.</td></tr>'}</tbody></table>`;
  render(req, res, 'table-page', { title: 'Item Catalog', form, table });
}));

app.post('/owner/items', requireRole('owner'), aw(async (req, res) => {
  try {
    const schema = z.object({ itemCode: z.string().min(1), name: z.string().min(1), mrp: z.coerce.number().positive(), profitPercentage: z.coerce.number().min(0), piecesPerBox: z.coerce.number().int().positive(), lowStockThreshold: z.coerce.number().int().min(0) });
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

app.post('/owner/items/:id/toggle', requireRole('owner'), aw(async (req, res) => {
  const field = req.body.field === 'hidden' ? 'hidden' : 'active';
  const c = collections();
  const item = await c.items.findOne({ _id: objectId(req.params.id) });
  if (!item) return redirectWith(res, '/owner/items', 'err', 'Item not found');
  await c.items.updateOne({ _id: item._id }, { $set: { [field]: !item[field], updatedAt: new Date() } });
  redirectWith(res, '/owner/items', 'ok', 'Item updated');
}));

app.get('/owner/inventory', requireRole('owner'), aw(async (req, res) => {
  const rows = await itemRows(false);
  const table = `<form method="post" action="/owner/inventory"><table><thead><tr><th>Item</th><th>Main Fridge</th><th>Second Fridge</th><th>Total value</th><th>Status</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.name)}</td><td><input name="main_${r.id}" type="number" min="0" value="${r.mainFridgeQty}"></td><td><input name="second_${r.id}" type="number" min="0" value="${r.secondFridgeQty}"></td><td>₹${money((r.mainFridgeQty + r.secondFridgeQty) * r.mrp)}</td><td><span class="badge ${r.mainFridgeQty <= r.lowStockThreshold ? 'danger' : 'ok'}">${r.mainFridgeQty <= r.lowStockThreshold ? 'Low stock' : 'Healthy'}</span></td></tr>`).join('')}</tbody></table><p><button class="primary">Save stock balances</button></p></form>`;
  render(req, res, 'table-page', { title: 'Inventory Management', table });
}));

app.post('/owner/inventory', requireRole('owner'), aw(async (req, res) => {
  try {
    const rows = await itemRows(false);
    await withTransaction(async (c, session) => {
      for (const r of rows) {
        const main = int(req.body[`main_${r.id}`]);
        const second = int(req.body[`second_${r.id}`]);
        if (main < 0 || second < 0) throw new Error('Stock cannot be negative');
        const delta = (main - r.mainFridgeQty) + (second - r.secondFridgeQty);
        await c.inventory.updateOne({ itemId: r._id }, { $set: { mainFridgeQty: main, secondFridgeQty: second, updatedAt: new Date() } }, { session });
        if (delta !== 0) await c.stockMovements.insertOne({ itemId: r._id, movementType: 'stock_adjustment', quantityPieces: delta, quantityBoxes: delta / r.piecesPerBox, sourceLocation: 'manual_adjustment', destinationLocation: 'inventory', notes: 'Owner bulk stock balance update', createdBy: objectId(req.user.id), createdAt: new Date() }, { session });
      }
    });
    redirectWith(res, '/owner/inventory', 'ok', 'Inventory balances saved');
  } catch (e) { redirectWith(res, '/owner/inventory', 'err', e.message); }
}));

app.get('/owner/movements', requireRole('owner'), aw(async (req, res) => {
  const c = collections();
  const filter = {};
  if (req.query.type) filter.movementType = req.query.type;
  if (req.query.itemId) filter.itemId = objectId(req.query.itemId);
  const rows = await c.stockMovements.aggregate([
    { $match: filter }, { $sort: { createdAt: -1 } }, { $limit: 200 },
    { $lookup: { from: 'items', localField: 'itemId', foreignField: '_id', as: 'item' } }, { $unwind: '$item' },
    { $lookup: { from: 'users', localField: 'createdBy', foreignField: '_id', as: 'creator' } }, { $unwind: '$creator' }
  ]).toArray();
  const table = `<table><thead><tr><th>Date</th><th>Item</th><th>Type</th><th>Pieces</th><th>Boxes</th><th>Source</th><th>Destination</th><th>Created by</th><th>Notes</th></tr></thead><tbody>${rows.map(r => `<tr><td>${new Date(r.createdAt).toLocaleString()}</td><td>${esc(r.item.name)}</td><td>${r.movementType.replaceAll('_', ' ')}</td><td>${r.quantityPieces}</td><td>${money(r.quantityBoxes)}</td><td>${esc(r.sourceLocation || '')}</td><td>${esc(r.destinationLocation || '')}</td><td>${esc(r.creator.name)}</td><td>${esc(r.notes || '')}</td></tr>`).join('') || '<tr><td colspan="9" class="empty">No stock movement records found.</td></tr>'}</tbody></table>`;
  render(req, res, 'table-page', { title: 'Stock Movement Ledger', table });
}));

app.get('/owner/reports', requireRole('owner'), aw(async (req, res) => {
  const range = dateRange(req.query);
  const report = await reports(range);
  const intro = `<form class="form-grid" method="get"><label>From<input type="date" name="from" value="${range.fromDate}"></label><label>To<input type="date" name="to" value="${range.toDate}"></label><button class="primary">Filter</button><a class="btn secondary" href="/owner/reports.csv?from=${range.fromDate}&to=${range.toDate}">Export CSV</a></form><section class="grid stats"><article class="card stat"><span>Gross sales</span><strong>₹${money(report.totals.gross)}</strong></article><article class="card stat"><span>Returns</span><strong>₹${money(report.totals.returns)}</strong></article><article class="card stat"><span>Net sales</span><strong>₹${money(report.totals.gross - report.totals.returns)}</strong></article><article class="card stat"><span>Pieces</span><strong>${report.totals.pieces}</strong></article></section>`;
  const table = `<table><thead><tr><th>Date</th><th>Bill</th><th>Manager</th><th>Type</th><th>Item</th><th>Qty</th><th>MRP</th><th>Free</th><th>Line</th><th>Cash</th><th>Online</th><th>Remark</th></tr></thead><tbody>${report.rows.map(r => `<tr><td>${new Date(r.createdAt).toLocaleString()}</td><td>${r.billNumber}</td><td>${esc(r.managerName)}</td><td>${r.type}</td><td>${esc(r.itemName)}</td><td>${r.quantity}</td><td>₹${money(r.mrp)}</td><td>${r.isFree ? 'Yes' : 'No'}</td><td>₹${money(r.lineTotal)}</td><td>₹${money(r.cashAmount)}</td><td>₹${money(r.onlineAmount)}</td><td>${esc(r.remark || '')}</td></tr>`).join('') || '<tr><td colspan="12" class="empty">No sales in this date range.</td></tr>'}</tbody></table>`;
  render(req, res, 'table-page', { title: 'Sales Reports', intro, table });
}));

app.get('/owner/reports.csv', requireRole('owner'), aw(async (req, res) => {
  const range = dateRange(req.query);
  const report = await reports(range);
  const csv = stringify(report.rows.map(r => ({ dateTime: new Date(r.createdAt).toISOString(), billId: r.billNumber, managerName: r.managerName, itemId: r.itemCode, itemName: r.itemName, quantity: r.quantity, mrp: r.mrp, freeItem: r.isFree ? 'yes' : 'no', lineTotal: r.lineTotal, cashAmount: r.cashAmount, onlineAmount: r.onlineAmount, billTotal: r.totalAmount, remarks: r.remark || '', returnReference: r.originalSaleItemId || r.originalSaleId || '' })), { header: true });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="sales-report-${range.fromDate}-to-${range.toDate}.csv"`);
  res.send(csv);
}));

app.get('/owner/users', requireRole('owner'), aw(async (req, res) => {
  const rows = (await collections().users.find({}, { projection: { passwordHash: 0 } }).sort({ createdAt: -1 }).toArray()).map(mapDoc);
  const form = `<form method="post" action="/owner/users" class="form-grid"><label>Name<input name="name" required></label><label>Email<input name="email" type="email" required></label><label>Role<select name="role"><option value="manager">Cart Manager</option><option value="owner">Owner</option></select></label><label>Temporary password<input name="password" type="password" minlength="8" required></label><button class="primary">Create user</button></form>`;
  const table = `<table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Active</th><th>Actions</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.name)}</td><td>${esc(r.email)}</td><td>${r.role}</td><td><span class="badge ${r.active ? 'ok' : 'danger'}">${r.active ? 'Active' : 'Inactive'}</span></td><td><form class="actions" method="post" action="/owner/users/${r.id}/toggle"><button class="btn secondary">Activate/deactivate</button></form></td></tr>`).join('')}</tbody></table>`;
  render(req, res, 'table-page', { title: 'User Management', form, table });
}));

app.post('/owner/users', requireRole('owner'), aw(async (req, res) => {
  try {
    const data = z.object({ name: z.string().min(1), email: z.string().email(), role: z.enum(['owner', 'manager']), password: z.string().min(8) }).parse(req.body);
    const now = new Date();
    await collections().users.insertOne({ name: data.name, email: data.email, role: data.role, passwordHash: bcrypt.hashSync(data.password, 12), active: true, createdAt: now, updatedAt: now });
    redirectWith(res, '/owner/users', 'ok', 'User created successfully');
  } catch (e) { redirectWith(res, '/owner/users', 'err', e.code === 11000 ? 'Duplicate email not allowed' : e.message); }
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
  const intro = `<section class="grid stats"><article class="card stat"><span>Today’s pieces sold</span><strong>${s.pieces}</strong></article><article class="card stat"><span>Today’s sales amount</span><strong>₹${money(s.total)}</strong></article><article class="card stat"><span>Cash amount</span><strong>₹${money(s.cash)}</strong></article><article class="card stat"><span>Online amount</span><strong>₹${money(s.online)}</strong></article></section><section class="grid two"><a class="card" href="/manager/pos"><h2>Open POS Billing</h2><p>Sell from Main Fridge and accept cash/online split payments.</p></a><a class="card" href="/manager/returns"><h2>Process Returns</h2><p>Return your own sale lines from today only.</p></a></section>`;
  render(req, res, 'table-page', { title: 'Manager Home', intro, table: '' });
}));

app.get('/manager/stock', requireRole('manager'), aw(async (req, res) => {
  const rows = await itemRows(true);
  const table = `<table><thead><tr><th>Item</th><th>Main Fridge</th><th>Second Fridge</th><th>Low threshold</th><th>Status</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.name)}</td><td>${r.mainFridgeQty}</td><td>${r.secondFridgeQty}</td><td>${r.lowStockThreshold}</td><td><span class="badge ${r.mainFridgeQty <= r.lowStockThreshold ? 'danger' : 'ok'}">${r.mainFridgeQty <= r.lowStockThreshold ? 'Low stock' : 'Available'}</span></td></tr>`).join('') || '<tr><td colspan="5" class="empty">No stock available.</td></tr>'}</tbody></table>`;
  render(req, res, 'table-page', { title: 'Available Stock', table });
}));

app.get('/manager/pos', requireRole('manager'), aw(async (req, res) => {
  const rows = await itemRows(true);
  const body = `<form method="post" action="/manager/pos" class="pos-grid"><section class="items-grid">${rows.map(r => `<article class="item-card ${r.mainFridgeQty <= r.lowStockThreshold ? 'low' : ''}"><h3>${esc(r.name)}</h3><p>MRP ₹${money(r.mrp)} · Main ${r.mainFridgeQty} pcs · Second ${r.secondFridgeQty} pcs</p><span class="badge ${r.mainFridgeQty <= r.lowStockThreshold ? 'danger' : 'ok'}">${r.mainFridgeQty <= r.lowStockThreshold ? 'Low stock' : 'Ready'}</span><div class="qty-row"><input name="qty_${r.id}" type="number" min="0" max="${r.mainFridgeQty}" placeholder="Sale qty"><label><input type="checkbox" name="free_${r.id}" value="1"> Free</label></div><div class="qty-row"><input name="transfer_${r.id}" type="number" min="0" max="${r.secondFridgeQty}" placeholder="Transfer pcs"><button formaction="/manager/transfer" name="itemId" value="${r.id}" class="btn secondary">Transfer</button></div></article>`).join('') || '<p class="empty">No active items are available.</p>'}</section><aside class="card"><h2>Payment</h2><label>Cash amount<input name="cashAmount" type="number" min="0" step="0.01" value="0"></label><label>Online amount<input name="onlineAmount" type="number" min="0" step="0.01" value="0"></label><label>Bill remark<textarea name="remark" rows="3"></textarea></label><p class="muted">Cash + online must equal the non-free item total. Stock is reduced from Main Fridge only.</p><button class="primary">Save bill</button></aside></form>`;
  render(req, res, 'table-page', { title: 'POS Billing', intro: body, table: '' });
}));

app.post('/manager/transfer', requireRole('manager'), aw(async (req, res) => {
  try {
    const itemId = objectId(req.body.itemId);
    const qty = int(req.body[`transfer_${req.body.itemId}`]);
    if (qty <= 0) throw new Error('Transfer quantity is required');
    await withTransaction(async (c, session) => {
      const item = await c.items.findOne({ _id: itemId, active: true, hidden: false }, { session });
      if (!item) throw new Error('Item is inactive or not found');
      const updated = await c.inventory.updateOne({ itemId, secondFridgeQty: { $gte: qty } }, { $inc: { secondFridgeQty: -qty, mainFridgeQty: qty }, $set: { updatedAt: new Date() } }, { session });
      if (!updated.modifiedCount) throw new Error('Second Fridge stock is insufficient');
      await c.stockMovements.insertOne({ itemId, movementType: 'transfer_second_to_main', quantityPieces: qty, quantityBoxes: qty / item.piecesPerBox, sourceLocation: 'second_fridge', destinationLocation: 'main_fridge', notes: 'Manager POS transfer', createdBy: objectId(req.user.id), createdAt: new Date() }, { session });
    });
    redirectWith(res, '/manager/pos', 'ok', 'Stock transferred to Main Fridge');
  } catch (e) { redirectWith(res, '/manager/pos', 'err', e.message); }
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
      const sale = await c.sales.insertOne({ billNumber: makeBillNumber(), managerId: objectId(req.user.id), totalAmount: total, cashAmount: cash, onlineAmount: online, remark: req.body.remark || '', type: 'sale', originalSaleId: null, createdAt: now, updatedAt: now }, { session });
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
  const table = `<table><thead><tr><th>Bill</th><th>Item</th><th>Sold</th><th>Returned</th><th>Remaining</th><th>Refund/pc</th><th>Return</th></tr></thead><tbody>${rows.map(r => `<tr><td>${r.billNumber}</td><td>${esc(r.name)}</td><td>${r.quantity}</td><td>${r.returnedQty}</td><td>${r.quantity - r.returnedQty}</td><td>₹${r.isFree ? '0.00' : money(r.mrp)}</td><td><form class="actions" method="post" action="/manager/returns"><input type="hidden" name="saleItemId" value="${r.id}"><input name="quantity" type="number" min="1" max="${r.quantity - r.returnedQty}"><button class="btn secondary">Process return</button></form></td></tr>`).join('') || '<tr><td colspan="7" class="empty">No returnable items for your sales today.</td></tr>'}</tbody></table>`;
  render(req, res, 'table-page', { title: 'POS Returns', table });
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

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send('Database error or unexpected application error. Please try again.');
});

async function start() {
  await connect();
  await seedIfEmpty();
  app.listen(PORT, () => console.log(`Desi Mastaani Matka Kulfi app running on http://localhost:${PORT}`));
}

if (require.main === module) {
  start().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { app, start };
