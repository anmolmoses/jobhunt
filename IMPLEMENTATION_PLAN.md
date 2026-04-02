# JobHunt — Implementation Plan

## Context

Building an open-source, self-hosted job hunting application from scratch. The tool helps a developer upload their resume, get AI-powered analysis and scoring, set job search preferences, and search across multiple job APIs with customizable filters (date posted, remote, salary, etc.). The goal is to solve the user's own job search workflow first, with potential to open-source later.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router, full-stack) |
| UI | shadcn/ui + Tailwind CSS |
| Database | SQLite via better-sqlite3 + Drizzle ORM |
| AI | Configurable — Claude API + OpenAI API (user picks in settings) |
| Resume Parsing | pdf-parse (PDF), mammoth (DOCX) |
| Job APIs | JSearch (Google Jobs), Adzuna, Remotive (all three) |
| Validation | Zod |

---

## Project Structure

```
jobhunt/
├── .env.local / .env.example
├── next.config.ts, tailwind.config.ts, drizzle.config.ts
├── data/                          # SQLite DB at runtime
├── uploads/                       # Resume files (gitignored)
├── drizzle/                       # SQL migrations
├── src/
│   ├── app/
│   │   ├── layout.tsx             # Root layout + sidebar
│   │   ├── page.tsx               # Redirect to /dashboard
│   │   ├── dashboard/page.tsx     # Overview: score, stats, recent searches
│   │   ├── resume/page.tsx        # Upload + AI analysis
│   │   ├── preferences/page.tsx   # Job preference questionnaire
│   │   ├── jobs/page.tsx          # Search + results + filters
│   │   ├── saved/page.tsx         # Bookmarked jobs + status tracking
│   │   ├── settings/page.tsx      # API key configuration
│   │   └── api/
│   │       ├── resume/{upload,analyze,[id]}/route.ts
│   │       ├── preferences/{route.ts, questions/route.ts}
│   │       ├── jobs/{search,save}/route.ts
│   │       └── settings/route.ts
│   ├── db/
│   │   ├── index.ts               # DB connection singleton (WAL mode)
│   │   └── schema.ts              # All Drizzle table definitions
│   ├── lib/
│   │   ├── ai/
│   │   │   ├── provider.ts        # AIProvider interface + factory
│   │   │   ├── claude.ts          # Claude implementation
│   │   │   ├── openai.ts          # OpenAI implementation
│   │   │   └── prompts.ts         # Analysis + questionnaire prompts
│   │   ├── jobs/
│   │   │   ├── provider.ts        # JobSearchProvider interface + types
│   │   │   ├── jsearch.ts         # JSearch (RapidAPI)
│   │   │   ├── adzuna.ts          # Adzuna API
│   │   │   ├── remotive.ts        # Remotive API (free, no auth)
│   │   │   └── orchestrator.ts    # Parallel search + dedup + ranking
│   │   ├── resume/
│   │   │   ├── parser.ts          # PDF/DOCX text extraction
│   │   │   └── analyzer.ts        # Orchestrates AI analysis
│   │   └── encryption.ts          # AES-256-GCM for API keys at rest
│   ├── components/
│   │   ├── ui/                    # shadcn/ui primitives
│   │   ├── layout/{sidebar,header}.tsx
│   │   ├── resume/{upload-dropzone,analysis-card,resume-preview}.tsx
│   │   ├── preferences/{questionnaire,preference-summary}.tsx
│   │   ├── jobs/{search-bar,filter-panel,job-card,job-list,job-detail-modal}.tsx
│   │   ├── settings/api-key-form.tsx
│   │   └── dashboard/{score-widget,recent-searches,saved-jobs-preview}.tsx
│   └── types/{ai,jobs,resume,preferences}.ts
```

---

## Database Schema (7 tables)

### settings
Stores API keys (encrypted at rest) and configuration.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | Auto-increment |
| key | TEXT UNIQUE | e.g., "ai_provider", "openai_api_key" |
| value | TEXT | Encrypted for sensitive values |
| is_encrypted | BOOLEAN | Default false |
| updated_at | TEXT | Auto-set |

