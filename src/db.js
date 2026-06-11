const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const DEFAULT_DB_NAME = 'kulfi_franchise';

function cleanEnv(value) {
  const trimmed = String(value || '').trim();
  return trimmed.replace(/^['\"]|['\"]$/g, '');
}

function mongoUri() {
  return cleanEnv(process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL);
}

function mongoDbName() {
  return cleanEnv(process.env.MONGODB_DB) || DEFAULT_DB_NAME;
}

function redactMongoUri(value = mongoUri()) {
  if (!value) return '(not set)';
  try {
    const parsed = new URL(value);
    if (parsed.password) parsed.password = '***';
    if (parsed.username) parsed.username = `${parsed.username.slice(0, 3)}***`;
    return parsed.toString();
  } catch {
    return '(invalid MongoDB URI format)';
  }
}

function databaseConfigSummary() {
  return {
    hasUri: Boolean(mongoUri()),
    uri: redactMongoUri(),
    database: mongoDbName(),
    serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 5000),
    connectTimeoutMS: Number(process.env.MONGODB_CONNECT_TIMEOUT_MS || 5000)
  };
}

if (!mongoUri() && require.main !== module) {
  console.warn('MONGODB_URI is not set. Add it to .env locally or to Vercel Environment Variables before starting the app.');
}

let client;
let database;

function objectId(id) {
  if (id instanceof ObjectId) return id;
  if (!ObjectId.isValid(String(id))) throw new Error('Invalid record id');
  return new ObjectId(String(id));
}

async function connect() {
  if (database) return database;
  const uri = mongoUri();
  const dbName = mongoDbName();
  if (!uri) throw new Error('MONGODB_URI is required. In Vercel, add it under Project Settings > Environment Variables and redeploy.');
  client = new MongoClient(uri, {
    appName: process.env.MONGODB_APP_NAME || 'Desi Mastaani Matka Kulfi',
    serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 5000),
    connectTimeoutMS: Number(process.env.MONGODB_CONNECT_TIMEOUT_MS || 5000)
  });
  await client.connect();
  database = client.db(dbName);
  await ensureIndexes();
  return database;
}

async function ensureIndexes() {
  const db = database || client.db(mongoDbName());
  await Promise.all([
    db.collection('users').createIndex({ email: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } }),
    db.collection('users').createIndex({ userId: 1 }, { unique: true, sparse: true, collation: { locale: 'en', strength: 2 } }),
    db.collection('items').createIndex({ itemCode: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } }),
    db.collection('items').createIndex({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } }),
    db.collection('inventory').createIndex({ itemId: 1 }, { unique: true }),
    db.collection('sales').createIndex({ billNumber: 1 }, { unique: true }),
    db.collection('sales').createIndex({ managerId: 1, createdAt: -1 }),
    db.collection('sales').createIndex({ createdAt: -1 }),
    db.collection('sale_items').createIndex({ saleId: 1 }),
    db.collection('sale_items').createIndex({ originalSaleItemId: 1 }),
    db.collection('stock_movements').createIndex({ createdAt: -1 }),
    db.collection('stock_movements').createIndex({ itemId: 1, movementType: 1 })
  ]);
}

function collections(db = database) {
  if (!db) throw new Error('Database is not connected');
  return {
    users: db.collection('users'),
    items: db.collection('items'),
    inventory: db.collection('inventory'),
    sales: db.collection('sales'),
    saleItems: db.collection('sale_items'),
    stockMovements: db.collection('stock_movements')
  };
}

