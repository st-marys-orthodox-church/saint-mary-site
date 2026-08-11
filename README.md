# Fellowship Event Hall

Marketing site for **Fellowship Event Hall** — the event venue on the property of [St. Mary Romanian Orthodox Church](https://saintmaryro.org). Production URL: [events.saintmaryro.org](https://events.saintmaryro.org).

## Stack

| Layer        | Choice                                                             |
| ------------ | ------------------------------------------------------------------ |
| Framework    | Next.js 15 (Pages Router)                                          |
| Runtime      | React 19                                                           |
| Language     | TypeScript 5                                                       |
| Styling      | Tailwind CSS 3 + MUI 6 + Emotion                                   |
| i18n         | `next-i18next` (en, es, ro)                                        |
| Animation    | `react-animation-on-scroll` + `animate.css`                        |
| Gallery      | `react-photo-album` + `yet-another-react-lightbox`                 |
| SEO          | `next-seo` + `next-sitemap`                                        |
| Email        | SendGrid (contact form → `/api/sendgrid`)                          |
| Lint/Format  | [Biome](https://biomejs.dev) (replaces ESLint + Prettier)          |
| Git hooks    | [Lefthook](https://lefthook.dev) (replaces Husky + lint-staged)    |
| Package mgr  | pnpm                                                               |

## Requirements

- Node.js **>= 20** (use `nvm use` — see `.nvmrc`)
- [pnpm](https://pnpm.io) (the repo ships with `pnpm-lock.yaml`)

## Getting started

```bash
pnpm install
pnpm dev
```

The dev server runs at [http://localhost:3000](http://localhost:3000).

## Environment

Copy `.env.local` and set:

```
SENDGRID_API_KEY=<your-sendgrid-key>
ANTHROPIC_API_KEY=<optional — enables auto-translation in scripts/i18n-sync.mjs>
FACEBOOK_PAGE_ID=<meta-page-id>
FACEBOOK_PAGE_ACCESS_TOKEN=<page-access-token-with-pages_read_engagement>
FACEBOOK_SYNC_PAGE_SIZE=25
CRON_SECRET=<shared-secret-for-vercel-cron>
TURSO_DATABASE_URL=<libsql-or-https-url>
TURSO_AUTH_TOKEN=<turso-auth-token>
```

`SENDGRID_API_KEY` is used by `src/pages/api/sendgrid.ts` to deliver the contact form. `ANTHROPIC_API_KEY` is only needed locally when running `pnpm i18n:sync` to translate new strings.
The Facebook sync uses `FACEBOOK_PAGE_ID` + `FACEBOOK_PAGE_ACCESS_TOKEN`, stores posts in Turso when `TURSO_DATABASE_URL` is set, and falls back to a local SQLite file at `data/facebook-posts.db` during local development. `ANTHROPIC_API_KEY` is also reused by the Facebook sync to generate polished post titles when available; otherwise the sync falls back to a deterministic title derived from the post content.

## Scripts

| Command              | What it does                                                 |
| -------------------- | ------------------------------------------------------------ |
| `pnpm dev`           | Start the dev server (Turbopack)                             |
| `pnpm build`         | Production build (runs `next-sitemap` after)                 |
| `pnpm start`         | Start the production server                                  |
| `pnpm clean`         | Remove `.next` and `out`                                     |
| `pnpm build-stats`   | Build with the bundle analyzer enabled                       |
| `pnpm build-types`   | Type-check without emitting (`tsc --noEmit`)                 |
| `pnpm lint`          | Lint with Biome                                              |
| `pnpm lint:fix`      | Lint and auto-fix with Biome                                 |
| `pnpm format`        | Format with Biome                                            |
| `pnpm check`         | Lint + format + organize imports (one command)               |
| `pnpm i18n:sync`     | Sync `es`/`ro` locales against `en`; translates via Claude   |
| `pnpm i18n:check`    | CI mode — exit 1 if locales drift from `en`                  |

## Project layout

```
src/
├── pages/            # Next.js pages + API routes
│   ├── index.tsx     # Landing page
│   ├── packages.tsx  # Pricing / packages
│   ├── gallery.tsx   # Photo gallery
│   └── api/
│       └── sendgrid.ts
├── ui/
│   ├── base/         # Meta, Navbar, Footer, Logo, LanguageSwitcher, Template
│   ├── components/   # Small reusable primitives (HeroCarousel, buttons, …)
│   ├── features/     # Larger page sections (Hero, FilteredGallery, …)
│   ├── layout/       # Section/grid containers
│   └── modals/       # Contact modal
├── hooks/            # UseContactForm, UseDropdown, UseWindowDimensions
├── stores/           # Global context
├── styles/           # Tailwind entry + MUI theme
└── utils/            # AppConfig, Constants, DesignTokens, Features,
                      # HeroSlides, Navigation, Packages, Photos,
                      # StructuredData, i18nConfig

public/
└── locales/
    ├── en/           # Source of truth — edit these by hand
    ├── es/
    └── ro/

scripts/
└── i18n-sync.mjs     # Keeps es/ro aligned with en (optionally via Claude)
```

## Internationalization

- Configured in `next-i18next.config.js`; wired into Next via `next.config.js`.
- `en` is the default and the source of truth. Only edit `en/*.json` directly.
- After changing any `en` string, run `pnpm i18n:sync` to propagate. With `ANTHROPIC_API_KEY` set the script translates new strings; without it they land as `[ES] …` / `[RO] …` placeholders so gaps are visible in the browser.
- `pnpm i18n:check` runs in CI (no writes) and fails if locales are out of sync.
- The `<LanguageSwitcher>` in `src/ui/base/` handles locale switching.

## SEO

- Per-page metadata is set via `src/ui/base/Meta.tsx` (wraps `next-seo`).
- Global site metadata lives in `src/utils/AppConfig.ts`.
- `next-sitemap.config.js` generates `sitemap.xml` and `robots.txt` on `postbuild`.
- Structured data helpers live in `src/utils/StructuredData.ts`.

## Git hooks

Managed by **Lefthook** (`lefthook.yml`). Installed automatically via the `prepare` script on `pnpm install`.

- **pre-commit:** Biome check (auto-fix) on staged files.
- **pre-push:** Biome check + `tsc --noEmit` against `./src`.

## Deployment

Any Next.js-compatible host (Vercel, Netlify, self-hosted Node). Make sure `SENDGRID_API_KEY` is set in the deploy environment.

For the parish Facebook feed:

- Configure `FACEBOOK_PAGE_ID`, `FACEBOOK_PAGE_ACCESS_TOKEN`, `CRON_SECRET`, `TURSO_DATABASE_URL`, and `TURSO_AUTH_TOKEN` in production.
- The scheduled sync endpoint is `GET /api/cron/facebook-sync`.
- `vercel.json` runs that sync once per day.
- Homepage and `/stiri-evenimente` render from the cached local/Turso post store rather than fetching Facebook on every request.

## AI-assisted development

This repo is set up for AI pair-programming. See [CLAUDE.md](./CLAUDE.md) for conventions and [.claude/agents/](./.claude/agents/) for reusable agent definitions.
