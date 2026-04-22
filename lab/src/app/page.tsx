"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Tier = "current" | "experimental";

interface ProviderInfo {
  name: string;
  configured: boolean;
  configError?: string | null;
}

interface ProvidersResponse {
  current: ProviderInfo[];
  experimental: ProviderInfo[];
  experimentalPending: string[];
}

interface RunError {
  message: string;
  stack?: string | null;
  name?: string;
}

interface RunResult {
  ok: boolean;
  ms: number;
  count: number;
  normalized: unknown[];
  error?: RunError;
}

interface JobSearchFormParams {
  query: string;
  location: string;
  remote: boolean;
  datePosted: "" | "1d" | "3d" | "7d" | "14d" | "30d";
  salaryMin: string;
  resultsPerPage: string;
}

const DEFAULT_PARAMS: JobSearchFormParams = {
  query: "software engineer",
  location: "",
  remote: false,
  datePosted: "7d",
  salaryMin: "",
  resultsPerPage: "10",
};

function buildSearchParams(f: JobSearchFormParams) {
  const out: Record<string, unknown> = { query: f.query };
  if (f.location) out.location = f.location;
  if (f.remote) out.remote = true;
  if (f.datePosted) out.datePosted = f.datePosted;
  if (f.salaryMin) {
    const n = Number(f.salaryMin);
    if (!Number.isNaN(n) && n > 0) out.salaryMin = n;
  }
  if (f.resultsPerPage) {
    const n = Number(f.resultsPerPage);
    if (!Number.isNaN(n) && n > 0) out.resultsPerPage = n;
  }
  return out;
}

