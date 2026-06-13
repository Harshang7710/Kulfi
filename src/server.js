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

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan('dev'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get(['/favicon.ico', '/favicon.png'], (req, res) => res.redirect(302, '/logo.svg'));

const PORT = process.env.PORT || 3000;
const aw = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
let startupPromise;

async function ensureRuntimeReady() {
  if (!startupPromise) {
    startupPromise = connect()
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
const esc = (s = '') => String(s).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
const number = (v) => Number(v || 0);
const int = (v) => Math.trunc(Number(v || 0));
const bool = (v) => v === true || v === '1' || v === 'on';
const optionalNumber = (v, fallback = 0) => String(v ?? '').trim() === '' ? fallback : Number(v);
const stockDisplay = (row) => ({ secondBoxes: Number(row.secondFridgeQty || 0), mainPieces: Number(row.mainFridgeQty || 0), secondPieces: Number(row.secondFridgeQty || 0) * Number(row.piecesPerBox || 0) });

function render(req, res, view, data = {}) {
  const baseData = { ...data, user: req.user, path: req.path, notice: notice(req), money };
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
app.post('/login', aw(async (req, res) => {
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
  const form = `<form method="post" action="/owner/items" class="form-grid" data-image-upload-form><label>Numeric Item ID<input name="itemCode" type="number" min="1" step="1" required></label><label>Name<input name="name" required></label><label>MRP<input name="mrp" type="number" min="0.01" step="0.01" required></label><label>Profit %<input name="profitPercentage" type="number" min="0" step="0.01" placeholder="Blank until known"></label><label>Pieces/box<input name="piecesPerBox" type="number" min="1" step="1" placeholder="Blank"></label><label>Low threshold<input name="lowStockThreshold" type="number" min="0" step="1" placeholder="Blank"></label><label>Product image (optional)<input name="imageUpload" type="file" accept="image/*" data-image-upload><input name="imageData" type="hidden" data-image-data><small class="muted">Lightweight upload: saved as a small browser-compressed image.</small></label><button class="primary">Add item</button></form>`;
  const table = `<form method="post" action="/owner/items/update"><table><thead><tr><th>Image</th><th>ID</th><th>Name</th><th>MRP</th><th>Profit %</th><th>Pieces/box</th><th>Low</th><th>Status</th></tr></thead><tbody>${rows.map(r => `<tr><td>${r.imageData ? `<img class="item-thumb" src="${esc(r.imageData)}" alt="${esc(r.name)} image">` : '—'}</td><td><input name="itemCode_${r.id}" type="number" min="1" step="1" value="${esc(r.itemCode)}" required></td><td><input name="name_${r.id}" value="${esc(r.name)}" required></td><td><input name="mrp_${r.id}" type="number" min="0.01" step="0.01" value="${money(r.mrp)}" required></td><td><input name="profitPercentage_${r.id}" type="number" min="0" step="0.01" value="${r.profitPercentage ?? ''}"></td><td><input name="piecesPerBox_${r.id}" type="number" min="1" step="1" value="${r.piecesPerBox ?? ''}"></td><td><input name="lowStockThreshold_${r.id}" type="number" min="0" step="1" value="${r.lowStockThreshold ?? ''}"></td><td><label class="inline-check"><input type="checkbox" name="active_${r.id}" ${r.active ? 'checked' : ''}> Active</label><label class="inline-check"><input type="checkbox" name="hidden_${r.id}" ${r.hidden ? 'checked' : ''}> Hidden</label></td></tr>`).join('') || '<tr><td colspan="8" class="empty">No items yet.</td></tr>'}</tbody></table><p class="actions"><button class="primary">Save catalog changes</button></p></form>`;
  render(req, res, 'table-page', { title: 'Item Catalog', form, table });
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
  const table = `<form method="post" action="/owner/inventory"><table><thead><tr><th>Item</th><th>Main Fridge (pcs)</th><th>Second Fridge (boxes)</th><th>Total value</th><th>Status</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.name)}</td><td><input name="main_${r.id}" type="number" min="0" value="${r.mainFridgeQty}"></td><td><input name="second_${r.id}" type="number" min="0" value="${r.secondFridgeQty}"></td><td>₹${money((r.mainFridgeQty + (r.secondFridgeQty * r.piecesPerBox)) * r.mrp)}</td><td><span class="badge ${r.mainFridgeQty <= r.lowStockThreshold ? 'danger' : 'ok'}">${r.mainFridgeQty <= r.lowStockThreshold ? 'Low stock' : 'Healthy'}</span></td></tr>`).join('')}</tbody></table><p><button class="primary">Save stock balances</button></p></form>`;
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
  const itemOptions = items.map(i => `<option value="${i.id}">${esc(i.name)} (${i.piecesPerBox} pcs/box)</option>`).join('');
  const intro = `<section class="grid two"><article class="card"><h2>Movement</h2><p class="muted">Move stock between fridges, receive vendor stock into the Second Fridge, or return damaged stock back to the vendor.</p><form method="post" action="/owner/movements" class="form-grid two-col"><label>Workflow<select name="movementAction"><option value="transfer_second_to_main">Second Fridge → Main Fridge</option><option value="vendor_stock_in">Vendor intake → Second Fridge</option><option value="vendor_return">Damaged stock → Vendor return</option></select></label><label>Item<select name="itemId" required>${itemOptions}</select></label><label>Quantity (boxes)<input name="boxes" type="number" min="1" step="1" required></label><label>Notes<input name="notes" placeholder="Invoice, reason, or damage details"></label><button class="primary">Record movement</button></form></article><article class="card"><h2>Unit logic</h2><ul class="feed"><li><span>Main Fridge</span><span>Tracked as individual pieces for retail sales.</span></li><li><span>Second Fridge</span><span>Tracked as boxes for vendor/wholesale stock.</span></li><li><span>Transfers</span><span>Entered in boxes and converted to pieces automatically.</span></li></ul></article></section>`;
  const table = `<table><thead><tr><th>Date</th><th>Item</th><th>Type</th><th>Pieces</th><th>Boxes</th><th>Source</th><th>Destination</th><th>Created by</th><th>Notes</th></tr></thead><tbody>${rows.map(r => `<tr><td>${new Date(r.createdAt).toLocaleString()}</td><td>${esc(r.item.name)}</td><td>${r.movementType.replaceAll('_', ' ')}</td><td>${r.quantityPieces}</td><td>${money(r.quantityBoxes)}</td><td>${esc(r.sourceLocation || '')}</td><td>${esc(r.destinationLocation || '')}</td><td>${esc(r.creator.name)}</td><td>${esc(r.notes || '')}</td></tr>`).join('') || '<tr><td colspan="9" class="empty">No stock movement records found.</td></tr>'}</tbody></table>`;
  render(req, res, 'table-page', { title: 'Movement', intro, table });
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
  const intro = `<form class="form-grid" method="get"><label>From<input type="date" name="from" value="${range.fromDate}"></label><label>To<input type="date" name="to" value="${range.toDate}"></label><button class="primary">Filter</button><a class="btn secondary" href="/owner/reports.csv?from=${range.fromDate}&to=${range.toDate}">Export CSV</a></form><section class="grid stats"><article class="card stat"><span>Gross sales</span><span class="stat-value">₹${money(report.totals.gross)}</span></article><article class="card stat"><span>Returns</span><span class="stat-value">₹${money(report.totals.returns)}</span></article><article class="card stat"><span>Net sales</span><span class="stat-value">₹${money(report.totals.gross - report.totals.returns)}</span></article><article class="card stat"><span>Pieces</span><span class="stat-value">${report.totals.pieces}</span></article></section>`;
  const table = `<table><thead><tr><th>Date</th><th>Bill</th><th>Manager</th><th>Customer</th><th>Type</th><th>Item</th><th>Qty</th><th>MRP</th><th>Free</th><th>Line</th><th>Cash</th><th>Online</th><th>Remark</th></tr></thead><tbody>${report.rows.map(r => `<tr><td>${new Date(r.createdAt).toLocaleString()}</td><td>${r.billNumber}</td><td>${esc(r.managerName)}</td><td>${esc(r.customerName || '')}</td><td>${r.type}</td><td>${esc(r.itemName)}</td><td>${r.quantity}</td><td>₹${money(r.mrp)}</td><td>${r.isFree ? 'Yes' : 'No'}</td><td>₹${money(r.lineTotal)}</td><td>₹${money(r.cashAmount)}</td><td>₹${money(r.onlineAmount)}</td><td>${esc(r.remark || '')}</td></tr>`).join('') || '<tr><td colspan="13" class="empty">No sales in this date range.</td></tr>'}</tbody></table>`;
  render(req, res, 'table-page', { title: 'Sales Reports', intro, table });
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
  const form = `<form method="post" action="/owner/users" class="form-grid"><label>Unique User ID<input name="userId" required placeholder="Numeric or staff code"></label><label>Name<input name="name" required></label><label>Email<input name="email" type="email" required></label><label>Role<select name="role"><option value="manager">Cart Manager</option><option value="owner">Owner</option></select></label><label>Temporary password<input name="password" type="password" minlength="8" required></label><button class="primary">Create user</button></form>`;
  const table = `<table><thead><tr><th>User ID</th><th>Name</th><th>Email</th><th>Role</th><th>Password setup</th><th>Active</th><th>Actions</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.userId || '—')}</td><td>${esc(r.name)}</td><td>${esc(r.email)}</td><td>${r.role}</td><td><span class="badge ${r.mustChangePassword ? 'warn' : 'ok'}">${r.mustChangePassword ? 'Required' : 'Complete'}</span></td><td><span class="badge ${r.active ? 'ok' : 'danger'}">${r.active ? 'Active' : 'Inactive'}</span></td><td><form class="actions" method="post" action="/owner/users/${r.id}/toggle"><button class="btn secondary">Activate/deactivate</button></form></td></tr>`).join('')}</tbody></table>`;
  render(req, res, 'table-page', { title: 'User Management', form, table });
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
  const intro = `<section class="grid stats"><article class="card stat"><span>Today’s pieces sold</span><span class="stat-value">${s.pieces}</span></article><article class="card stat"><span>Today’s sales amount</span><span class="stat-value">₹${money(s.total)}</span></article><article class="card stat"><span>Cash amount</span><span class="stat-value">₹${money(s.cash)}</span></article><article class="card stat"><span>Online amount</span><span class="stat-value">₹${money(s.online)}</span></article></section>`;
  render(req, res, 'table-page', { title: 'Manager Home', intro, table: '' });
}));

