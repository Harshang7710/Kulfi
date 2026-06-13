import { MongoClient, Db, ObjectId, type ClientSession, type Collection } from 'mongodb';
import bcrypt from 'bcryptjs';
import type { InventoryDoc, ItemDoc, SaleDoc, SaleItemDoc, StockMovementDoc, UserDoc } from './types';

const DEFAULT_DB_NAME = 'kulfi_franchise';

declare global {
  // eslint-disable-next-line no-var
  var _kulfiMongoClientPromise: Promise<MongoClient> | undefined;
}

function cleanEnv(value: string | undefined): string {
  const trimmed = String(value || '').trim();
  return trimmed.replace(/^['"]|['"]$/g, '');
}

function mongoUri(): string {
  return cleanEnv(process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL);
}

function mongoDbName(): string {
  return cleanEnv(process.env.MONGODB_DB) || DEFAULT_DB_NAME;
}

export function redactMongoUri(value: string = mongoUri()): string {
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

export function databaseConfigSummary() {
  return {
    hasUri: Boolean(mongoUri()),
    uri: redactMongoUri(),
    database: mongoDbName(),
    serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 5000),
    connectTimeoutMS: Number(process.env.MONGODB_CONNECT_TIMEOUT_MS || 5000)
  };
}

export function objectId(id: string | ObjectId): ObjectId {
  if (id instanceof ObjectId) return id;
  if (!ObjectId.isValid(String(id))) throw new Error('Invalid record id');
  return new ObjectId(String(id));
}

let client: MongoClient | undefined;
let database: Db | undefined;
let readyPromise: Promise<Db> | undefined;

async function createClient(): Promise<MongoClient> {
  const uri = mongoUri();
  if (!uri) throw new Error('MONGODB_URI is required. Add it to your environment variables and redeploy.');
  return new MongoClient(uri, {
    appName: process.env.MONGODB_APP_NAME || 'Desi Mastaani Matka Kulfi',
    serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 5000),
    connectTimeoutMS: Number(process.env.MONGODB_CONNECT_TIMEOUT_MS || 5000)
  }).connect();
}

async function getClient(): Promise<MongoClient> {
  if (client) return client;
  // In dev, cache the client on globalThis so Next.js hot-reload doesn't open a new connection per edit.
  if (process.env.NODE_ENV !== 'production') {
    if (!global._kulfiMongoClientPromise) {
      global._kulfiMongoClientPromise = createClient();
    }
    client = await global._kulfiMongoClientPromise;
    return client;
  }
  client = await createClient();
  return client;
}

async function ensureIndexes(db: Db) {
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

export async function connect(): Promise<Db> {
  if (database) return database;
  const c = await getClient();
  database = c.db(mongoDbName());
  await ensureIndexes(database);
  return database;
}

/** Lazily connects, ensures indexes, and seeds default data on first call. Cached/retried like the previous Express ensureRuntimeReady(). */
export async function getDb(): Promise<Db> {
  if (!readyPromise) {
    readyPromise = connect()
      .then(async (db) => {
        await seedIfEmpty();
        return db;
      })
      .catch((error) => {
        readyPromise = undefined;
        throw error;
      });
  }
  return readyPromise;
}

export interface Collections {
  users: Collection<UserDoc>;
  items: Collection<ItemDoc>;
  inventory: Collection<InventoryDoc>;
  sales: Collection<SaleDoc>;
  saleItems: Collection<SaleItemDoc>;
  stockMovements: Collection<StockMovementDoc>;
}

export function collectionsFor(db: Db): Collections {
  return {
    users: db.collection<UserDoc>('users'),
    items: db.collection<ItemDoc>('items'),
    inventory: db.collection<InventoryDoc>('inventory'),
    sales: db.collection<SaleDoc>('sales'),
    saleItems: db.collection<SaleItemDoc>('sale_items'),
    stockMovements: db.collection<StockMovementDoc>('stock_movements')
  };
}

export async function getCollections(): Promise<Collections> {
  const db = await getDb();
  return collectionsFor(db);
}

export function todayBounds() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { from: start, to: end };
}

export { money } from './format';

export function makeBillNumber(prefix = 'DMK'): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;
}

export async function withTransaction<T>(work: (c: Collections, session: ClientSession, db: Db) => Promise<T>): Promise<T> {
  const db = await getDb();
  const c = await getClient();
  const session = c.startSession();
  try {
    let result: T;
    await session.withTransaction(async () => {
      result = await work(collectionsFor(db), session, db);
    });
    return result!;
  } finally {
    await session.endSession();
  }
}

export async function close() {
  if (client) await client.close();
  client = undefined;
  database = undefined;
  readyPromise = undefined;
}

export async function seedIfEmpty(): Promise<boolean> {
  const db = await connect();
  const c = collectionsFor(db);
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
  } as UserDoc);
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
  } as UserDoc);

  const seedItems: [string, string, number, number, number, number, number, number][] = [
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
    const itemResult = await c.items.insertOne(item as ItemDoc);
    await c.inventory.insertOne({ itemId: itemResult.insertedId, mainFridgeQty, secondFridgeQty, createdAt: now, updatedAt: now } as InventoryDoc);
    await c.stockMovements.insertOne({
      itemId: itemResult.insertedId,
      movementType: 'vendor_stock_in',
      quantityPieces: mainFridgeQty + (secondFridgeQty * piecesPerBox),
      quantityBoxes: secondFridgeQty,
      sourceLocation: 'vendor',
      destinationLocation: 'main_and_second_fridges',
      notes: 'Opening seed stock',
      createdBy: ownerResult.insertedId,
      createdAt: now
    } as StockMovementDoc);
  }

  const malai = await c.items.findOne({ itemCode: 'KULFI-MALAI' });
  if (!malai) throw new Error('Seed item KULFI-MALAI not found after insert');

  const saleResult = await c.sales.insertOne({
    billNumber: makeBillNumber(),
    managerId: managerResult.insertedId,
    totalAmount: 120,
    cashAmount: 60,
    onlineAmount: 60,
    remark: 'Seed sale',
    customerName: 'Walk-in seed customer',
    type: 'sale',
    originalSaleId: null,
    createdAt: now,
    updatedAt: now
  } as SaleDoc);
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
  } as SaleItemDoc);
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
  } as StockMovementDoc);
  return true;
}
