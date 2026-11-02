# Crevo

**The AI operating system for creators.** Crevo puts a creator's inbox, brand
deals, content, calendar and analytics in one workspace, with an AI Copilot
that answers questions from the creator's own data.

[![CI](https://github.com/Furqan-7/Crevo/actions/workflows/ci.yml/badge.svg)](https://github.com/Furqan-7/Crevo/actions/workflows/ci.yml)
![Node 22](https://img.shields.io/badge/node-22.x-339933?logo=node.js&logoColor=white)
![pnpm](https://img.shields.io/badge/pnpm-10-F69220?logo=pnpm&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)

---

## Table of contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Available scripts](#available-scripts)
- [API overview](#api-overview)
- [Background jobs](#background-jobs)
- [Testing and CI](#testing-and-ci)
- [Deployment](#deployment)
- [Security](#security)
- [Contributing](#contributing)
- [Contributors](#contributors)

---

## Features

### Dashboard (`/dashboard`, signed-in users only)

| Screen | What it does |
|---|---|
| **Onboarding** | A short first-visit setup: name, niche, goals, connected accounts, briefing time and an optional sample workspace. |
| **Today** | The day at a glance: summary, alerts, to-dos and content ideas. |
| **Inbox** | Gmail messages and YouTube comments in one list, sorted by category, with AI-drafted replies to approve, edit, save as Gmail drafts or post as YouTube replies. |
| **Deals** | A brand-deal pipeline with stages, deliverables, terms, risks and a deal health score. Upload a contract PDF and the AI pulls out the brand, fee, deliverables and due date. |
| **Publish** | Upload a long video; Crevo transcribes it, suggests clips, renders vertical 9:16 shorts that follow the speaker, writes per-platform captions and schedules posts (YouTube Shorts uploads directly; Instagram and TikTok are prepared as "ready to post"). |
| **Calendar** | Your Google Calendar plus Crevo's own events (shoots, deadlines, posts). |
| **Analytics** | Channel and content performance from YouTube and imported Instagram data. |
| **Settings** | Profile, connected accounts, briefing email, sample data and account deletion. |
| **Copilot** | A chat assistant that uses tools over your workspace and RAG search (messages, replies, contracts, transcripts), so answers come from your data. It still answers the suggested questions from the data when no AI key is set. |

### Also included

- **Marketing site**: landing page (`/`), `/contact-us`, `/privacy-policy`,
  `/terms-of-service`, a custom 404, `sitemap.xml`, `robots.txt` and social
  link-preview images.
- **Authentication** with Supabase: sign up, sign in, Google sign-in, forgot and
  reset password, email confirmation and sign out (`/auth/*`).
- **Morning briefing email** sent at each creator's local time (via Resend).
- **Sample workspace**: new accounts start with sample data so every screen has
  something to show until Gmail, Calendar and YouTube are connected.

---

## Tech stack

| Layer | Technologies |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript, CSS Modules |
| Auth | Supabase Auth (`@supabase/ssr`, `@supabase/supabase-js`) |
| Backend | Node.js 22, Express 5, TypeScript, Zod, Helmet, express-rate-limit, Multer |
| Database | PostgreSQL on Neon with `pgvector`, Prisma 7 (`@prisma/adapter-pg`) |
| AI | Google Gemini (text, embeddings, PDF and video input), Groq as a fallback |
| Media | FFmpeg (`ffmpeg-static`) for clip rendering, Supabase Storage for uploads |
| Integrations | Gmail, Google Calendar, YouTube (Google OAuth), Instagram import |
| Email | Resend |
| Testing | Node test runner (backend), Playwright (frontend end-to-end) |
| Tooling | pnpm workspaces, GitHub Actions, Render (API), Vercel (frontend) |

---

## Architecture

```
            ┌──────────────────────────┐
 Browser ──▶│  frontend/  (Next.js)    │── Supabase Auth (sign-in, sessions)
            │  site, auth, dashboard   │
            └────────────┬─────────────┘
                         │  HTTPS + Bearer <Supabase access token>
            ┌────────────▼─────────────┐      ┌───────────────────────────┐
            │  backend/  (Express 5)   │─────▶│ Gemini / Groq (AI)        │
            │  REST API  /api/*        │─────▶│ Google APIs (Gmail, Cal,  │
            │  + background worker     │      │ YouTube), Resend, Storage │
            └────────────┬─────────────┘      └───────────────────────────┘
                         │  Prisma Client (db/)
            ┌────────────▼─────────────┐
            │  PostgreSQL (Neon)       │
            │  + pgvector embeddings   │
            └──────────────────────────┘
```

- The **frontend** signs people in with Supabase and calls the API with their
  Supabase access token.
- The **backend** verifies the token on every `/api/*` request, stores data
  through the shared Prisma Client in `db/`, and runs a database-backed job
  queue for syncs, alerts, briefings, publishing and embeddings.
- The **database** package holds the Prisma schema and migrations; the
  migrations enable `pgvector` for workspace search.

---

## Project structure

A pnpm monorepo with three packages:

| Folder | What it is |
|---|---|
| `frontend/` | Next.js app: marketing site, auth pages and the dashboard |
| `backend/` | Express 5 + TypeScript REST API (`/api/*`) and background worker |
| `db/` | Prisma 7 schema, migrations and the shared Prisma Client |
| `scripts/` | `check-setup.mjs` (checks your `.env` files) and `start-api.mjs` (migrates, then starts the API) |
| `.github/workflows/` | CI pipeline |
| `render.yaml` | Render blueprint for deploying the API |

```
frontend/
├── app/                          routes (file-based: each folder is a URL)
│   ├── layout.tsx                root layout: <html>, fonts
│   ├── route.ts                  / (serves the landing page from landing/index.html)
│   ├── (site)/                   marketing pages (group name isn't in the URL)
│   │   ├── contact-us/           /contact-us
│   │   ├── privacy-policy/       /privacy-policy
│   │   └── terms-of-service/     /terms-of-service
│   ├── auth/                     signup, signin, forgot, reset, confirm, google, signout
│   ├── dashboard/
│   │   ├── onboarding/           first-visit setup
│   │   ├── (workspace)/          today, inbox, publish, deals, calendar, analytics, settings
│   │   └── _shell/               sidebar, API client, Copilot, notifications, shared UI
│   ├── health/route.ts           health check
│   ├── sitemap.ts, robots.ts     /sitemap.xml, /robots.txt
│   └── global-not-found.tsx      the 404 page
├── landing/index.html            the landing page
├── src/                          views, page sections, auth helpers, components, styles
├── e2e/                          Playwright tests
├── proxy.ts                      sends signed-out visitors from /dashboard to sign-in
└── next.config.ts                security headers and Content Security Policy

backend/src/
├── app.ts, index.ts, worker.ts   Express app, server entry, standalone worker entry
├── config/env.ts                 environment validation and feature flags
├── routes/ → controllers/ → services/   request flow per resource
├── schemas/                      Zod request schemas
├── middleware/                   auth, validation, rate limits, errors, request logs
├── jobs/                         queue, scheduler and job handlers
├── lib/                          AI, Google, FFmpeg, storage, email, Supabase clients
└── email/                        briefing email template

db/
├── prisma/schema.prisma          data model
├── prisma/migrations/            SQL migrations
└── src/index.ts                  exports the shared Prisma Client
```

---

## Getting started

### Prerequisites

- **Node.js 22.x**
- **pnpm 10** (`corepack enable` sets up the version pinned in `package.json`)
- A **[Neon](https://neon.tech)** PostgreSQL database (or any Postgres 16+ with `pgvector`)
- A **[Supabase](https://supabase.com)** project for authentication

### 1. Clone and install

```bash
git clone https://github.com/Furqan-7/Crevo.git
cd Crevo
pnpm install
```

### 2. Create the environment files

```bash
cp frontend/.env.example frontend/.env.local   # Supabase URL + anon key, NEXT_PUBLIC_API_URL
cp db/.env.example db/.env                     # Neon DATABASE_URL, DIRECT_URL
cp backend/.env.example backend/.env           # Neon + Supabase, plus optional keys
```

Fill them in (see [Environment variables](#environment-variables)), then check
them:

```bash
pnpm check:setup
```

`check:setup` lists any required key that is missing or still the example
value, checks that the frontend and backend use the same Supabase project,
asks Supabase whether the key works, checks the Neon URLs and shows which
optional features are on. It never prints your keys. Add `--offline` to skip
the Supabase request.

### 3. Set up the database (Neon)

1. Create a project at [neon.tech](https://neon.tech) (Postgres 16 or newer).
2. Click **Connect** and copy two connection strings:
   - with **Connection pooling** on → `DATABASE_URL` (host contains `-pooler`);
   - with it off → `DIRECT_URL`.
3. Put both in `db/.env` (and `DATABASE_URL` in `backend/.env`), then run:

```bash
pnpm db:migrate     # creates the tables (enables pgvector automatically)
pnpm db:studio      # optional: browse the data
```

### 4. Set up authentication (Supabase)

1. Create a project at [supabase.com](https://supabase.com).
2. **Project settings → API keys**: copy the **Project URL** and the
   **anon / publishable** key into `frontend/.env.local`
   (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) and
   `backend/.env` (`SUPABASE_URL`, `SUPABASE_ANON_KEY`).
3. **Authentication → URL Configuration**:
   - **Site URL**: your site's address.
   - **Redirect URLs**: `https://<your site>/auth/confirm` and
     `https://<your site>/auth/google/callback`, plus the same two on
     `http://localhost:3000` for local development.
4. Optional, "Continue with Google": **Authentication → Sign In / Providers →
   Google**, with a Google OAuth client ID and secret.

Without Supabase values the site still runs; the auth pages say sign-in isn't
set up yet.

### 5. Run it

```bash
pnpm dev
```

- Website and dashboard: <http://localhost:3000>
- API: <http://localhost:4000> (health check at `/health`)

After signing up, you go through onboarding and land on `/dashboard` with a
sample workspace.

---

## Environment variables

Each package has a commented `.env.example`; these are the main settings.

### `backend/.env`

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | Neon pooled connection string |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Yes | Verifies sign-ins |
| `CORS_ORIGIN` | Yes | Frontend origin(s), comma-separated |
| `APP_URL` | Yes | Frontend public origin (email links, end of "Connect Google") |
| `API_URL` | Yes | This API's public origin (Google OAuth callback) |
| `PORT`, `NODE_ENV` | No | Defaults: `4000`, `development` |
| `SUPABASE_SERVICE_ROLE_KEY`, `STORAGE_BUCKET` | No | Video uploads, rendered clips and account deletion |
| `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_EMBEDDING_MODEL` | No | AI features and workspace search embeddings |
| `GROQ_API_KEY`, `GROQ_MODEL` | No | AI fallback for text and tools |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY` | No | Gmail, Calendar and YouTube integrations (`openssl rand -base64 32` for the key) |
| `RESEND_API_KEY`, `EMAIL_FROM` | No | Morning briefing emails |
| `RUN_WORKER` | No | `true` runs the background worker inside the API process |

Optional features switch on when their keys are set; without them the API
reports that the feature isn't set up.

### `frontend/.env.local`

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase Auth in the browser |
| `NEXT_PUBLIC_API_URL` | Yes | Where the backend runs |
| `APP_URL` | No | Public origin when behind a proxy |
| `SITE_URL` | No | Canonical links, social cards, sitemap and robots.txt |

### `db/.env`

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | Pooled connection (runtime) |
| `DIRECT_URL` | Yes | Direct connection (migrations) |

> Never commit `.env` files; they are ignored by `.gitignore`. Never put the
> Supabase service-role key in the frontend.

---

## Available scripts

Run from the repository root:

| Command | What it does |
|---|---|
| `pnpm dev` | Builds `db`, then runs the frontend (`:3000`) and API (`:4000`) together |
| `pnpm build` | Builds `db`, `backend` and `frontend` |
| `pnpm start` | Starts the built frontend |
| `pnpm typecheck` | Type-checks all three packages |
| `pnpm check:setup` | Validates the three `.env` files |
| `pnpm db:migrate` | Creates and applies migrations in development |
| `pnpm db:deploy` | Applies pending migrations (production) |
| `pnpm db:generate` | Regenerates the Prisma Client |
| `pnpm db:studio` | Opens Prisma Studio |
| `pnpm build:api` | Installs and builds `db` + `backend` (used on Render) |
| `pnpm start:api` | Applies migrations, then starts the API |

Per-package:

| Command | What it does |
|---|---|
| `pnpm --filter backend dev` | API with live reload |
| `pnpm --filter backend test` | Backend tests (needs `TEST_DATABASE_URL`) |
| `pnpm --filter backend worker` | Runs the background worker on its own |
| `pnpm --filter frontend dev` | Next.js dev server |
| `pnpm --filter frontend test:e2e` | Playwright end-to-end tests |

---

## API overview

`GET /health` is public. Everything under `/api/*` needs a Supabase access
token: `Authorization: Bearer <token>`.

| Resource | Endpoints |
|---|---|
| Profile | `GET/PATCH /api/profile`, `PUT /api/profile/accounts/:provider`, `POST /api/profile/onboarding` |
| Workspace | `POST /api/workspace/sample`, `DELETE /api/workspace` |
| Summary | `GET /api/summary` |
| Messages | `GET /api/messages`, `POST /api/messages/approve`, `PATCH /api/messages/:id`, `POST /api/messages/:id/drafts` |
| Deals | `GET/POST /api/deals`, `GET/PATCH /api/deals/:slug`, `PATCH /api/deals/:slug/deliverables/:deliverableId` |
| Contracts | `POST /api/contracts/read` (PDF upload, up to 15 MB) |
| To-dos | `GET/POST /api/todos`, `PATCH/DELETE /api/todos/:id` |
| Ideas | `GET/POST /api/ideas` |
| Calendar | `GET/POST /api/events`, `PATCH/DELETE /api/events/:id` |
| Videos | `GET /api/videos`, `POST /api/videos/uploads`, `GET /api/videos/:id`, `POST /api/videos/:id/process` |
| Clips | `PATCH /api/clips/:id`, `PATCH /api/clips/:id/captions/:platform`, `POST /api/clips/:id/captions/:platform/rewrite`, `GET /api/clips/:id/short`, `POST /api/clips/:id/render`, `POST /api/clips/:id/schedule` |
| Posts | `GET /api/posts`, `GET /api/posts/:id/download` |
| Alerts | `GET /api/alerts`, `POST /api/alerts/read` |
| Analytics | `GET /api/analytics` |
| Copilot | `POST /api/copilot` |
| Integrations | `GET /api/integrations/google/:provider/connect`, `POST /api/integrations/instagram/import`, `POST /api/integrations/:provider/sync`, `DELETE /api/integrations/:provider` |
| Briefing | `GET /api/briefing/preview` |
| Account | `DELETE /api/account` |

AI and upload endpoints have their own rate limits; request bodies are
validated with Zod.

---

## Background jobs

A Postgres-backed queue (`backend/src/jobs/`) runs inside the API when
`RUN_WORKER=true`, or on its own with `pnpm --filter backend start:worker`.
Every minute the scheduler queues what is due:

| Job | When |
|---|---|
| `sync.gmail` / `sync.calendar` / `sync.youtube` | Every 10 min / 15 min / 6 h for connected accounts |
| `alerts.generate` | Hourly per creator |
| `briefing.send` | Once a day at each creator's local briefing time |
| `post.publish` | When a scheduled post's time arrives |
| `rag.embed` | When new text needs embeddings for search |
| `video.process`, `clip.render`, `drafts.write`, `gmail.draft`, `youtube.reply`, `calendar.delete` | On demand from the API |

> On Render's free plan the service sleeps when idle, which pauses syncs and
> briefings; use a paid plan in production.

---

## Testing and CI

```bash
# Backend: needs TEST_DATABASE_URL pointing to a throwaway Postgres with pgvector
pnpm --filter backend test

# Frontend end-to-end (desktop and phone sizes)
pnpm --filter frontend build
pnpm --filter frontend exec playwright install chromium   # once
pnpm --filter frontend test:e2e
```

The Playwright tests cover every marketing page, the 404 page, sitemap,
robots.txt, link previews, navigation, keyboard access, the FAQ and forms, and
the sign-up, sign-in and forgot-password flows.

Every push and pull request runs [`.github/workflows/ci.yml`](.github/workflows/ci.yml):
it applies the migrations to a fresh Postgres with pgvector, type-checks all
packages, runs the backend tests, builds everything and runs the browser tests.

---

## Deployment

### API on Render

`render.yaml` is a Render blueprint: **New → Blueprint →** pick this repo, then
fill in the secrets marked `sync: false`. Migrations run before each deploy.

For a hand-made Render web service:

| Setting | Value |
|---|---|
| Root directory | *(empty)* |
| Build command | `pnpm build:api` |
| Pre-deploy command | `pnpm db:deploy` |
| Start command | `pnpm start:api` |
| Health check path | `/health` |

### Frontend on Vercel

Import the repo with **`frontend`** as the root directory and set
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`NEXT_PUBLIC_API_URL` and `SITE_URL` (e.g. `https://crevo.ai`). The Content
Security Policy reads the Supabase and API URLs at build time, so set them
before deploying.

For Google integrations, add `$API_URL/integrations/google/callback` as an
authorised redirect URI on your Google Cloud OAuth client.

---

## Security

- Security headers on every page (`frontend/next.config.ts`): Content Security
  Policy, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`,
  `Permissions-Policy` and HSTS.
- The API uses Helmet, a CORS allow-list, rate limits and Zod validation.
- Every `/api/*` request is checked against Supabase Auth, and data is scoped
  to the signed-in creator.
- Stored Google tokens are encrypted with `TOKEN_ENCRYPTION_KEY`.
- Uploaded contracts are read in memory and never written to disk.
- `/dashboard` and `/auth` are kept out of search engines via `robots.txt`.

---

## Contributing

1. Fork the repository and create a branch: `git checkout -b feature/my-change`.
2. Make your changes and run `pnpm typecheck` and the tests.
3. Commit with a clear message and open a pull request.

To add a marketing page, create `frontend/app/(site)/<name>/page.tsx`; to add a
dashboard screen, add a folder under `frontend/app/dashboard/(workspace)/`.

---

## Contributors

- [Furqan-7](https://github.com/Furqan-7)
- [akhil-moger05](https://github.com/akhil-moger05)
- [darshan-nk3](https://github.com/darshan-nk3)
- [goutamnaik6360](https://github.com/goutamnaik6360)
