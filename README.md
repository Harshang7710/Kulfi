# Desi Mastaani Matka Kulfi Franchise Manager

A responsive MongoDB-backed full-stack web application for billing, POS, two-fridge stock management, returns, reports, CSV export, and owner/manager operations for **Desi Mastaani Matka Kulfi**.

## Features

- Secure email/password login with bcrypt password hashes, JWT sessions, and HTTP-only cookies.
- Role-based access control for Owner/Admin and Cart Manager/Shop Manager users.
- Owner dashboard with sales, cash/online payments, inventory value, low-stock warnings, charts, manager performance, and recent stock movements.
- Item catalog management with duplicate item code/name protection and active/hidden controls.
- Two-refrigerator inventory model: Main Fridge and Second Fridge.
- Transactional POS sales that decrement Main Fridge stock and write stock movement ledger entries.
- Manager stock transfers from Second Fridge to Main Fridge.
- Manager returns for today’s own sale lines with stock restoration and linked negative sale rows.
- Owner sales reports and date-filtered CSV export.
- Owner user management for manager and owner accounts.
- MongoDB-backed `/health` endpoint.
- Kulfi-themed responsive UI with reusable card, table, badge, notice, shell, sidebar, and form patterns.
- Provided Desi Mastaani logo integrated into the login page and authenticated sidebar/header brand surfaces via `public/logo.svg`.

## Setup

1. Copy the environment file:

   ```bash
   cp .env.example .env
   ```

2. Set a strong `JWT_SECRET` and your MongoDB Atlas `MONGODB_URI` in `.env`. Do not commit real database credentials to git.

3. Install dependencies:

   ```bash
   npm install
   ```

4. Initialize/seed the MongoDB database:

   ```bash
   npm run db:seed
   ```

5. Run the application:

   ```bash
   npm run dev
   ```

6. Open <http://localhost:3000>.


## Vercel deployment

This app is Vercel-ready through `api/index.js` and `vercel.json`. The serverless entry point lazily connects to MongoDB and seeds default data on the first request, so the app does not try to create a local `/data` directory or use a filesystem database in Vercel's read-only runtime.

Set these Vercel environment variables before deploying:

- `MONGODB_URI` with your MongoDB Atlas connection string.
- `MONGODB_DB` (optional, defaults to `kulfi_franchise`).
- `JWT_SECRET` with a long random value.
- `COOKIE_NAME` (optional, defaults to `kulfi_session`).

After changing from any older SQLite/filesystem build, redeploy the latest commit so Vercel no longer runs stale code that references `/var/task/data`.

## Conflict-resolution validation

This branch includes a small conflict-marker check for the files that commonly conflict during the MongoDB/logo migration. Run it before pushing or opening a PR:

```bash
npm run check:conflicts
```

The check scans `.env.example`, `README.md`, `package.json`, `public/logo.svg`, `public/styles.css`, `src/auth.js`, `src/db.js`, `src/server.js`, `api/index.js`, and `vercel.json` for unresolved merge markers.

## Seed logins

- Owner: `owner@desimastaani.test` / `password123`
- Manager: `manager@desimastaani.test` / `password123`

## Production notes

- The provided Desi Mastaani Matka Kulfi logo is stored at `public/logo.svg` and is used on login plus authenticated brand surfaces. For future brand changes, replace that single asset and keep the same path.
- Use HTTPS in production so secure cookies are enabled with `NODE_ENV=production`.
- Use MongoDB Atlas backups or your MongoDB provider backup tooling for production data protection.
