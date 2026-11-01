# Crevo

The AI operating system for creators: one place for a creator's inbox, brand
deals, content, calendar and analytics.

**Currently included:**

- The marketing site: the landing page (`/`), `/contact-us`, `/privacy-policy`,
  `/terms-of-service` and a 404 page for unknown URLs.
- Auth with Supabase: sign up, sign in, Google sign-in, forgot and reset
  password, email confirmation and sign out (`/auth/*`).
- Database: Prisma schema and migrations for Neon PostgreSQL (`db/`).
- Backend API: Express 5 + TypeScript REST API and background worker
  (`backend/`): inbox, deals, todos, ideas, calendar, videos and clips,
  publishing, analytics, Copilot and Google integrations.

## Project structure

A pnpm monorepo:

| Folder | What it is |
|---|---|
| `frontend/` | Next.js app: marketing site and auth pages |
| `backend/` | Express 5 + TypeScript REST API (`/api/*`) and background worker |
| `db/` | Prisma 7 schema, migrations and the shared Prisma Client |

The frontend uses Next.js App Router with file-based routing: each folder
under `frontend/app/` is a URL.

```
frontend/
├── app/                        routes (file-based)
│   ├── layout.tsx              root layout: <html>, shared styles, site scripts
│   ├── page.tsx                /
│   ├── contact-us/page.tsx     /contact-us
│   ├── privacy-policy/page.tsx /privacy-policy
│   ├── terms-of-service/page.tsx /terms-of-service
│   ├── not-found.tsx           404 page for any unknown URL
│   └── auth/
│       ├── signup/page.tsx     /auth/signup
│       ├── signin/page.tsx     /auth/signin
│       ├── forgot/page.tsx     /auth/forgot   (request a reset link)
│       ├── reset/page.tsx      /auth/reset    (choose a new password)
│       ├── confirm/route.ts    where Supabase's email links land
│       ├── google/route.ts     starts Google sign-in
│       ├── google/callback/route.ts  Google sends people back here
│       └── signout/route.ts    /auth/signout
├── lib/site.ts                 shared page metadata (title, description, social cards)
├── src/
│   ├── views/                  one component per page, composed from its sections
│   ├── sections/<page>/        one file per section (Hero, Features, Pricing, FAQ…)
│   ├── auth/                   Supabase client, form actions, auth page UI
│   ├── components/             MobileMenu, ScrollReveal, SiteInteractions
│   └── styles/                 shared.css (fonts), one CSS file per page, reveal.css (animations)
└── public/assets/img/          images and fonts
```

To add a page, create `frontend/app/<name>/page.tsx`.

## Run it

```bash
cp frontend/.env.example frontend/.env.local   # Supabase URL + anon key
cp db/.env.example db/.env                     # Neon DATABASE_URL, DIRECT_URL
cp backend/.env.example backend/.env           # Neon + Supabase, and any optional keys
pnpm install
pnpm db:migrate     # creates the tables in Neon
pnpm dev            # site on http://localhost:3000, API on http://localhost:4000
```

Without the Supabase values the site still runs; the auth pages say sign-in
isn't set up yet.

## Database setup (Neon)

1. Sign up at [neon.tech](https://neon.tech) → **New project** (Postgres 16 or
   newer, the region nearest your users).
2. On the project dashboard click **Connect** and copy two connection strings:
   - with **Connection pooling** on → `DATABASE_URL` (its host contains `-pooler`);
   - with it off → `DIRECT_URL`.
3. Put both in `db/.env` (copy `db/.env.example`), then create the tables:

```bash
pnpm db:migrate     # applies the migrations to Neon
pnpm db:studio      # optional: browse the data
```

The migrations turn on `pgvector` themselves (Neon has it built in).

## Backend

`backend/.env.example` lists every setting. Required: `DATABASE_URL`,
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `CORS_ORIGIN`, `APP_URL`, `API_URL`. The
rest each switch on one feature (AI with Gemini/Groq, Google integrations,
uploads, briefing emails with Resend); without them the API says that feature
isn't set up.

```bash
pnpm --filter backend dev      # API with reload on http://localhost:4000
pnpm --filter backend test     # needs TEST_DATABASE_URL: a throwaway Postgres with pgvector
```

`GET /health` answers without sign-in; everything under `/api/*` needs a
Supabase access token (`Authorization: Bearer <token>`).

Deploying: `render.yaml` is a Render blueprint for the API (migrations run
before each deploy). The frontend deploys on Vercel with `frontend` as the
root directory.

## Supabase setup (auth)

1. Create a project at [supabase.com](https://supabase.com).
2. **Project settings → API keys**: copy the **Project URL** and the
   **anon / publishable** key into `frontend/.env.local` as
   `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Add the same
   two values to your hosting provider's environment variables.
3. **Authentication → URL Configuration**:
   - **Site URL**: your site's address.
   - **Redirect URLs**: add `https://<your site>/auth/confirm` and
     `https://<your site>/auth/google/callback`, plus the same two with
     `http://localhost:3000` for local development.
4. Optional, "Continue with Google": **Authentication → Sign In / Providers →
   Google** → on, with a Google OAuth client ID and secret.

Set `SITE_URL` (for example `https://crevo.ai`) in production so canonical
links and social cards use your domain.

After signing in, people are sent to `/dashboard`, which shows the 404 page
until the dashboard is added.
