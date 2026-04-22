import { NextRequest, NextResponse } from "next/server";
import { currentProviders, loadExperimentalProviders } from "@lab/lib/registry";
import type { JobSearchParams, JobSearchProvider } from "@app/types/jobs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Some providers (LinkedIn / Firecrawl / Indeed scraping) can be slow.
export const maxDuration = 300;

type Tier = "current" | "experimental";

interface RunBody {
  tier: Tier;
  provider: string;
  params: JobSearchParams;
}

async function findProvider(
  tier: Tier,
  name: string,
): Promise<JobSearchProvider | null> {
  if (tier === "current") {
    return currentProviders.find((p) => p.name === name) ?? null;
  }
  const experimental = await loadExperimentalProviders();
  return experimental.find((p) => p.name === name) ?? null;
}

export async function POST(req: NextRequest) {
  let body: RunBody;
  try {
    body = (await req.json()) as RunBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const { tier, provider: providerName, params } = body;
  if (!tier || !providerName || !params) {
    return NextResponse.json(
      { ok: false, error: "Missing tier, provider, or params" },
      { status: 400 },
    );
  }

  const provider = await findProvider(tier, providerName);
  if (!provider) {
    return NextResponse.json(
      { ok: false, error: `Provider '${providerName}' not found in tier '${tier}'` },
      { status: 404 },
    );
  }

  const started = Date.now();
  try {
    const normalized = await provider.search(params);
    const ms = Date.now() - started;
    return NextResponse.json({
      ok: true,
      provider: provider.name,
      ms,
      count: normalized.length,
      normalized,
    });
  } catch (e) {
    const ms = Date.now() - started;
    const err = e instanceof Error ? e : new Error(String(e));
    return NextResponse.json({
      ok: false,
      provider: provider.name,
      ms,
      count: 0,
      normalized: [],
      error: {
        message: err.message,
        stack: err.stack ?? null,
        name: err.name,
      },
    });
  }
}