app.get('/manager/stock', requireRole('manager'), aw(async (req, res) => {
  const rows = await itemRows(true);
  const table = `<table><thead><tr><th>Item</th><th>Main Fridge total pcs</th><th>Second Fridge boxes</th><th>Pieces/box</th><th>Low threshold</th><th>Status</th></tr></thead><tbody>${rows.map(r => { const display = stockDisplay(r); return `<tr><td>${esc(r.name)}</td><td>${display.mainPieces}</td><td>${display.secondBoxes}</td><td>${r.piecesPerBox}</td><td>${r.lowStockThreshold}</td><td><span class="badge ${r.mainFridgeQty <= r.lowStockThreshold ? 'danger' : 'ok'}">${r.mainFridgeQty <= r.lowStockThreshold ? 'Low stock' : 'Available'}</span></td></tr>`; }).join('') || '<tr><td colspan="6" class="empty">No stock available.</td></tr>'}</tbody></table>`;
  render(req, res, 'table-page', { title: 'Available Stock', table });
}));

app.get('/manager/pos', requireRole('manager'), aw(async (req, res) => {
  const rows = await itemRows(true);
  const billTabs = Array.from({ length: 5 }, (_, i) => `<button class="bill-tab ${i === 0 ? 'active' : ''}" type="button" data-draft-slot="${i + 1}">Bill ${i + 1}</button>`).join('');
  const body = `<form method="post" action="/manager/pos" class="zepto-pos pos-billing" data-pos-form><header class="pos-storefront"><label class="pos-search">🔎<input data-product-search placeholder="Search by kulfi name or item code"></label><div class="filter-panel"><label>Stock view<select data-stock-filter><option value="all">All active items</option><option value="in">Main Fridge available</option><option value="low">Refill needed</option></select></label><button class="btn secondary" type="button" data-product-reset>Reset</button></div></header><section class="pos-market"><main class="market-body"><div class="product-board">${rows.map(r => { const display = stockDisplay(r); const inStock = r.mainFridgeQty > 0; return `<article class="item-row product-card ${r.mainFridgeQty <= r.lowStockThreshold ? 'low' : ''}" data-price="${Number(r.mrp || 0)}" data-product-name="${esc(`${r.name} ${r.itemCode || ''}`).toLowerCase()}" data-stock-status="${inStock ? 'in' : 'low'}"><div class="product-media">${r.imageData ? `<img class="item-thumb" src="${esc(r.imageData)}" alt="${esc(r.name)} image">` : '<span>🍦</span>'}</div><div class="product-info"><h3>${esc(r.name)}</h3><div class="price-line"><strong>₹${money(r.mrp)}</strong><span class="price-action"><button class="btn primary add-btn" type="button" data-qty-step="1">ADD</button><span class="zepto-counter" aria-label="Quantity counter"><button type="button" data-qty-step="-1">−</button><span data-qty-display>0</span><button type="button" data-qty-step="1">+</button></span></span></div><p class="stock-line">Main Fridge: <strong>${display.mainPieces} pcs</strong></p><label class="inline-check"><input class="free-toggle" type="checkbox" name="free_${r.id}" value="1"> Complimentary</label></div><input class="sale-qty" name="qty_${r.id}" type="number" min="0" max="${r.mainFridgeQty}" value="0" inputmode="numeric"><output class="line-total">₹0.00</output></article>`; }).join('') || '<p class="empty">No active items are available.</p>'}</div></main><aside class="card payment-card pos-cart"><h2>Cart</h2><div class="cart-preview" data-cart-preview><p class="empty">No items added yet.</p></div><div class="cart-total-row"><strong>Total</strong><strong data-cart-total>₹0.00</strong></div><div class="payment-methods" role="group" aria-label="Payment method"><span>Payment Method <em>*</em></span><input name="paymentMethod" data-payment-method type="hidden" value=""><button class="btn secondary" type="button" data-pay-mode="cash">Cash</button><button class="btn secondary" type="button" data-pay-mode="online">Online</button></div><div class="payment-split"><label>Cash<input name="cashAmount" data-cash-amount type="number" min="0" step="0.01" value="0.00"></label><label>Online<input name="onlineAmount" data-online-amount type="number" min="0" step="0.01" value="0.00"></label></div><input name="totalAmountPreview" data-total-amount type="hidden" value="0.00"><label>Remarks<textarea name="remark" rows="3" data-draft-field placeholder="Global bill remarks"></textarea></label><button class="primary save-bill" data-finalize-bill>Save Bill</button></aside></section><details class="draft-dock"><summary><span class="draft-label">Draft bills</span><span class="draft-hint">Expand to switch or clear draft bills</span></summary><div class="draft-panel">${billTabs}<button class="draft-clear" type="button" data-draft-delete>Clear</button></div></details></form>`;
  render(req, res, 'table-page', { title: 'POS Billing', intro: body, table: '' });
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
      const paymentMethod = String(req.body.paymentMethod || '').trim();
      if (!['cash', 'online'].includes(paymentMethod)) throw new Error('Select Cash or Online before saving the bill');
      const cash = number(req.body.cashAmount);
      const online = number(req.body.onlineAmount);
      if (paymentMethod === 'cash' && online > 0.009) throw new Error('Cash bills cannot include an online amount');
      if (paymentMethod === 'online' && cash > 0.009) throw new Error('Online bills cannot include a cash amount');
      if (Math.abs((cash + online) - total) > 0.009) throw new Error('Invalid payment amount: cash + online must equal bill total');
      const now = new Date();
      const sale = await c.sales.insertOne({ billNumber: makeBillNumber(), managerId: objectId(req.user.id), totalAmount: total, cashAmount: cash, onlineAmount: online, remark: req.body.remark || '', customerName: '', type: 'sale', originalSaleId: null, createdAt: now, updatedAt: now }, { session });
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
  const config = databaseConfigSummary();
  console.error('Application startup/request error', {
    message: err.message,
    name: err.name,
    mongo: config
  });
  const reason = config.hasUri ? err.message : 'MONGODB_URI is missing in this deployment environment';
  const message = process.env.NODE_ENV === 'production'
    ? `Database connection failed or the application could not finish startup. ${reason}. Check Vercel Project Settings > Environment Variables and MongoDB Atlas Network Access, then redeploy.`
    : `Database error or unexpected application error: ${err.message}`;
  res.status(503).send(message);
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