async function seedIfEmpty() {
  const db = await connect();
  const c = collections(db);
  const userCount = await c.users.countDocuments();
  if (userCount > 0) return false;

  const now = new Date();
  const passwordHash = bcrypt.hashSync('password123', 12);
  const ownerResult = await c.users.insertOne({
    name: 'Owner Admin',
    userId: '1001',
    email: 'owner@desimastaani.test',
    passwordHash,
    role: 'owner',
    mustChangePassword: false,
    active: true,
    createdAt: now,
    updatedAt: now
  });
  const managerResult = await c.users.insertOne({
    name: 'Cart Manager',
    userId: '2001',
    email: 'manager@desimastaani.test',
    passwordHash,
    role: 'manager',
    mustChangePassword: false,
    active: true,
    createdAt: now,
    updatedAt: now
  });

  const seedItems = [
    ['KULFI-MALAI', 'Malai Matka Kulfi', 60, 32, 24, 18, 75, 35],
    ['KULFI-KESAR', 'Kesar Pista Kulfi', 70, 35, 24, 18, 52, 42],
    ['KULFI-MANGO', 'Mango Mastaani Kulfi', 65, 30, 24, 18, 12, 60],
    ['KULFI-CHOC', 'Chocolate Matka Kulfi', 75, 30, 24, 15, 34, 24],
    ['KULFI-ROSE', 'Rose Badam Kulfi', 80, 38, 24, 12, 22, 18]
  ];

  for (const [itemCode, name, mrp, profitPercentage, piecesPerBox, lowStockThreshold, mainFridgeQty, secondFridgeQty] of seedItems) {
    const item = {
      itemCode,
      name,
      mrp,
      profitPercentage,
      piecesPerBox,
      lowStockThreshold,
      active: true,
      hidden: false,
      createdAt: now,
      updatedAt: now
    };
    const itemResult = await c.items.insertOne(item);
    await c.inventory.insertOne({ itemId: itemResult.insertedId, mainFridgeQty, secondFridgeQty, createdAt: now, updatedAt: now });
    await c.stockMovements.insertOne({
      itemId: itemResult.insertedId,
      movementType: 'vendor_stock_in',
      quantityPieces: mainFridgeQty + secondFridgeQty,
      quantityBoxes: (mainFridgeQty + secondFridgeQty) / piecesPerBox,
      sourceLocation: 'vendor',
      destinationLocation: 'both_fridges',
      notes: 'Opening seed stock',
      createdBy: ownerResult.insertedId,
      createdAt: now
    });
  }

  const malai = await c.items.findOne({ itemCode: 'KULFI-MALAI' });
  const saleResult = await c.sales.insertOne({
    billNumber: makeBillNumber(),
    managerId: managerResult.insertedId,
    totalAmount: 120,
    cashAmount: 60,
    onlineAmount: 60,
    remark: 'Seed sale',
    type: 'sale',
    originalSaleId: null,
    createdAt: now,
    updatedAt: now
  });
  const saleItemResult = await c.saleItems.insertOne({
    saleId: saleResult.insertedId,
    itemId: malai._id,
    quantity: 2,
    mrp: 60,
    isFree: false,
    lineTotal: 120,
    originalSaleItemId: null,
    createdAt: now,
    updatedAt: now
  });
  await c.inventory.updateOne({ itemId: malai._id }, { $inc: { mainFridgeQty: -2 }, $set: { updatedAt: now } });
  await c.stockMovements.insertOne({
    itemId: malai._id,
    movementType: 'pos_sale',
    quantityPieces: -2,
    quantityBoxes: -2 / malai.piecesPerBox,
    sourceLocation: 'main_fridge',
    destinationLocation: 'customer',
    notes: 'Seed POS sale',
    saleId: saleResult.insertedId,
    saleItemId: saleItemResult.insertedId,
    createdBy: managerResult.insertedId,
    createdAt: now
  });
  return true;
}

function todayBounds() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { from: start, to: end };
}

function money(value) {
  return Number(value || 0).toFixed(2);
}

function makeBillNumber(prefix = 'DMK') {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;
}

async function withTransaction(work) {
  const db = await connect();
  const session = client.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(collections(db), session, db);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

async function close() {
  if (client) await client.close();
  client = null;
  database = null;
}

if (require.main === module) {
  seedIfEmpty()
    .then((seeded) => console.log(seeded ? 'MongoDB seed data created.' : 'MongoDB already contains users; seed skipped.'))
    .then(close)
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}

module.exports = { connect, collections, seedIfEmpty, todayBounds, money, makeBillNumber, objectId, withTransaction, close, databaseConfigSummary, redactMongoUri };
