# Crevo

The AI operating system for creators: one place for a creator's inbox, brand
deals, content, calendar and analytics.

**Currently included:** the marketing site: the landing page (`/`), `/contact-us`,
`/privacy-policy`, `/terms-of-service` and a 404 page for unknown URLs.

## Project structure

Next.js App Router with file-based routing: each folder under `frontend/app/`
is a URL.

```
frontend/
├── app/                        routes (file-based)
│   ├── layout.tsx              root layout: <html>, shared styles, site scripts
│   ├── page.tsx                /
│   ├── contact-us/page.tsx     /contact-us
│   ├── privacy-policy/page.tsx /privacy-policy
│   ├── terms-of-service/page.tsx /terms-of-service
│   └── not-found.tsx           404 page for any unknown URL
├── lib/site.ts                 shared page metadata (title, description, social cards)
├── src/
│   ├── views/                  one component per page, composed from its sections
│   ├── sections/<page>/        one file per section (Hero, Features, Pricing, FAQ…)
│   ├── components/             MobileMenu, ScrollReveal, SiteInteractions
│   └── styles/                 shared.css (fonts), one CSS file per page, reveal.css (animations)
└── public/assets/img/          images and fonts
```

To add a page, create `frontend/app/<name>/page.tsx`.

## Run it

```bash
pnpm install
pnpm dev        # http://localhost:3000
```

Set `SITE_URL` (for example `https://crevo.ai`) in production so canonical
links and social cards use your domain.

Links to pages that haven't been built yet (for example `/auth/signup`) show
the 404 page until they are added.
