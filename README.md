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
- Dashboard (`/dashboard`): onboarding, Today, Inbox, Publish, Deals,
  Calendar, Analytics and Settings, for signed-in users only.

## Project structure

A pnpm monorepo:

| Folder | What it is |
|---|---|
| `frontend/` | Next.js app: marketing site, auth pages and the dashboard |
| `backend/` | Express 5 + TypeScript REST API (`/api/*`) and background worker |
| `db/` | Prisma 7 schema, migrations and the shared Prisma Client |

The frontend uses Next.js App Router with file-based routing: each folder
under `frontend/app/` is a URL.

```
frontend/
├── app/                        routes (file-based)
│   ├── layout.tsx              root layout: <html>, fonts
│   ├── (site)/                 marketing pages (the group name isn't in the URL)
│   │   ├── layout.tsx          animations, mobile menu, FAQ and forms
│   │   ├── page.tsx            /
│   │   ├── contact-us/page.tsx /contact-us
│   │   ├── privacy-policy/page.tsx   /privacy-policy
│   │   └── terms-of-service/page.tsx /terms-of-service
│   ├── global-not-found.tsx    the Crevo 404 page for unknown addresses
│   ├── not-found.tsx           small fallback for notFound() calls
│   ├── sitemap.ts              /sitemap.xml (the public pages)
│   ├── robots.ts               /robots.txt (keeps /dashboard and /auth out of search)
│   ├── opengraph-image.png     link preview image (WhatsApp, LinkedIn, Slack…), 1200×630
│   ├── twitter-image.png       the same image for X
│   ├── dashboard/              /dashboard (signed-in only)
│   │   ├── onboarding/         /dashboard/onboarding (first visit)
│   │   ├── (workspace)/        Today, inbox, publish, deals, calendar, analytics, settings
│   │   └── _shell/             sidebar, API client, shared UI
│   └── auth/                   (/signin, /signup, /login, /register redirect here)
│       ├── signup/page.tsx     /auth/signup
│       ├── signin/page.tsx     /auth/signin
│       ├── forgot/page.tsx     /auth/forgot   (request a reset link)
│       ├── reset/page.tsx      /auth/reset    (choose a new password)
│       ├── confirm/route.ts    where Supabase's email links land
│       ├── google/route.ts     starts Google sign-in
│       ├── google/callback/route.ts  Google sends people back here
│       └── signout/route.ts    /auth/signout
├── proxy.ts                    sends signed-out visitors from /dashboard to sign-in
├── lib/site.ts                 shared page metadata (title, description, social cards)
├── src/
│   ├── views/                  one component per page, composed from its sections
│   ├── sections/<page>/        one file per section (Hero, Features, Pricing, FAQ…)
│   ├── auth/                   Supabase client, form actions, auth page UI
│   ├── components/             MobileMenu, ScrollReveal, SiteInteractions, StepHighlight
│   └── styles/                 shared.css (fonts), one CSS file per page, reveal.css (animations)
└── public/assets/img/          images and fonts
```

To add a page, create `frontend/app/<name>/page.tsx`.

## Run it

```bash
cp frontend/.env.example frontend/.env.local   # Supabase URL + anon key, NEXT_PUBLIC_API_URL
cp db/.env.example db/.env                     # Neon DATABASE_URL, DIRECT_URL
cp backend/.env.example backend/.env           # Neon + Supabase, and any optional keys
pnpm install
pnpm check:setup    # checks the three .env files and tests your Supabase key
pnpm db:migrate     # creates the tables in Neon
pnpm dev            # site on http://localhost:3000, API on http://localhost:4000
```

`pnpm check:setup` lists any required key that's missing or still the example
value, checks that the frontend and backend use the same Supabase project and
key, asks Supabase whether the key works, checks the Neon URLs (pooled for the
app, direct for migrations) and shows which optional features are switched on.
It never prints your keys, and exits with an error if something required is
wrong. Add `--offline` to skip the Supabase request.

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

Every push and pull request runs `.github/workflows/ci.yml` on GitHub: it
applies the migrations to a fresh Postgres with pgvector, type-checks all
three packages, runs the backend tests, builds everything and runs the
frontend browser tests.

## Frontend tests

`frontend/e2e/` holds Playwright tests that open the built site in a real
browser at desktop and phone size: every marketing page loads without errors
or hidden content, the 404 page, sitemap, robots.txt and link previews, the
navigation and short auth addresses (`/signin`, `/signup`…), keyboard access,
the FAQ, use cases and newsletter form, and the sign-up, sign-in and
forgot-password forms.

```bash
pnpm --filter frontend build
pnpm --filter frontend exec playwright install chromium   # once
pnpm --filter frontend test:e2e
```

Deploying: `render.yaml` is a Render blueprint for the API (migrations run
before each deploy). For a hand-made Render web service use root directory
empty, build command `pnpm build:api`, pre-deploy command `pnpm db:deploy`
and start command `pnpm start:api`. The frontend deploys on Vercel with `frontend` as the
root directory.

Security headers are set in `frontend/next.config.ts` for every page: a
Content Security Policy (only this site, Supabase and the API may be
contacted; other sites can't embed Crevo in a frame), `X-Frame-Options`,
`X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` and HSTS.
The policy reads `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_API_URL` at build
time, so set both in Vercel before deploying, or the dashboard can't reach
the API.

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
links, social cards, `/sitemap.xml` and `/robots.txt` use your domain. On
Vercel it falls back to the production domain.

After signing up, people go through a short onboarding and land on
`/dashboard`. A new workspace starts with sample data so every screen has
something to show until Gmail, Calendar and YouTube are connected.
