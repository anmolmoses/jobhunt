# JobHunt — Comprehensive Research Report

*10 research agents deployed. 850KB+ of raw data analyzed. March 2026.*

---

## 1. OPEN SOURCE JOB SCRAPERS

### The #1 Tool We Should Add: JobSpy

| Tool | Sites Scraped | Language | Stars | API Key? |
|---|---|---|---|---|
| **[JobSpy (python-jobspy)](https://github.com/Bunsly/JobSpy)** | LinkedIn, Indeed, Glassdoor, Google Jobs, ZipRecruiter | Python | 10K+ | **No** |
| [linkedin-jobs-api](https://github.com/VishwaGauravIn/linkedin-jobs-api) | LinkedIn | Node.js | 1K+ | No |
| [linkedin-api (tomquirk)](https://github.com/tomquirk/linkedin-api) | LinkedIn (deep: profiles + jobs) | Python | 3K+ | No (uses cookies) |
| [Crawlee](https://github.com/apify/crawlee) | Any site (framework) | Node.js | 14K+ | No |
| [Botasaurus](https://github.com/omkarcloud/botasaurus) | Any site (anti-detection) | Python | 4K+ | No |
| [google-jobs-scraper](https://github.com/omkarcloud/google-jobs-scraper) | Google Jobs | Python | — | No |
| Apify Actors | LinkedIn, Indeed, Glassdoor, Google Jobs | Node.js | — | Free tier |

**Recommendation**: **Integrate JobSpy** via a Python subprocess or API wrapper. It covers 5 major job boards in one library with no API keys needed. This alone would 10x our job coverage.

### Free APIs (no scraping needed)

| API | Coverage | Free Tier | URL |
|---|---|---|---|
| Adzuna | Global aggregator | 250 req/day | developer.adzuna.com |
| JSearch | Google Jobs | 200 req/month | rapidapi.com |
| Remotive | Remote jobs | Unlimited | remotive.com/api |
| RemoteOK | Remote jobs | Unlimited | remoteok.com/api |
| Jobicy | Remote jobs | Unlimited | jobicy.com/api |
| The Muse | US company profiles + jobs | Free | themuse.com/developers |
| Jooble | International aggregator | Free | jooble.org/api |
| Reed | UK jobs | Free | reed.co.uk/developers |
| Arbeitnow | EU jobs | Free | arbeitnow.com/api |
| Findwork | Developer jobs | Free tier | findwork.dev/developers |

---

## 2. PAID JOB APIs

| API | What It Does | Pricing | Best For |
|---|---|---|---|
| **SerpAPI** (Google Jobs) | Scrapes Google Jobs SERP | $50/mo (5K searches) | Most reliable Google Jobs data |
| **ScrapingBee** | Indeed + Google Jobs scraper | $49/mo | Managed scraping |
| **Proxycurl** | LinkedIn profile + company data | $0.01/profile | Deep LinkedIn intel |
| **Bright Data** | Job datasets (Indeed, LinkedIn, Glassdoor) | Custom pricing | Bulk data |
| **ZipRecruiter API** | Job search + posting | Partner access | US market |
| **People Data Labs** | Employee data enrichment | $0.01/record | Finding who works where |

---

## 3. JOB SCRAPING TECHNIQUES

### What Works in 2026

| Approach | Risk | Effort | Value |
|---|---|---|---|
| **Keep existing APIs** (JSearch, Adzuna, Remotive, LinkedIn npm) | Low | Done | High |
| **Add Indeed RSS feeds** | Low | Low | Medium |
| **LinkedIn guest jobs endpoint** (no login required) | Medium | Medium | High |
| **Email alert parsing** (LinkedIn/Indeed/Naukri alerts → parse job links) | None | Medium | **Very High** |
| **Naukri.com scraping** (for India) | Low | Medium | High for India |
| **HackerNews "Who's Hiring" scraper** | None | Low | High for tech |
| **Google Jobs via SerpAPI** | None | Low (paid) | High |

### Legal Status
- **hiQ v. LinkedIn (2022)**: Scraping publicly available data is generally legal in the US
- LinkedIn/Indeed ToS prohibit scraping, but enforcement is rare for personal use
- **Safest approach**: Use official APIs where available, scrape only public pages, respect rate limits

---

## 4. ATS & APPLICATION AUTOMATION

### Auto-Apply Tools (for future reference)

| Tool | What It Does | Open Source? | Risk |
|---|---|---|---|
| [AIHawk](https://github.com/feder-cr/Jobs_Applier_AI_Agent_AIHawk) | AI agent that applies to LinkedIn jobs | Yes (GitHub) | Account suspension |
| [LinkedIn-Easy-Apply-Bot](https://github.com/NathanDuma/LinkedIn-Easy-Apply-Bot) | Automates LinkedIn Easy Apply | Yes | Account suspension |
| [ApplyPilot](https://github.com/Pickle-Pixel/ApplyPilot) | AI job application assistant | Yes | Medium |
| LazyApply | Auto-applies across sites | Paid ($99/mo) | Medium |
| Sonara.ai | AI job matching + auto-apply | Paid | Low (uses official channels) |
| LoopCV | Upload CV → auto-applies | Paid ($29/mo) | Low |

**Key insight**: "Assist, don't automate" — help fill forms faster but let users review and submit. 25-40% failure rates on full auto-apply.

### ATS Optimization (build into our app)
- **Keyword match scoring**: Compare resume keywords to job description (TF-IDF or LLM)
- **Format rules**: Single column, standard headings, DOCX for best ATS compatibility
- None of these tools (Jobscan, Teal, Huntr) offer public APIs — we need to build our own

---

## 5. AI JOB MATCHING (improve our scoring)

### Recommended Hybrid Approach

| Component | Method | Tool |
|---|---|---|
| Skills extraction | LLM-based (Claude/GPT) | Already have this |
| Skills normalization | O*NET taxonomy matching | Free database |
| Semantic matching | Embedding similarity | `text-embedding-3-small` or `all-MiniLM-L6-v2` |
| Score explanation | LLM generates "why this matches" | Already have this |

**Key insight**: Move from keyword matching (current) to **embedding-based semantic matching**. A job asking for "distributed systems" should match a resume with "microservices architecture" even though the keywords don't overlap.

### Salary Data Sources

| Source | Coverage | API? | Cost |
|---|---|---|---|
| JSearch estimated-salary | Global | Yes (RapidAPI) | Already integrated |
| Levels.fyi | US tech | No official API | — |
| AmbitionBox | India | No API | — |
| BLS (Bureau of Labor Statistics) | US government data | Yes (free) | Free |
| H-1B LCA data | US visa salaries | Public dataset | Free |

---

## 6. NETWORKING & REFERRAL TOOLS

| Tool | Purpose | API? | Cost | Best For |
|---|---|---|---|---|
| **Happenstance** | Search your network | Yes (REST + MCP) | Free / $24/mo | Already integrated |
| **Hunter.io** | Find email addresses | Yes | Free (25/mo) | Cold outreach |
| **Apollo.io** | Contact enrichment | Yes | Free (10K credits) | Bulk lookup |
| **People Data Labs** | Employee directory | Yes (6 SDKs) | $0.01/record | Find who works where |
| **Refer.me** | Request referrals | No | $19/mo | FAANG referrals |
| **Blind** | Tech referrals forum | No | Free | Anonymous referrals |
| **Proxycurl** | LinkedIn data | Yes | $0.01/profile | Deep profile intel |

**Recommended additions**: Hunter.io (free tier) for finding contact emails, Apollo.io for enrichment.

---

## 7. INDIA-SPECIFIC PLATFORMS

### The Indian job board ecosystem is API-hostile

| Platform | Has API? | Scrapable? | Relevance (Sr Backend, BLR) |
|---|---|---|---|
| **Naukri.com** | No (employer only) | Hard | **Very High** |
| **Cutshort** | No | Hard | **Very High** |
| **Instahyre** | No | Hard | **Very High** |
| **Hirist** | No | Moderate | High |
| **BigShyft** | No | Moderate | High |
| **HasJob** (HasGeek) | Possibly | Easy | Medium (declining) |
| **Wellfound** (AngelList) | Deprecated | Moderate | High |
| **AmbitionBox** (salary) | No | Moderate | **Very High** for salary |

### What works for India
1. **Global APIs filtered to India**: LinkedIn, JSearch, Adzuna all support India
2. **Parse Naukri email alerts**: Set up job alerts → parse the emails for job links
3. **Monitor Twitter/X**: Bangalore founders post jobs regularly
4. **Google Custom Search** against Indian job board domains
5. **For remote international**: Turing, Toptal, Arc.dev

### India salary data
- **AmbitionBox** is the gold standard but no API
- Build a reference dataset manually or use JSearch estimated-salary (already integrated)

---

## 8. INTERVIEW PREP TOOLS

| Tool | What | API? | Cost |
|---|---|---|---|
| **Hume.ai** | Emotional tone analysis for interview recordings | Yes (REST + WebSocket) | Free tier |
| **HackerRank** | Code execution + testing | Yes (REST) | Free |
| **Exercism** | Practice problems | Yes (REST) | Free |
| **LeetCode** | Problems by company | GraphQL (unofficial) | Fragile |
| **OpenAI Whisper** | Speech-to-text for mock interviews | Yes | Cheap |
| **ElevenLabs** | Text-to-speech for voice interviews | Yes | Free tier |

**Build opportunity**: AI mock interviewer using Claude API + Whisper (STT) + ElevenLabs (TTS). Generate company-specific questions from job descriptions.

---

## 9. RESUME OPTIMIZATION

| Component | Recommended | Rationale |
|---|---|---|
| Resume data model | **JSON Resume** schema | Open standard, ecosystem of themes |
| Resume builder | **RxResume** (open source, Docker) | Self-hostable, has API |
| Resume parsing | **Affinda API** + pyresparser fallback | Best accuracy with free tier |
| ATS format | Single-column, DOCX + PDF, standard headings | ATS best practices |
| Skills gap analysis | **LLM + O*NET taxonomy** | Self-hostable |
| Resume tailoring | **LLM-based** per job description | Most powerful |

**Key insight**: Build ATS keyword match scoring (resume vs job description) — this is the #1 feature missing and no existing tool offers an API for it.

---

## 10. CUTTING-EDGE / UNCONVENTIONAL APPROACHES

### Things most job seekers don't know about

1. **HackerNews "Who's Hiring"** — monthly thread, scrapable, high-quality tech jobs. GitHub scrapers exist.
2. **WorkAtAStartup** (YC) — Y Combinator's job board. Has an API-like structure.
3. **BuiltWith API** — find companies using specific tech stacks (e.g. "companies using Django in Bangalore")
4. **Crunchbase API** — identify recently funded startups (they're hiring)
5. **Layoffs.fyi** — track layoffs → companies backfilling = opportunities
6. **GitHub Jobs** (defunct) but GitHub Discussions/topics for jobs
7. **Reverse job search**: Make companies come to you via Hired.com, Turing, Arc.dev
8. **Google Alerts** — set up alerts for "hiring [your role] [your city]"
9. **Company tech blog monitoring** — companies that blog about tech are usually hiring
10. **MCP (Model Context Protocol)** — Happenstance already has MCP support; more job-related MCP tools likely coming

---

## PRIORITY INTEGRATION ROADMAP

### Tier 1 — Do Now (highest impact, lowest effort)

| Integration | What | Effort | Impact |
|---|---|---|---|
| **JobSpy** | Add 5 job boards (Indeed, Glassdoor, ZipRecruiter + better LinkedIn/Google) | Medium | **Very High** |
| **RemoteOK + Jobicy APIs** | Two free APIs, instant integration | Low | Medium |
| **HackerNews Who's Hiring** | Monthly scrape of quality tech jobs | Low | Medium |
| **ATS keyword match scoring** | Score resume against each job description | Medium | **Very High** |
| **Hunter.io** | Find contact emails at target companies | Low | High |

### Tier 2 — Do Next

| Integration | What | Effort | Impact |
|---|---|---|---|
| **Embedding-based matching** | Semantic similarity for job-resume matching | Medium | High |
| **AI mock interviewer** | Claude-powered interview prep per job | Medium | High |
| **Resume tailoring per job** | Auto-customize resume bullets for each job | Medium | High |
| **Naukri email alert parsing** | Parse India job alerts | Medium | High (India) |

### Tier 3 — Future

| Integration | What | Effort | Impact |
|---|---|---|---|
| **Auto-apply assist** | Form pre-filling (not full auto) | High | Very High |
| **Apollo.io enrichment** | Bulk contact data for networking | Medium | Medium |
| **Crunchbase funded startups** | Identify hiring companies | Medium | Medium |
| **Voice mock interviews** | Whisper + ElevenLabs + Claude | High | Medium |
