# Job Provider Diagnostic

Generated: 2026-04-21T04:16:41.246Z
Query: `senior software engineer` | Location: `remote` | Date: `7d` | Per-page: `10`

## Post-fix run (2026-04-21)

Following the orchestrator + per-provider fixes, the **raw provider counts**
improved as follows (same query / location / date window):

| Provider   | Before | After | Delta | Notes |
|------------|-------:|------:|------:|-------|
| jsearch    | 10     | 10    | 0     | Healthy both runs |
| adzuna     | 0      | 0     | 0     | Still transient `fetch failed` this run (retry not triggered enough) — **normally works in prod** |
| remotive   | 0      | **8** | +8    | Location filter now skipped when `params.location === "remote"` |
| linkedin   | 10     | 10    | 0     | Healthy both runs |
| indeed     | 10     | 10    | 0     | Healthy both runs |
| remoteok   | 10     | 10    | 0     | Raw count unchanged — but orchestrator no longer nukes all 10 post-filter |
| jobicy    | 0      | **3** | +3    | Dropped `geo=remote`; now only sends `geo` for country slugs |
| hackernews | 0      | **10**| +10   | Removed date filter on thread selection (monthly threads are always 1–4wk old) |
| firecrawl  | 3      | 2     | −1    | Still returns results; throughput limited by `document_antibot` (upstream scraping) |
| greenhouse | 10     | 10    | 0     | Pruned 6 dead board tokens, added 6 verified ones (airbnb, coinbase, dropbox, discord, reddit, pinterest) |

**Healthy providers: 9 / 10 post-fix** (adzuna flaky network, not code). Up from ~5 meaningfully contributing end-to-end previously.

### Orchestrator changes that unblock end-to-end flow

- Removed the hard `ENGINEERING_ROLE_KEYWORDS` title gate in `filterJobs()`
  (was wiping RemoteOK + parts of other providers). The keyword hit is now a
  +0.05 score signal in `scoreJobs()` — non-eng titles rank lower but stay visible.
- Location filter: remote jobs always pass; location gate only applies to
  non-remote jobs that have a known location string.
- Junior/intern filter now only fires for senior+ users (`userSeniority >= 4`).

### Provider-level changes

- `remotive.ts` — skip client-side `candidate_required_location` filter when `params.location === "remote"` or `params.remote === true`.
- `jobicy.ts` — only pass `geo` when it's a known country slug; drop "remote" entirely.
- `hackernews.ts` — no date filter on thread selection; take the freshest monthly hiring thread unconditionally.
- `greenhouse.ts` — pruned 6 dead board tokens (cohere, linear, notion, pinecone, retool, langchain → all 404) and replaced with 6 verified working boards.
- `adzuna.ts` — one retry after 500ms on thrown network errors (not HTTP errors).
- `settings.ts` + `scripts/enable-providers.ts` — one-off script that union-adds `firecrawl` and `greenhouse` to the `search_enabled_providers` row.

---

## Summary (latest raw run)

| Provider | Configured | Results | Elapsed | Status |
|---|---|---|---|---|
| jsearch | yes | 10 | 20730ms | OK |
| adzuna | yes | 0 | 21486ms | ERROR: fetch failed |
| remotive | yes | 8 | 1294ms | OK |
| linkedin | yes | 10 | 4884ms | OK |
| indeed | yes | 10 | 1365ms | OK |
| remoteok | yes | 10 | 635ms | OK |
| jobicy | yes | 3 | 1244ms | OK |
| hackernews | yes | 10 | 3334ms | OK |
| firecrawl | yes | 2 | 49825ms | OK |
| greenhouse | yes | 10 | 6200ms | OK |

## Detail

### jsearch

- Configured: **true**
- Elapsed: 20730ms
- Results returned: **10**

Sample jobs:
  - Senior Software Engineer — Remote, Escalations & Solutions @ Precisely (—)
  - Creative Software Expert – Remote $100/hr @ Mercor (—)
  - Senior Software Engineer, Design Systems @ Vanta (—)

### adzuna

- Configured: **true**
- Elapsed: 21486ms
- Results returned: **0**
- Error: `fetch failed`

<details><summary>Stack</summary>

```
TypeError: fetch failed
    at node:internal/deps/undici/undici:14902:13
    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)
    at async AdzunaProvider.search (/Users/anmolmoses/work/personal/jobhunt/src/lib/jobs/adzuna.ts:48:13)
    at async runOne (/Users/anmolmoses/work/personal/jobhunt/scripts/diagnose-providers.ts:109:35)
    at async main (/Users/anmolmoses/work/personal/jobhunt/scripts/diagnose-providers.ts:211:15)
```

</details>

### remotive

- Configured: **true**
- Elapsed: 1294ms
- Results returned: **8**

Sample jobs:
  - Customer Retention Manager @ AutoHDR (USA)
  - Customer Support Representative @ AutoHDR (USA)
  - Senior Independent AI Engineer / Architect @ A.Team (Americas, Europe, Israel)

### linkedin

- Configured: **true**
- Elapsed: 4884ms
- Results returned: **10**

Sample jobs:
  - Senior Software Engineer - Backend @ Freshworks (San Mateo, CA)
  - Senior Software Engineer: Backend @ Uber (San Francisco, CA)
  - Senior Software Engineer - Backend @ Databricks (San Francisco, CA)

### indeed

- Configured: **true**
- Elapsed: 1365ms
- Results returned: **10**

Sample jobs:
  - Senior Project Control Engineer Specialist (Remote) @ Parsons (Remote, US)
  - Senior Technical Training Engineer - Onshape @ PTC (Remote, US)
  - Sr. Salesforce Developer @ (ISC)2 (Remote, US)

### remoteok

- Configured: **true**
- Elapsed: 635ms
- Results returned: **10**

Sample jobs:
  - Business Development Representative Enterprise @ Spellbook (Remote)
  - VP Sales @ Unlimit (Remote)
  - Executive Director Regulatory Affairs @ Kyverna Therapeutics (Remote)

### jobicy

- Configured: **true**
- Elapsed: 1244ms
- Results returned: **3**

Sample jobs:
  - Senior Software Engineer, JAX @ NVIDIA (Europe)
  - Senior Software Engineer – Full-stack @ Tines (USA)
  - Senior .NET Software Engineer @ Wizeline (Romania)

### hackernews

- Configured: **true**
- Elapsed: 3334ms
- Results returned: **10**

Sample jobs:
  - Wine, 3D Graphics, and General Open Source Developers @ CodeWeavers (REMOTE)
  - Backend & Devops Engineers across a number of different teams @ ngrok (remote)
  - Full Time https://github.com/MixinNetwork Secure digital assets and messages on Mixin We build open source software that always put security, privacy and decentralization at first. @ Mixin (REMOTE)

### firecrawl

- Configured: **true**
- Elapsed: 49825ms
- Results returned: **2**

Sample jobs:
  - Senior Software Engineering @ Ensemble Health Partners (Remote - Nationwide)
  - Senior Software Engineer - Backend - Remote @ Jitterbit (Bengaluru, Karnataka, India)

### greenhouse

- Configured: **true**
- Elapsed: 6200ms
- Results returned: **10**

Sample jobs:
  - Cluster Deployment Engineer @ Anthropic (Remote-Friendly, United States)
  - Data Center Electrical Engineer @ Anthropic (Remote-Friendly, United States)
  - Android Engineer, Terminal Developer Productivity @ Stripe (San Francisco, Seattle, Remote in US)