export default function LabHome() {
  const [tier, setTier] = useState<Tier>("current");
  const [providers, setProviders] = useState<ProvidersResponse | null>(null);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [form, setForm] = useState<JobSearchFormParams>(DEFAULT_PARAMS);
  const [results, setResults] = useState<
    Record<string, { running: boolean; data?: RunResult }>
  >({});

  const refreshProviders = useCallback(async () => {
    setLoadingProviders(true);
    try {
      const res = await fetch("/api/providers");
      const data = (await res.json()) as ProvidersResponse;
      setProviders(data);
    } finally {
      setLoadingProviders(false);
    }
  }, []);

  useEffect(() => {
    void refreshProviders();
  }, [refreshProviders]);

  const active = useMemo<ProviderInfo[]>(() => {
    if (!providers) return [];
    return tier === "current" ? providers.current : providers.experimental;
  }, [providers, tier]);

  const runOne = useCallback(
    async (name: string) => {
      setResults((prev) => ({ ...prev, [name]: { running: true } }));
      try {
        const res = await fetch("/api/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tier,
            provider: name,
            params: buildSearchParams(form),
          }),
        });
        const data = (await res.json()) as RunResult;
        setResults((prev) => ({ ...prev, [name]: { running: false, data } }));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setResults((prev) => ({
          ...prev,
          [name]: {
            running: false,
            data: {
              ok: false,
              ms: 0,
              count: 0,
              normalized: [],
              error: { message: msg },
            },
          },
        }));
      }
    },
    [tier, form],
  );

  const runAll = useCallback(() => {
    active.forEach((p) => {
      void runOne(p.name);
    });
  }, [active, runOne]);

  return (
    <main className="mx-auto max-w-6xl p-6 space-y-6">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">JobHunt Lab</h1>
          <p className="text-xs text-neutral-400">
            Standalone sandbox on :3100 — test individual job providers against
            a shared query.
          </p>
        </div>
        <a
          href="http://localhost:3000"
          className="text-xs text-neutral-400 hover:text-neutral-200 underline decoration-dotted"
        >
          main app :3000 &rarr;
        </a>
      </header>

      <section className="rounded border border-neutral-800 bg-neutral-950 p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
          <label className="md:col-span-2 flex flex-col gap-1 text-xs">
            <span className="text-neutral-400">query</span>
            <input
              className="bg-neutral-900 border border-neutral-800 rounded px-2 py-1.5 text-sm"
              value={form.query}
              onChange={(e) => setForm({ ...form, query: e.target.value })}
            />
          </label>
          <label className="md:col-span-2 flex flex-col gap-1 text-xs">
            <span className="text-neutral-400">location</span>
            <input
              className="bg-neutral-900 border border-neutral-800 rounded px-2 py-1.5 text-sm"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-neutral-400">date posted</span>
            <select
              className="bg-neutral-900 border border-neutral-800 rounded px-2 py-1.5 text-sm"
              value={form.datePosted}
              onChange={(e) =>
                setForm({
                  ...form,
                  datePosted: e.target.value as JobSearchFormParams["datePosted"],
                })
              }
            >
              <option value="">any</option>
              <option value="1d">1d</option>
              <option value="3d">3d</option>
              <option value="7d">7d</option>
              <option value="14d">14d</option>
              <option value="30d">30d</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-neutral-400">salaryMin</span>
            <input
              type="number"
              className="bg-neutral-900 border border-neutral-800 rounded px-2 py-1.5 text-sm"
              value={form.salaryMin}
              onChange={(e) => setForm({ ...form, salaryMin: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-neutral-400">resultsPerPage</span>
            <input
              type="number"
              className="bg-neutral-900 border border-neutral-800 rounded px-2 py-1.5 text-sm"
              value={form.resultsPerPage}
              onChange={(e) =>
                setForm({ ...form, resultsPerPage: e.target.value })
              }
            />
          </label>
          <label className="flex items-center gap-2 text-xs mt-5">
            <input
              type="checkbox"
              checked={form.remote}
              onChange={(e) => setForm({ ...form, remote: e.target.checked })}
            />
            <span>remote</span>
          </label>
          <div className="md:col-span-5 flex items-end justify-end gap-2">
            <button
              onClick={() => void refreshProviders()}
              className="text-xs px-3 py-1.5 border border-neutral-800 rounded hover:bg-neutral-900"
            >
              Refresh providers
            </button>
            <button
              onClick={runAll}
              disabled={!form.query || active.length === 0}
              className="text-xs px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:bg-neutral-800 disabled:text-neutral-500 rounded font-medium"
            >
              Run All ({active.length})
            </button>
          </div>
        </div>
      </section>

      <div className="flex gap-2 border-b border-neutral-800">
        {(["current", "experimental"] as Tier[]).map((t) => (
          <button
            key={t}
            onClick={() => setTier(t)}
            className={`px-4 py-2 text-sm border-b-2 -mb-px ${
              tier === t
                ? "border-emerald-500 text-white"
                : "border-transparent text-neutral-400 hover:text-neutral-200"
            }`}
          >
            {t}
            <span className="ml-2 text-xs text-neutral-500">
              {providers
                ? t === "current"
                  ? providers.current.length
                  : providers.experimental.length
                : "…"}
            </span>
          </button>
        ))}
      </div>

      {loadingProviders && !providers ? (
        <p className="text-sm text-neutral-500">loading providers…</p>
      ) : null}

      {tier === "experimental" &&
      providers &&
      providers.experimental.length === 0 ? (
        <div className="rounded border border-dashed border-neutral-800 p-6 text-xs text-neutral-500">
          No experimental providers loaded yet. Expected files at{" "}
          <code className="text-neutral-300">
            src/lib/jobs/experimental/&lt;slug&gt;.ts
          </code>
          . Pending slugs:{" "}
          <span className="text-neutral-400">
            {providers.experimentalPending.join(", ")}
          </span>
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {active.map((p) => {
          const state = results[p.name];
          const data = state?.data;
          return (
            <article
              key={p.name}
              className="rounded border border-neutral-800 bg-neutral-950 p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block w-2.5 h-2.5 rounded-full ${
                      p.configured ? "bg-emerald-500" : "bg-neutral-600"
                    }`}
                    title={
                      p.configured
                        ? "configured"
                        : p.configError ?? "not configured"
                    }
                  />
                  <h3 className="font-medium">{p.name}</h3>
                  {data ? (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wide ${
                        data.ok
                          ? "bg-emerald-900/50 text-emerald-300"
                          : "bg-red-900/50 text-red-300"
                      }`}
                    >
                      {data.ok ? "ok" : "error"}
                    </span>
                  ) : null}
                </div>
                <button
                  onClick={() => void runOne(p.name)}
                  disabled={state?.running || !form.query}
                  className="text-xs px-2.5 py-1 border border-neutral-800 rounded hover:bg-neutral-900 disabled:opacity-40"
                >
                  {state?.running ? "running…" : "Run"}
                </button>
              </div>

              {data ? (
                <div className="flex gap-4 text-xs text-neutral-400">
                  <span>{data.ms} ms</span>
                  <span>{data.count} results</span>
                </div>
              ) : null}

              {data?.error ? (
                <details className="text-xs" open>
                  <summary className="cursor-pointer text-red-400">
                    error: {data.error.message}
                  </summary>
                  {data.error.stack ? (
                    <pre className="mt-2 p-2 bg-black rounded text-[11px] overflow-auto max-h-64 whitespace-pre-wrap">
                      {data.error.stack}
                    </pre>
                  ) : null}
                </details>
              ) : null}

              {data && data.ok ? (
                <details className="text-xs">
                  <summary className="cursor-pointer text-neutral-400">
                    normalized JSON ({data.count})
                  </summary>
                  <pre className="mt-2 p-2 bg-black rounded text-[11px] overflow-auto max-h-96">
                    {JSON.stringify(data.normalized, null, 2)}
                  </pre>
                </details>
              ) : null}

              {!p.configured && p.configError ? (
                <p className="text-[11px] text-amber-500">
                  isConfigured threw: {p.configError}
                </p>
              ) : null}
            </article>
          );
        })}
      </div>
    </main>
  );
}
