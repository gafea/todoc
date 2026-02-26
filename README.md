This is a [Next.js](https://nextjs.org) todo app with passkey-only authentication (WebAuthn) backed by Prisma + SQLite.

## Getting Started

1. Copy environment variables:

```bash
cp .env.example .env
```

2. Install dependencies:

```bash
npm install
```

3. Create the database and generate Prisma client:

```bash
npm run prisma:migrate -- --name init
npm run prisma:generate
```

4. Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

Auth routes are under `app/api/auth/*`.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Environment Notes

- `APP_BASE_URL` and `EXPECTED_ORIGIN` should match the app origin used in browser.
- `RP_ID` is usually `localhost` in local development.
- `SECRET_COOKIE_PASSWORD` must be at least 32 characters.
