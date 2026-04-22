import { NextResponse } from "next/server";
import {
  currentProviders,
  loadExperimentalProviders,
  EXPERIMENTAL_SLUG_LIST,
} from "@lab/lib/registry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const experimental = await loadExperimentalProviders();
  const loadedNames = new Set(experimental.map((p) => p.name));

  async function describe(p: { name: string; isConfigured: () => Promise<boolean> }) {
    let configured = false;
    let configErr: string | null = null;
    try {
      configured = await p.isConfigured();
    } catch (e) {
      configErr = e instanceof Error ? e.message : String(e);
    }
    return { name: p.name, configured, configError: configErr };
  }

  const [current, experimentalList] = await Promise.all([
    Promise.all(currentProviders.map(describe)),
    Promise.all(experimental.map(describe)),
  ]);

  return NextResponse.json({
    current,
    experimental: experimentalList,
    // Slugs declared in the registry that are not present yet
    experimentalPending: EXPERIMENTAL_SLUG_LIST.filter(
      (slug) => !loadedNames.has(slug as never),
    ),
  });
}
