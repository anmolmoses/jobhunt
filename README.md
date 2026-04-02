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

### Job Map — Dark Theme Geographic View
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

### Resume Management
- **Upload & AI Analysis** — upload PDF/DOCX, get scored on formatting, content, keywords, ATS compatibility
- **Resume Builder** — rich text editor with sections for experience, education, skills, projects, certifications
- **AI Resume Tailoring** — pick a job listing, AI rewrites your resume to match that specific role
- **PDF Export** — generate ATS-friendly PDFs on demand
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

### Networking
- **Happenstance integration** — find 2nd-degree contacts at target companies
- **Outreach tracking** — track who you contacted, via which channel, response status
- **Hunter.io** — find contact emails at any company

### Map View
- **Dark-themed job map** — see all openings geographically with company logos as markers
- **Sidebar with company list** — search, click to zoom, save jobs from map
- **Spiral spread** — overlapping markers fan out so every job is visible

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

**LinkedIn, Indeed, Remotive, RemoteOK, Jobicy, HackerNews** — no API keys needed.

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

## Architecture

```
src/
├── app/                  # Next.js pages + API routes
│   ├── dashboard/        # AI autopilot, stats
│   ├── resume/           # Upload, analyze
│   ├── builder/          # Resume builder + tailor
│   ├── preferences/      # Job preferences
│   ├── jobs/             # Job search + filters
│   ├── tracker/          # Kanban board + interviews
│   ├── map/              # Geographic job map
│   ├── saved/            # Saved jobs
│   ├── networking/       # Outreach tracking
│   └── settings/         # API keys + data management
├── lib/
│   ├── ai/               # AI providers + prompts
│   ├── jobs/             # 8 job providers + orchestrator + ATS scoring
│   ├── resume/           # Parser, analyzer, PDF generator
│   ├── company/          # Enrichment, logos, Hunter.io
│   ├── happenstance/     # Network search client
│   └── geo/              # Geocoding
├── components/           # UI components
├── db/                   # Schema + connection
└── types/                # TypeScript definitions
```

## Job Providers

| Provider | Source | API Key? | Coverage |
|----------|--------|----------|----------|
| LinkedIn | linkedin-jobs-api (scraper) | No | Global |
| Indeed | ts-jobspy (scraper) | No | Global |
| JSearch | RapidAPI (Google Jobs) | Yes | Global |
| Adzuna | Official API | Yes | 16+ countries |
| Remotive | Official API | No | Remote jobs |
| RemoteOK | Official API | No | Remote jobs |
| Jobicy | Official API | No | Remote jobs |
| HackerNews | Algolia API | No | Tech jobs |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Security

See [SECURITY.md](SECURITY.md) for security policy and recommendations.

## License

[MIT](LICENSE)

## Acknowledgments

Built with Claude Code by Anthropic.
