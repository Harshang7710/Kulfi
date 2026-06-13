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
- Kulfi-themed responsive UI with reusable card, table, badge, notice, shell, sidebar, and form patterns, built on a design system derived from the brand logo's coral-red/gold/cream/maroon palette.
- Provided Desi Mastaani logo integrated into the login page and authenticated sidebar/header brand surfaces via `public/logo.svg`, plus a matching `public/manifest.webmanifest` and favicon.
- Accessible markup: skip-to-content link, `aria-label`/`aria-current`/`role="alert"` attributes, visible focus rings, and dismissible notices.
- Production hardening: strict Content-Security-Policy, CSRF protection on every state-changing form, login rate limiting, fail-fast environment validation, and themed 404/error pages.

## Setup

1. Copy the environment file:

   ```bash
   cp .env.example .env
   ```

2. Set a strong `JWT_SECRET` and your MongoDB Atlas `MONGODB_URI` in `.env`. `JWT_SECRET` must
   be a random string of at least 32 characters and must not be the development default —
   generate one with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.
   When `NODE_ENV=production`, the app refuses to start if `JWT_SECRET` or `MONGODB_URI` is
   missing or invalid (see [Security & production hardening](#security--production-hardening)).
   Do not commit real database credentials to git.

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

This app is Vercel-ready through `api/index.js` and `vercel.json`. The serverless entry point lazily connects to MongoDB and seeds default data on the first request, while `vercel.json` explicitly includes the `views/` and `public/` assets needed by Express/EJS at runtime using Vercel's string glob format. The app does not try to create a local `/data` directory or use a filesystem database in Vercel's read-only runtime.

Set these Vercel environment variables before deploying:

- `MONGODB_URI` with your MongoDB Atlas connection string. Do not commit the real URI to git; paste it into Vercel Project Settings > Environment Variables for Production/Preview/Development and redeploy.
- `MONGODB_DB` (optional, defaults to `kulfi_franchise`).
- `JWT_SECRET` with a long random value.
- `COOKIE_NAME` (optional, defaults to `kulfi_session`).
- `MONGODB_SERVER_SELECTION_TIMEOUT_MS` / `MONGODB_CONNECT_TIMEOUT_MS` (optional, default to `5000`) to keep serverless requests from waiting on MongoDB's longer default timeout if Atlas networking or credentials are misconfigured.

For the MongoDB Atlas string you provided, set it in Vercel exactly as the `MONGODB_URI` value, set `MONGODB_DB=kulfi_franchise`, redeploy, and confirm Atlas Network Access allows Vercel serverless traffic. If Vercel still returns a function error, open the Vercel Function logs; this app now reports whether the URI is missing and logs a redacted MongoDB target for debugging.

After changing from any older SQLite/filesystem build, redeploy the latest commit so Vercel no longer runs stale code that references `/var/task/data`.

## Conflict-resolution validation

This branch includes a small conflict-marker check for the files that commonly conflict during the MongoDB/logo migration. Run it before pushing or opening a PR:

```bash
npm run check:conflicts
```

For the exact files GitHub most recently reported (`README.md`, `src/db.js`, and `src/server.js`), run:

```bash
npm run check:reported-conflicts
```

The main check scans every tracked text file, including `.env.example`, `README.md`, `package.json`, `public/logo.svg`, `public/styles.css`, `src/auth.js`, `src/db.js`, and `src/server.js`, for unresolved merge markers. The checker also accepts explicit file paths, which is what `check:reported-conflicts` uses for the currently reported GitHub conflict list.


If GitHub still reports PR conflicts after this command passes locally, update the branch from the target branch in GitHub or with `git merge`/`git rebase`; the application files in this branch contain no unresolved Git conflict marker lines.

## Seed logins

- Owner: `owner@desimastaani.test` / `password123`
- Manager: `manager@desimastaani.test` / `password123`

The seed-credential hint on the login page is automatically hidden when `NODE_ENV=production`.

## Views & templates

Every page is a dedicated EJS view in `views/`, rendered through the shared `render()` helper
in `src/server.js` and wrapped by `views/layout.ejs` (sidebar/nav for signed-in users, bare
shell for the login page):

- `views/login.ejs` — sign-in / first-time password setup.
- `views/dashboard.ejs` — owner dashboard (KPIs, revenue trend bars, manager performance, recent movements).
- `views/owner-items.ejs`, `views/owner-inventory.ejs`, `views/owner-movements.ejs`, `views/owner-reports.ejs`, `views/owner-users.ejs` — owner-only management pages.
- `views/manager-home.ejs`, `views/manager-pos.ejs`, `views/manager-returns.ejs`, `views/manager-stock.ejs` — manager workspace pages.
- `views/error.ejs` — themed 404 and error/maintenance page, shown for unknown routes and unhandled errors.
- `views/partials/csrf.ejs` — shared hidden CSRF input, included in every `<form method="post">`.

All view-layer changes are presentation only; POS math, stock movement rules, auth flow, and
the MongoDB schema are unchanged.

## Security & production hardening

- **Environment validation**: on startup, `src/security.js#validateEnv()` checks that
  `JWT_SECRET` is at least 32 characters (and not the development default) and that a MongoDB
  connection string is configured. With `NODE_ENV=production` these checks are fatal; in
  development they log a warning and fall back to insecure defaults for convenience.
- **Content-Security-Policy**: Helmet's CSP is enabled with `default-src 'self'`,
  `script-src 'self'`, `style-src 'self'`, `img-src 'self' data:` (item photos are stored as
  base64 data URLs), `form-action 'self'`, and `frame-ancestors 'none'`. All inline styles/
  scripts have been removed from the views in favor of classes in `public/styles.css`.
- **CSRF protection**: a double-submit-cookie scheme (`src/security.js#csrfProtection`) issues
  an httpOnly `csrf_token` cookie and requires every `POST`/`PUT`/`PATCH`/`DELETE` request to
  echo it back via the hidden `_csrf` field from `views/partials/csrf.ejs`.
- **Login rate limiting**: `POST /login` is limited to 20 attempts per 15 minutes per IP via
  `express-rate-limit`, returning a friendly 429 page on the themed error view.
- **Error pages**: unknown routes return a themed 404, and unhandled errors render
  `views/error.ejs` instead of a raw text/stack response.
- The provided Desi Mastaani Matka Kulfi logo is stored at `public/logo.svg` and is used on
  login, authenticated brand surfaces, the favicon, and `public/manifest.webmanifest`. For
  future brand changes, replace that single asset and keep the same path.
- `public/robots.txt` disallows all crawling, since this is an internal business tool.
- Use HTTPS in production so secure cookies are enabled with `NODE_ENV=production`.
- Use MongoDB Atlas backups or your MongoDB provider backup tooling for production data protection.