### resumes
Uploaded resume files and their parsed text.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | Auto-increment |
| file_name | TEXT | Original filename |
| file_path | TEXT | Path in uploads/ |
| file_type | TEXT | "pdf" or "docx" |
| file_size | INTEGER | Bytes |
| parsed_text | TEXT | Extracted plain text |
| created_at | TEXT | Auto-set |
| updated_at | TEXT | Auto-set |

### resume_analyses
AI analysis results with scoring.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | Auto-increment |
| resume_id | INTEGER FK | References resumes.id (CASCADE) |
| ai_provider | TEXT | "claude" or "openai" |
| overall_score | INTEGER | 0-100 |
| formatting_score | INTEGER | 0-100 |
| content_score | INTEGER | 0-100 |
| keyword_score | INTEGER | 0-100 |
| ats_score | INTEGER | 0-100 (ATS compatibility) |
| summary | TEXT | AI summary paragraph |
| strengths | TEXT (JSON) | Array of strings |
| improvements | TEXT (JSON) | Array of strings |
| to_remove | TEXT (JSON) | Array of strings |
| to_add | TEXT (JSON) | Array of strings |
| detailed_feedback | TEXT | Full AI markdown response |
| raw_response | TEXT | Raw API response for debugging |
| created_at | TEXT | Auto-set |

### job_preferences
User's job search preferences.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | Auto-increment |
| desired_roles | TEXT (JSON) | ["Frontend Developer", "React Engineer"] |
| desired_industries | TEXT (JSON) | ["Tech", "Finance"] |
| experience_level | TEXT | "entry", "mid", "senior", "lead", "executive" |
| location_preference | TEXT | "remote", "hybrid", "onsite" |
| preferred_locations | TEXT (JSON) | ["San Francisco", "New York"] |
| salary_min | INTEGER | Annual, USD |
| salary_max | INTEGER | Annual, USD |
| employment_type | TEXT (JSON) | ["full_time", "contract", "part_time"] |
| desired_skills | TEXT (JSON) | ["React", "TypeScript"] |
| exclude_keywords | TEXT (JSON) | Keywords to avoid in results |
| company_size_preference | TEXT | "startup", "mid", "enterprise", "any" |
| additional_notes | TEXT | Free text |
| created_at / updated_at | TEXT | Auto-set |

### job_searches
Search history.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | Auto-increment |
| query | TEXT | The search query used |
| filters | TEXT (JSON) | { datePosted, remote, salaryMin, ... } |
| providers | TEXT (JSON) | ["jsearch", "adzuna", "remotive"] |
| total_results | INTEGER | Default 0 |
| created_at | TEXT | Auto-set |

### job_results
Cached job results from APIs.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | Auto-increment |
| search_id | INTEGER FK | References job_searches.id (CASCADE) |
| external_id | TEXT | Provider's job ID |
| provider | TEXT | "jsearch", "adzuna", "remotive" |
| title | TEXT | Job title |
| company | TEXT | Company name |
| location | TEXT | Location string |
| salary | TEXT | Normalized display string |
| salary_min / salary_max | REAL | Parsed numeric (annual) |
| description | TEXT | HTML or plain text |
| job_type | TEXT | "full_time", "contract", "part_time" |
| is_remote | BOOLEAN | Default false |
| apply_url | TEXT | External application link |
| company_logo | TEXT | Logo URL |
| posted_at | TEXT | ISO date from provider |
| tags | TEXT (JSON) | Skill tags |
| relevance_score | REAL | Computed 0-1 |
| dedupe_key | TEXT | For deduplication across providers |
| created_at | TEXT | Auto-set |

### saved_jobs
Bookmarked jobs with application tracking.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | Auto-increment |
| job_result_id | INTEGER FK | References job_results.id (CASCADE) |
| notes | TEXT | User's personal notes |
| status | TEXT | "saved", "applied", "interviewing", "rejected", "offered" |
| applied_at | TEXT | When the user applied |
| created_at / updated_at | TEXT | Auto-set |

---

## Core Abstractions

### AI Provider Interface

```typescript
interface AIProvider {
  readonly name: "claude" | "openai";
  complete(options: {
    messages: AIMessage[];
    maxTokens?: number;
    temperature?: number;
    responseFormat?: "text" | "json";
  }): Promise<string>;
  isConfigured(): Promise<boolean>;
}
```

- **Claude** uses `@anthropic-ai/sdk` with `claude-sonnet-4-20250514` — system message passed as top-level param
- **OpenAI** uses `openai` package with `gpt-4o` — system message inline in messages array
- Factory function reads configured provider from `settings` table

