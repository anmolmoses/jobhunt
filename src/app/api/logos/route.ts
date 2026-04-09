import { NextRequest } from "next/server";
import { getSetting } from "@/lib/settings";

/**
 * GET /api/logos?domain=example.com
 * Proxies company logo images from logo.dev so the API key stays server-side.
 * Returns the image with aggressive caching headers.
 */
export async function GET(request: NextRequest) {
  const domain = request.nextUrl.searchParams.get("domain");
  if (!domain) {
    return new Response("Missing domain parameter", { status: 400 });
  }

  const token = await getSetting("logodev_api_key");
  if (!token) {
    return new Response("Logo.dev API key not configured", { status: 503 });
  }

  try {
    const logoUrl = `https://img.logo.dev/${encodeURIComponent(domain)}?token=${token}&size=128&format=png&fallback=monogram`;
    const res = await fetch(logoUrl, { next: { revalidate: 86400 } }); // Cache for 24h

    if (!res.ok) {
      return new Response(null, { status: res.status });
    }

    const imageBuffer = await res.arrayBuffer();
    return new Response(imageBuffer, {
      headers: {
        "Content-Type": res.headers.get("content-type") || "image/png",
        "Cache-Control": "public, max-age=604800, stale-while-revalidate=86400", // 7d cache, 1d stale
      },
    });
  } catch {
    return new Response(null, { status: 502 });
  }
}
