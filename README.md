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

## Seed logins

- Owner: `owner@desimastaani.test` / `password123`
- Manager: `manager@desimastaani.test` / `password123`

## Production notes

- Replace `public/logo.svg` with the provided final brand logo if needed; the app already references it on login, the authenticated shell, and brand surfaces.
- Use HTTPS in production so secure cookies are enabled with `NODE_ENV=production`.
- Use MongoDB Atlas backups or your MongoDB provider backup tooling for production data protection.