### Job Search Provider Interface

```typescript
interface JobSearchProvider {
  readonly name: "jsearch" | "adzuna" | "remotive";
  search(params: JobSearchParams): Promise<NormalizedJob[]>;
  isConfigured(): boolean;
}

interface JobSearchParams {
  query: string;
  location?: string;
  remote?: boolean;
  datePosted?: "1d" | "3d" | "7d" | "14d" | "30d";
  salaryMin?: number;
  employmentType?: ("full_time" | "contract" | "part_time")[];
  page?: number;
  resultsPerPage?: number;
}
```

All providers normalize results to a common `NormalizedJob` shape.

**Date filter mapping per provider:**
- **JSearch**: `"1d" -> "today"`, `"3d" -> "3days"`, `"7d" -> "week"`, `"30d" -> "month"`
- **Adzuna**: Direct numeric `max_days_old` (1, 3, 7, 14, 30) — cleanest API
- **Remotive**: No server-side filter — client-side filtering on `publication_date`

### Job Search Orchestrator

- Runs all enabled providers in parallel via `Promise.allSettled` (one failure doesn't block others)
- Deduplicates by `normalize(title) + normalize(company)` — prefers result with more data
- Ranks by: title keyword match (0.4), description match (0.2), recency (0.2), salary fit (0.1), remote fit (0.1)
- Persists search + results to DB

---

## AI Prompts

### Resume Analysis Prompt

Evaluates 4 dimensions (each scored 0-100):

1. **Formatting & Structure** — section organization, bullet points, length, readability
2. **Content Quality** — quantified achievements, action verbs, specificity
3. **Keyword Optimization** — industry keywords, skills coverage
4. **ATS Compatibility** — standard headings, parseable format, no tables/graphics

Returns structured JSON: `{ overallScore, formattingScore, contentScore, keywordScore, atsScore, summary, strengths[], improvements[], toRemove[], toAdd[], detailedFeedback }`

### Preference Questionnaire Prompt

AI reads parsed resume and generates contextual questions tailored to the user's background. E.g., if resume shows React experience: "Are you specifically targeting React roles?" Returns typed question objects (text, select, multiselect, range) that render as a dynamic form.

---

## API Routes

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/resume/upload` | Upload and parse resume file |
| GET | `/api/resume/[id]` | Get resume by ID with parsed text |
| DELETE | `/api/resume/[id]` | Delete resume and file |
| POST | `/api/resume/analyze` | Trigger AI analysis |
| GET | `/api/preferences` | Get current preferences |
| PUT | `/api/preferences` | Update preferences |
| POST | `/api/preferences/questions` | AI generates contextual questions |
| POST | `/api/jobs/search` | Search across all providers |
| POST | `/api/jobs/save` | Bookmark a job |
| DELETE | `/api/jobs/save` | Remove bookmark |
| GET | `/api/jobs/saved` | Get all saved jobs |
| PATCH | `/api/jobs/save/[id]` | Update status/notes |
| GET | `/api/settings` | Get settings (keys masked) |
| PUT | `/api/settings` | Update settings (encrypts sensitive) |

---

## UI Pages

### Dashboard (`/dashboard`)
- Resume score circular widget (color-coded: red <40, yellow 40-70, green >70)
- Quick stats: Jobs Found, Jobs Saved, Searches This Week
- Recent searches (last 5, click to re-run)
- Saved jobs preview (top 5 with status badges)
- Getting-started checklist for new users

### Resume (`/resume`)
- Drag-and-drop upload zone (PDF/DOCX, max 10MB)
- Parsed text preview (expandable)
- Analysis panel: 4 sub-scores as progress bars, overall score
- Strengths (green), Improvements (yellow), To Remove (red), To Add (blue) lists
- Detailed feedback rendered as markdown

### Preferences (`/preferences`)
- **AI-Guided Mode**: Click "Let AI Help Me" — dynamic questionnaire based on resume
- **Manual Mode**: Standard form with all preference fields
- Multi-tag inputs for roles, skills, locations, exclude keywords
- Dual slider for salary range

### Job Search (`/jobs`)
- Search bar pre-filled from preferences
- Filter panel: Date Posted (1d/3d/7d/14d/30d), Remote toggle, Salary min, Employment type, Provider selection
- Job cards: title, company, location, salary, posted date, provider badge, remote badge, bookmark toggle
- Sorting: Most Relevant, Most Recent, Highest Salary
- Job detail modal with full description, apply button, notes

### Saved Jobs (`/saved`)
- Table/card view with status dropdown (Saved → Applied → Interviewing → Rejected/Offered)
- Inline editable notes
- Filter by status and date

### Settings (`/settings`)
- AI Provider: radio (Claude/OpenAI) + API key input + "Test Connection"
- Job Providers: JSearch (RapidAPI key), Adzuna (App ID + Key), Remotive (always enabled)
- Rate limit info display
- Default country for Adzuna

---

## Security

- API keys encrypted at rest with AES-256-GCM (`crypto` module)
- `ENCRYPTION_SECRET` env var — auto-generated on first run if missing
- Job descriptions sanitized before rendering (DOMPurify or text-only)
- No authentication (single-user, self-hosted)
- `uploads/` and `data/` directories gitignored

---

## Environment Variables

```env
# Required: Secret for encrypting API keys stored in the database
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_SECRET=

# Optional: Pre-configure API keys via env vars instead of the UI
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
JSEARCH_API_KEY=
ADZUNA_APP_ID=
ADZUNA_APP_KEY=
```

---

## Implementation Phases

### Phase 1: Foundation
Scaffold Next.js + Tailwind + shadcn/ui. Set up database schema with Drizzle ORM + migrations. Build sidebar layout and page shells. Build Settings page with API key encryption.

**Key files**: `schema.ts`, `db/index.ts`, `encryption.ts`, `layout.tsx`, settings page + API route

### Phase 2: Resume Upload & Parsing
File upload API (PDF/DOCX validation, UUID naming, 10MB limit). Text extraction with pdf-parse and mammoth. Resume page with drag-and-drop upload zone and parsed text preview.

**Key files**: `parser.ts`, `upload/route.ts`, resume page + components

### Phase 3: AI Integration & Resume Analysis
AI provider abstraction layer (Claude + OpenAI). Resume analysis prompts and scoring. Analysis display with scores, suggestions, and detailed feedback. "Test Connection" in Settings.

**Key files**: `provider.ts`, `claude.ts`, `openai.ts`, `prompts.ts`, `analyzer.ts`, `analyze/route.ts`

### Phase 4: Job Preferences
AI-generated contextual preference questions. Manual preference form. Preferences storage and validation.

**Key files**: preference routes, questionnaire component, preference form

### Phase 5: Job Search
JSearch, Adzuna, Remotive provider implementations. Orchestrator with parallel search, deduplication, and relevance ranking. Search page with filters, results, and detail modal.

**Key files**: `jsearch.ts`, `adzuna.ts`, `remotive.ts`, `orchestrator.ts`, search route, job components

### Phase 6: Save Jobs & Dashboard
Bookmark/save jobs with status tracking (saved → applied → interviewing → rejected/offered). Dashboard with all widgets populated from real data.

**Key files**: save routes, saved page, dashboard page + widgets

### Phase 7: Polish
Error boundaries, loading states, empty states with CTAs. Toast notifications. Mobile responsive pass. Input sanitization. README with setup instructions.

---

## Job API Research Summary

| API | Type | Free Tier | Date Filter | Legal |
|---|---|---|---|---|
| **JSearch** | Google Jobs aggregation | 200 req/month | Yes (today/3days/week/month) | Gray area (scrapes Google) |
| **Adzuna** | Official job aggregator | 250 req/day | Yes (max_days_old numeric) | Fully legal |
| **Remotive** | Remote job board | Unlimited, no auth | Client-side only | Fully legal |

**Why these three**: JSearch gives the broadest coverage (Google aggregates from LinkedIn, Indeed, Glassdoor, etc.). Adzuna adds coverage Google might miss, with a clean legal API. Remotive is free and excellent for remote-specific roles. Together they provide comprehensive coverage at $0/month on free tiers.

**Avoided**: FireCrawl (unreliable on job boards due to anti-bot), Brave Search (no structured job data), unofficial LinkedIn scrapers (unreliable + TOS violations), Indeed/LinkedIn official APIs (not available to individual developers).
