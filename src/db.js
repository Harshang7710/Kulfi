const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'kulfi.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      passwordHash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('owner','manager')),
      active INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      itemCode TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL UNIQUE,
      mrp REAL NOT NULL CHECK(mrp > 0),
      profitPercentage REAL NOT NULL DEFAULT 0,
      piecesPerBox INTEGER NOT NULL CHECK(piecesPerBox > 0),
      lowStockThreshold INTEGER NOT NULL DEFAULT 0 CHECK(lowStockThreshold >= 0),
      active INTEGER NOT NULL DEFAULT 1,
      hidden INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      itemId INTEGER NOT NULL UNIQUE REFERENCES items(id) ON DELETE CASCADE,
      mainFridgeQty INTEGER NOT NULL DEFAULT 0 CHECK(mainFridgeQty >= 0),
      secondFridgeQty INTEGER NOT NULL DEFAULT 0 CHECK(secondFridgeQty >= 0),
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      billNumber TEXT NOT NULL UNIQUE,
      managerId INTEGER NOT NULL REFERENCES users(id),
      totalAmount REAL NOT NULL DEFAULT 0,
      cashAmount REAL NOT NULL DEFAULT 0,
      onlineAmount REAL NOT NULL DEFAULT 0,
      remark TEXT,
      type TEXT NOT NULL CHECK(type IN ('sale','return')),
      originalSaleId INTEGER REFERENCES sales(id),
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      saleId INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      itemId INTEGER NOT NULL REFERENCES items(id),
      quantity INTEGER NOT NULL,
      mrp REAL NOT NULL,
      isFree INTEGER NOT NULL DEFAULT 0,
      lineTotal REAL NOT NULL DEFAULT 0,
      originalSaleItemId INTEGER REFERENCES sale_items(id),
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS stock_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      itemId INTEGER NOT NULL REFERENCES items(id),
      movementType TEXT NOT NULL CHECK(movementType IN ('vendor_stock_in','transfer_second_to_main','stock_adjustment','return_movement','pos_sale')),
      quantityPieces INTEGER NOT NULL,
      quantityBoxes REAL NOT NULL DEFAULT 0,
      sourceLocation TEXT,
      destinationLocation TEXT,
      notes TEXT,
      saleId INTEGER REFERENCES sales(id),
      saleItemId INTEGER REFERENCES sale_items(id),
      createdBy INTEGER NOT NULL REFERENCES users(id),
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(createdAt);
    CREATE INDEX IF NOT EXISTS idx_sales_manager ON sales(managerId);
    CREATE INDEX IF NOT EXISTS idx_movements_created ON stock_movements(createdAt);
  `);
}

function seedIfEmpty() {
  const userCount = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  if (userCount > 0) return;
  const passwordHash = bcrypt.hashSync('password123', 12);
  const owner = db.prepare('INSERT INTO users (name,email,passwordHash,role) VALUES (?,?,?,?)')
    .run('Owner Admin', 'owner@desimastaani.test', passwordHash, 'owner').lastInsertRowid;
  const manager = db.prepare('INSERT INTO users (name,email,passwordHash,role) VALUES (?,?,?,?)')
    .run('Cart Manager', 'manager@desimastaani.test', passwordHash, 'manager').lastInsertRowid;
  const items = [
    ['KULFI-MALAI', 'Malai Matka Kulfi', 60, 32, 24, 18, 75, 35],
    ['KULFI-KESAR', 'Kesar Pista Kulfi', 70, 35, 24, 18, 52, 42],
    ['KULFI-MANGO', 'Mango Mastaani Kulfi', 65, 30, 24, 18, 12, 60],
    ['KULFI-CHOC', 'Chocolate Matka Kulfi', 75, 30, 24, 15, 34, 24],
    ['KULFI-ROSE', 'Rose Badam Kulfi', 80, 38, 24, 12, 22, 18]
  ];
  const insertItem = db.prepare(`INSERT INTO items (itemCode,name,mrp,profitPercentage,piecesPerBox,lowStockThreshold) VALUES (?,?,?,?,?,?)`);
  const insertInv = db.prepare('INSERT INTO inventory (itemId,mainFridgeQty,secondFridgeQty) VALUES (?,?,?)');
  const movement = db.prepare(`INSERT INTO stock_movements (itemId,movementType,quantityPieces,quantityBoxes,sourceLocation,destinationLocation,notes,createdBy) VALUES (?,?,?,?,?,?,?,?)`);
  items.forEach(([code, name, mrp, profit, ppb, low, main, second]) => {
    const itemId = insertItem.run(code, name, mrp, profit, ppb, low).lastInsertRowid;
    insertInv.run(itemId, main, second);
    movement.run(itemId, 'vendor_stock_in', main + second, (main + second) / ppb, 'vendor', 'both_fridges', 'Opening seed stock', owner);
  });
  const saleId = db.prepare(`INSERT INTO sales (billNumber,managerId,totalAmount,cashAmount,onlineAmount,remark,type) VALUES (?,?,?,?,?,?,?)`)
    .run(`DMK-${Date.now()}`, manager, 120, 60, 60, 'Seed sale', 'sale').lastInsertRowid;
  const item = db.prepare('SELECT * FROM items WHERE itemCode=?').get('KULFI-MALAI');
  const saleItemId = db.prepare(`INSERT INTO sale_items (saleId,itemId,quantity,mrp,isFree,lineTotal) VALUES (?,?,?,?,?,?)`).run(saleId, item.id, 2, item.mrp, 0, 120).lastInsertRowid;
  db.prepare('UPDATE inventory SET mainFridgeQty = mainFridgeQty - 2, updatedAt=CURRENT_TIMESTAMP WHERE itemId=?').run(item.id);
  movement.run(item.id, 'pos_sale', -2, 0, 'main_fridge', 'customer', 'Seed POS sale', manager);
}

migrate();
seedIfEmpty();

function todayBounds() {
  const today = new Date().toISOString().slice(0, 10);
  return { from: `${today} 00:00:00`, to: `${today} 23:59:59`, date: today };
}
function money(n) { return Number(n || 0).toFixed(2); }
function makeBillNumber(prefix = 'DMK') { return `${prefix}-${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}-${Math.floor(Math.random()*900+100)}`; }

module.exports = { db, todayBounds, money, makeBillNumber };

if (require.main === module) {
  console.log(`Database ready at ${dbPath}`);
}
