# JobHunt

AI-powered, self-hosted job hunting application.

## Tech Stack
- **Framework**: Next.js 15 (App Router, Turbopack)
- **UI**: Tailwind CSS v4 + custom shadcn/ui-style components
- **Database**: SQLite via better-sqlite3 + Drizzle ORM
- **AI**: Claude (Anthropic) + OpenAI (user-configurable)
- **Job APIs**: JSearch (RapidAPI), Adzuna, Remotive

## Commands
- `npm run dev` — Start dev server with Turbopack
- `npm run build` — Production build
- `npm run db:push` — Push schema changes to SQLite
- `npm run db:generate` — Generate Drizzle migrations
- `npm run lint` — Run ESLint

## Project Structure
- `src/app/` — Next.js App Router pages and API routes
- `src/db/` — Database connection (`index.ts`) and Drizzle schema (`schema.ts`)
- `src/lib/` — Core logic: `ai/`, `jobs/`, `resume/`, `company/`, `firecrawl/`, `gamification/`, `geo/`, `cron/`, `encryption.ts`, `settings.ts`
- `src/components/` — UI components: `ui/` (primitives), `layout/`, `resume/`, `preferences/`, `jobs/`, `dashboard/`, `settings/`, `gamification/`
- `src/types/` — TypeScript type definitions
- `data/` — SQLite database (gitignored)
- `uploads/` — Resume files (gitignored)

## Key Patterns
- API keys are encrypted at rest with AES-256-GCM (see `src/lib/encryption.ts`)
- AI providers use a factory pattern (`src/lib/ai/provider.ts`)
- Job search runs all configured providers in parallel via `Promise.allSettled`
- All job results are normalized to a common `NormalizedJob` interface
- Database tables use JSON text columns for arrays (parsed on read)

## Environment
- `ENCRYPTION_SECRET` — Required. 32-byte hex key for API key encryption at rest
- Optional: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `JSEARCH_API_KEY`, `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, `FIRECRAWL_API_URL`, `FIRECRAWL_API_KEY`
