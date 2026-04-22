import { spawn, execFile } from "child_process";
import { createHash } from "crypto";
import type { JobSearchProvider, JobSearchParams, NormalizedJob } from "@/types/jobs";

const TIMEOUT_MS = 180_000; // 3 min hard cap per spec

let configuredCache: boolean | null = null;

export class ClaudeCodeProvider implements JobSearchProvider {
  readonly name = "claude-code" as const;

  async isConfigured(): Promise<boolean> {
    if (configuredCache !== null) return configuredCache;
    configuredCache = await new Promise<boolean>((resolve) => {
      execFile("claude", ["--version"], { timeout: 5000 }, (err) => {
        resolve(!err);
      });
    });
    return configuredCache;
  }

  async search(params: JobSearchParams): Promise<NormalizedJob[]> {
    const prompt = buildPrompt(params);
    const raw = await runClaude(prompt);
    if (!raw) return [];

    const parsed = extractJobsArray(raw);
    if (!parsed) {
      console.error("[claude-code] Failed to parse JSON from claude output:", raw.slice(0, 2000));
      return [];
    }

    const cap = params.resultsPerPage ?? 15;
    return parsed.slice(0, cap).map((j) => toNormalized(j));
  }
}

function buildPrompt(p: JobSearchParams): string {
  const location = p.location || "any";
  const remote = p.remote ? "true" : "false";
  const datePosted = p.datePosted || "30 days";
  const salaryMin = p.salaryMin ? String(p.salaryMin) : "none";
  const count = p.resultsPerPage || 15;
  return [
    "You are a job search assistant. Use WebSearch and WebFetch to find currently-posted jobs matching these criteria:",
    `query=${p.query}, location=${location}, remote=${remote}, posted within ${datePosted}, salary>=${salaryMin}.`,
    "Return a JSON array where each item is {title, company, location, description (200-400 chars), applyUrl, salary, postedDate (ISO if known, else null), tags (string[])}.",
    `Aim for up to ${count} high-quality real, currently-open postings.`,
    "Only output the JSON array, nothing else.",
  ].join(" ");
}

function runClaude(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn(
      "claude",
      ["-p", prompt, "--output-format", "stream-json", "--verbose", "--allowed-tools", "WebSearch,WebFetch"],
      { stdio: ["ignore", "pipe", "pipe"] }
    );

    let stdout = "";
    let stderr = "";
    let done = false;

    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        try { child.kill("SIGKILL"); } catch {}
        console.error("[claude-code] timeout after", TIMEOUT_MS, "ms");
        resolve(stdout);
      }
    }, TIMEOUT_MS);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (d: string) => { stdout += d; });
    child.stderr.on("data", (d: string) => { stderr += d; });
    child.on("error", (err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      console.error("[claude-code] spawn error:", err);
      resolve("");
    });
    child.on("close", () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (stderr) console.error("[claude-code] stderr:", stderr.slice(0, 1000));
      resolve(stdout);
    });
  });
}

function extractJobsArray(raw: string): RawJob[] | null {
  // stream-json emits newline-delimited JSON messages; the final one has type=result with a .result string.
  let finalText = "";
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  for (const line of lines) {
    try {
      const msg = JSON.parse(line);
      if (msg && typeof msg === "object" && msg.type === "result" && typeof msg.result === "string") {
        finalText = msg.result;
      }
    } catch {
      // non-JSON line, skip
    }
  }
  // Fallback: if stream-json didn't yield a result, try parsing whole raw as json (non-stream mode)
  if (!finalText) {
    try {
      const whole = JSON.parse(raw);
      if (whole && typeof whole === "object" && typeof whole.result === "string") {
        finalText = whole.result;
      }
    } catch {
      finalText = raw;
    }
  }

  const cleaned = stripFences(finalText).trim();
  // Try bare array or {jobs: [...]}
  const attempts = [cleaned, extractFirstJsonBlock(cleaned)];
  for (const a of attempts) {
    if (!a) continue;
    try {
      const v = JSON.parse(a);
      if (Array.isArray(v)) return v as RawJob[];
      if (v && typeof v === "object" && Array.isArray(v.jobs)) return v.jobs as RawJob[];
    } catch {
      // continue
    }
  }
  return null;
}

function stripFences(s: string): string {
  return s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
}

function extractFirstJsonBlock(s: string): string | null {
  const firstArr = s.indexOf("[");
  const firstObj = s.indexOf("{");
  let start = -1;
  if (firstArr === -1) start = firstObj;
  else if (firstObj === -1) start = firstArr;
  else start = Math.min(firstArr, firstObj);
  if (start === -1) return null;
  const open = s[start];
  const close = open === "[" ? "]" : "}";
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

interface RawJob {
  title?: string;
  company?: string;
  location?: string | null;
  description?: string | null;
  applyUrl?: string | null;
  salary?: string | null;
  postedDate?: string | null;
  tags?: string[] | null;
}

function toNormalized(j: RawJob): NormalizedJob {
  const title = (j.title || "").trim() || "Unknown";
  const company = (j.company || "").trim() || "Unknown";
  const applyUrl = j.applyUrl || null;
  const location = j.location || null;
  const description = j.description || null;
  const salary = j.salary || null;
  const [salaryMin, salaryMax] = parseSalary(salary);
  const tags = Array.isArray(j.tags) ? j.tags.filter((t): t is string => typeof t === "string") : [];
  const isRemote = detectRemote(location, description);
  const externalId = createHash("sha1").update(`${title}|${company}|${applyUrl ?? ""}`).digest("hex").slice(0, 16);

  return {
    externalId,
    provider: "claude-code",
    title,
    company,
    location,
    salary,
    salaryMin,
    salaryMax,
    description,
    jobType: null,
    isRemote,
    applyUrl,
    companyLogo: null,
    postedAt: j.postedDate || null,
    tags,
    relevanceScore: null,
    dedupeKey: normalize(title) + "|" + normalize(company),
  };
}

function detectRemote(location: string | null, description: string | null): boolean {
  const hay = `${location || ""} ${description || ""}`.toLowerCase();
  return /\b(remote|anywhere|worldwide|work from home|wfh)\b/.test(hay);
}

function parseSalary(s: string | null): [number | null, number | null] {
  if (!s) return [null, null];
  const nums = Array.from(s.matchAll(/(\d{1,3}(?:[,]\d{3})+|\d{2,7})(k)?/gi)).map((m) => {
    let n = parseFloat(m[1].replace(/,/g, ""));
    if (m[2] && n < 1000) n *= 1000;
    return n;
  }).filter((n) => Number.isFinite(n) && n >= 1000);
  if (nums.length === 0) return [null, null];
  if (nums.length === 1) return [nums[0], null];
  return [Math.min(...nums), Math.max(...nums)];
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}
