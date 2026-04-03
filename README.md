# JobHunt

AI-powered, self-hosted job hunting application. Upload your resume, let AI find and rank jobs across 8 providers, track applications with a Kanban board, discover networking contacts, and build tailored resumes — all from one place.

## Screenshots

### Dashboard — AI Autopilot
One click to analyze resume, extract preferences, and search across all providers.
![Dashboard](docs/screenshots/dashboard.png)

### Job Search — 8 Providers, Smart Filtering
All jobs from every search in one place. Filter by company, provider, remote, saved status.
![Job Search](docs/screenshots/jobs.png)

### Application Tracker — Kanban Board
Track applications through Saved → Applied → Interviewing → Offered → Rejected.
![Tracker](docs/screenshots/tracker.png)

### Resume — AI Analysis & Scoring
Upload PDF/DOCX, get scored across formatting, content, keywords, and ATS compatibility.
![Resume](docs/screenshots/resume.png)

### Resume Builder — Rich Text Editor + AI Tailoring
Build resumes with a rich text editor. Tailor for specific jobs with AI. Export to PDF.
![Builder](docs/screenshots/builder.png)

### Job Map — Geographic View
See all openings on a map with company logos. Click to save, apply, or explore.
![Map](docs/screenshots/map.png)

### Preferences — AI Auto-Fill + Questionnaire
Multi-select experience level, work arrangement, company size. AI extracts from resume.
![Preferences](docs/screenshots/preferences.png)

### Settings — API Keys + Data Management
Configure AI providers, job search APIs, networking tools. Delete data granularly.
![Settings](docs/screenshots/settings.png)

## Features

### AI-First Job Search
- **One-click "Find Jobs For Me"** — AI reads your resume, extracts preferences, generates optimized search queries, and searches across all providers
- **8 job providers**: LinkedIn, Indeed, JSearch (Google Jobs), Adzuna, Remotive, RemoteOK, Jobicy, HackerNews Who's Hiring
- **Smart filtering** — excludes irrelevant jobs based on your experience level (no intern roles for senior engineers)
- **ATS keyword scoring** — each job shows how well your resume matches the job description
- **Date filtering enforced** — all providers honor your date range, with a safety-net filter in the orchestrator
- **Search configuration** — fine-grained control over providers, queries, date range, results per page in Settings

### Resume Management
- **Upload & AI Analysis** — upload PDF/DOCX, get scored on formatting, content, keywords, ATS compatibility
- **Structured parsing** — uploaded resumes are immediately AI-parsed into structured JSON (contact, experience, skills, etc.) and stored for instant reuse
- **Resume Builder** — rich text editor with sections for experience, education, skills, projects, certifications
- **Import from upload** — create a new build pre-populated from any uploaded resume (instant, no re-parsing)
- **Live preview** — side-by-side preview panel shows the exact PDF layout as you edit
- **AI Resume Tailoring** — pick a job listing and a base resume, AI rewrites to match that specific role
- **Professional PDF Export** — ATS-optimized one-page layout with Calibri font, proper alignment, clean formatting
- **Multiple resumes** — maintain different versions for different roles

### Application Tracking
- **Kanban board** — Saved → Applied → Interviewing → Offered → Rejected
- **Interview tracker** — schedule interviews, track outcomes, join meeting links
- **Activity timeline** — visual history of every action
- **Follow-up reminders** — auto-set 7-day follow-ups after applying
- **Response rate analytics**

### Company Intelligence
- **Salary data** — real market salaries from JSearch/Glassdoor with proper currency (₹, $, £, €)
- **Company profiles** — AI-analyzed size, type, industry, culture insights
- **Logo enrichment** — via logo.dev for companies missing logos
- **Firecrawl integration** — scrape company websites for real office addresses, about pages, and team data (optional, self-hosted)

### Networking
- **Happenstance integration** — find 2nd-degree contacts at target companies
- **Outreach tracking** — track who you contacted, via which channel, response status
- **Hunter.io** — find contact emails at any company

### Map View
- **Geographic job map** — see all openings with company logos as markers
- **Company-aware geocoding** — pins placed at actual office locations, not just city centers
- **Sidebar with company list** — search, click to zoom, save jobs from map

### Gamification
- **XP & Levels** — earn XP for searches, applications, outreach, and more
- **Daily goals** — configurable targets for applications, searches, and outreach
- **Streaks** — track consecutive days of job search activity
- **Achievements** — unlock badges for milestones across all categories
- **Activity heatmap** — GitHub-style contribution graph for your job search

### Automated Job Search
- **Scheduled searches** — cron-based automated job search on your preferred schedule
- **Configurable** — date range, results per page, schedule presets, or custom cron expressions
- **Run history** — track each automated run with status and job counts

