# JobHunt Lab

Standalone developer sandbox on port **3100** for testing individual job providers
against custom queries — separate from the main app on :3000.

The lab imports directly from the main app's `src/` via the `@app/*` TypeScript
path, so you see production provider behavior without touching the orchestrator.

## Install & run

From the repo root:

```bash
npm run lab:install   # installs lab/ dependencies
npm run lab           # starts `next dev --turbopack -p 3100`
```

Or from this directory:

```bash
cd lab
npm install
npm run dev
```

Open http://localhost:3100.

## Database

The lab shares the main app's SQLite database and settings. A symlink
`lab/data -> ../data` makes `process.cwd()/data/jobhunt.db` (the path used by
`src/db/index.ts`) resolve to the same file the main app uses. Do **not**
delete that symlink.

## Discovery mechanism

`lab/src/lib/registry.ts` exports two lists:

- **`currentProviders`** — statically imports the 10 production `JobSearchProvider`
  classes from `@app/lib/jobs/*` (jsearch, adzuna, remotive, linkedin, indeed,
  remoteok, jobicy, hackernews, firecrawl-search, greenhouse).
- **`loadExperimentalProviders()`** — async fn that tries to dynamically import
  each slug in `EXPERIMENTAL_SLUGS` from `@app/lib/jobs/experimental/<slug>.ts`.
  Each import is wrapped in its own try/catch, so missing files are silently
  skipped. The `/api/providers` endpoint returns the pending slugs as
  `experimentalPending` so the UI can hint at what isn't loaded yet.

Supported experimental slugs today:

```
claude-code, linkedin-public, wellfound, ycombinator,
lever, ashby, workday, otta
```

## Adding a new experimental provider

1. Create `src/lib/jobs/experimental/<slug>.ts` in the **main app** source tree.
2. Implement the `JobSearchProvider` interface (`src/types/jobs.ts`) and export
   the class. The registry accepts any of these export shapes:
   - `export default class …`
   - `export class FooProvider …` (any export ending in `Provider`)
   - `export const Provider = new FooProvider()` (instance also works)
3. If the slug isn't one of the eight pre-wired experimental slugs, add it to
   `EXPERIMENTAL_SLUGS` in `lab/src/lib/registry.ts`.
4. Reload :3100 — the provider will appear in the **Experimental** tab with a
   green/gray dot based on `isConfigured()`.

## Endpoints

- `GET /api/providers` — `{ current, experimental, experimentalPending }`.
  Each provider includes `{ name, configured, configError? }`.
- `POST /api/run` — body `{ tier: "current"|"experimental", provider, params }`.
  Returns `{ ok, ms, count, normalized, error? }`.

## UI

- Shared query form at the top (query/location/remote/datePosted/salaryMin/resultsPerPage).
- **Current** / **Experimental** tabs list providers with a configured indicator.
- Per-provider **Run** button or **Run All** for the active tab.
- Each card shows status, elapsed ms, count, collapsible normalized-JSON dump,
  and a collapsible error stack on failure.

## Scope

- Does not modify anything under `src/`.
- Does not add DB migrations.
- Does not touch the production orchestrator.
