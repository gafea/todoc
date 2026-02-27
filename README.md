This is a [Next.js](https://nextjs.org) todo app with passkey-only authentication (WebAuthn) backed by Prisma.

- Local/non-Vercel: SQLite (`file:./dev.db`)
- Vercel: PostgreSQL (Supabase)

## Getting Started

1. Install dependencies:

```bash
npm install
```

2. Configure environment variables:

```bash
cp .env.example .env
```

For local development, the default `DATABASE_URL=file:./dev.db` is ready to use.

3. Apply database migrations and generate Prisma client:

```bash
npm run prisma:migrate:deploy
npm run prisma:generate
```

4. Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.
If `APP_BASE_URL` is a localhost URL (for example `http://localhost:4000`), `npm run dev` and `npm run start` automatically use that port.

Auth routes are under `app/api/auth/*`.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Environment Notes

- `APP_BASE_URL` should match the app origin used in browser.
- `RP_ID` is usually `localhost` in local development.
- `SECRET_COOKIE_PASSWORD` must be at least 32 characters.

## Deploying to Vercel with Supabase

1. Create a Supabase project and copy both connection strings:

- pooled URL (for app runtime)
- direct URL (for migrations)

2. Set these environment variables in Vercel:

- `DATABASE_URL` (Supabase pooled URL, typically port 6543)
- `DIRECT_URL` (Supabase direct URL, typically port 5432)
- `APP_BASE_URL`
- `RP_ID`
- `SECRET_COOKIE_PASSWORD`

3. Ensure Vercel build command is `npm run vercel-build` (already configured in `vercel.json`).

4. During each deploy, Vercel runs:

- `prisma generate`
- `prisma migrate deploy`
- `next build`

This keeps Supabase schema migrations in sync as part of deployment.

## How DB selection works

- `prisma.config.ts` selects Prisma schema/migrations by environment:
  - Vercel (`VERCEL=1`): `prisma/schema.vercel.prisma` + `prisma/migrations-postgres`
  - Non-Vercel: `prisma/schema.prisma` + `prisma/migrations` (SQLite)