### Preferences
- **AI auto-extraction** — preferences filled from your resume automatically
- **AI questionnaire** — thoughtful, resume-specific questions to refine your search
- **Multi-select** — experience level, work arrangement, company size all support multiple selections

## Quick Start

### Prerequisites
- Node.js 18+
- npm

### Setup

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/jobhunt.git
cd jobhunt

# Install dependencies
npm install

# Create environment file
cp .env.example .env.local

# Generate encryption secret (paste into .env.local)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Push database schema
npm run db:push

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Configuration

Add your API keys in `.env.local` or via the Settings page in the app:

| Key | Required | Free Tier | Purpose |
|-----|----------|-----------|---------|
| `ENCRYPTION_SECRET` | Yes | N/A | Encrypts API keys in database |
| `OPENAI_API_KEY` | One AI key needed | Pay-per-use | AI analysis, tailoring |
| `ANTHROPIC_API_KEY` | One AI key needed | Pay-per-use | AI analysis, tailoring |
| `JSEARCH_API_KEY` | No | 200 req/month | Google Jobs search + salary data |
| `ADZUNA_APP_ID` + `ADZUNA_APP_KEY` | No | 250 req/day | Job search |
| `HAPPENSTANCE_API_KEY` | No | Free tier | Network contact search |
| `LOGODEV_API_KEY` | No | 500K req/month | Company logos |
| `HUNTER_API_KEY` | No | 25 req/month | Email finder |
| `FIRECRAWL_API_URL` | No | Self-hosted | Web scraping for company data |
| `FIRECRAWL_API_KEY` | No | Self-hosted | Auth for Firecrawl instance |

**LinkedIn, Indeed, Remotive, RemoteOK, Jobicy, HackerNews** — no API keys needed.

### Optional: Firecrawl (Self-Hosted Web Scraping)

Firecrawl enhances company intelligence, job descriptions, and map accuracy by scraping company websites. It's fully optional and self-hosted via Docker:

```bash
docker run -p 3002:3002 mendableai/firecrawl
```

Then set `FIRECRAWL_API_URL=http://localhost:3002` in your `.env.local` or in the Settings page.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15+ (App Router, Turbopack) |
| UI | Tailwind CSS v4 + custom components |
| Database | SQLite via better-sqlite3 + Drizzle ORM |
| AI | Claude (Anthropic) + OpenAI (configurable) |
| Rich Text | Tiptap |
| Maps | Leaflet + OpenStreetMap |
| PDF | Puppeteer |
| Web Scraping | Firecrawl (optional, self-hosted) |

## Architecture

```
src/
├── app/                  # Next.js pages + API routes
│   ├── dashboard/        # AI autopilot, stats
│   ├── resume/           # Upload, analyze
│   ├── builder/          # Resume builder + tailor + preview
│   ├── preferences/      # Job preferences
│   ├── jobs/             # Job search + filters
│   ├── tracker/          # Kanban board + interviews
│   ├── map/              # Geographic job map
│   ├── saved/            # Saved jobs
│   ├── networking/       # Outreach tracking
│   ├── gamification/     # XP, streaks, achievements
│   └── settings/         # API keys + search config + data management
├── lib/
│   ├── ai/               # AI providers + prompts
│   ├── jobs/             # 8 job providers + orchestrator + ATS scoring
│   ├── resume/           # Parser, analyzer, structurer, PDF generator
│   ├── company/          # Enrichment, logos, Hunter.io
│   ├── firecrawl/        # Web scraping client
│   ├── gamification/     # XP, levels, streaks, achievements
│   ├── happenstance/     # Network search client
│   ├── cron/             # Scheduled job search
│   └── geo/              # Geocoding (company-aware)
├── components/           # UI components
├── db/                   # Schema + connection
└── types/                # TypeScript definitions
```

## Job Providers

| Provider | Source | API Key? | Date Filtering |
|----------|--------|----------|----------------|
| LinkedIn | linkedin-jobs-api (scraper) | No | Server-side |
| Indeed | ts-jobspy (scraper) | No | Server-side (hoursOld) |
| JSearch | RapidAPI (Google Jobs) | Yes | Server-side |
| Adzuna | Official API | Yes | Server-side (max_days_old) |
| Remotive | Official API | No | Client-side |
| RemoteOK | Official API | No | Client-side |
| Jobicy | Official API | No | Client-side |
| HackerNews | Algolia API | No | Thread recency check |

All providers are backed by an orchestrator-level safety-net date filter.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Security

- API keys are encrypted at rest with AES-256-GCM
- All data stored locally in SQLite — nothing sent to external servers except API calls you configure
- No telemetry, no analytics, no tracking

See [SECURITY.md](SECURITY.md) for security policy and recommendations.

## License

[MIT](LICENSE)

## Acknowledgments

Built with Claude Code by Anthropic.
