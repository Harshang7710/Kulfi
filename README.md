# Desi Mastaani Matka Kulfi

A role-based franchise management application built with Next.js App Router, TypeScript, and MongoDB. It includes owner administration, manager stock workflows, returns, reports, and a multi-draft POS.

## Requirements

- Node.js 20 or newer
- npm
- MongoDB or MongoDB Atlas

## Local setup

```bash
cp .env.example .env.local
npm ci
npm run db:seed
npm run dev
```

Open `http://localhost:3000`. The seed command only inserts demo data when the users collection is empty.

Demo accounts created by the seed script:

- Owner: `owner@desimastaani.test` / `password123`
- Manager: `manager@desimastaani.test` / `password123`

Do not use these demo credentials in production. Create real users and remove or rotate the seeded accounts before launch.

## Environment

Set these values locally and in the deployment environment:

```env
MONGODB_URI=mongodb+srv://...
MONGODB_DB=kulfi_franchise
JWT_SECRET=replace-with-a-long-random-secret
COOKIE_NAME=kulfi_session
```

See `.env.example` for connection timeout and application settings.

## Commands

- `npm run dev` starts the development server.
- `npm run typecheck` checks TypeScript.
- `npm run check` runs the complete static verification suite.
- `npm run build` creates the production build.
- `npm run start` starts the production server.
- `npm run db:seed` explicitly seeds an empty database.

## Routes

- `/login` authenticates owners and managers.
- `/owner/*` provides user, item, inventory, movement, and report administration.
- `/manager/*` provides the dashboard, stock transfer, returns, and POS workflows.
- `/health` reports application and MongoDB health without requiring authentication.

## Deployment

Vercel should detect this repository as a Next.js application automatically. Configure `MONGODB_URI`, `MONGODB_DB`, and a strong `JWT_SECRET` for Preview and Production environments, then deploy without a custom `vercel.json` runtime override.

Before release, run:

```bash
npm ci
npm run check
npm run build
```

After deployment, verify `/health`, sign-in for both roles, stock movement, a mixed-payment POS sale, return processing, and owner reports.
