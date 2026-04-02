import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

interface GeoResult {
  latitude: number | null;
  longitude: number | null;
  displayName: string | null;
}

/**
 * Geocode a location string to lat/lng using Nominatim (OpenStreetMap).
 * Results are cached in the geocode_cache table.
 * Nominatim is free but requires 1 req/sec rate limiting.
 */
export async function geocode(location: string): Promise<GeoResult> {
  if (!location || location.toLowerCase() === "remote") {
    return { latitude: null, longitude: null, displayName: null };
  }

  // Normalize the query
  const query = location.trim().toLowerCase();

  // Check cache
  const cached = db
    .select()
    .from(schema.geocodeCache)
    .where(eq(schema.geocodeCache.locationQuery, query))
    .get();

  if (cached) {
    if (cached.failed) return { latitude: null, longitude: null, displayName: null };
    return {
      latitude: cached.latitude,
      longitude: cached.longitude,
      displayName: cached.displayName,
    };
  }

  // Call Nominatim
  try {
    const params = new URLSearchParams({
      q: location,
      format: "json",
      limit: "1",
      addressdetails: "1",
    });

    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?${params.toString()}`,
      {
        headers: {
          "User-Agent": "JobHunt/1.0 (self-hosted job search app)",
        },
      }
    );

    if (!res.ok) {
      throw new Error(`Nominatim error: ${res.status}`);
    }

    const data = await res.json();

    if (data.length === 0) {
      // Cache the miss
      db.insert(schema.geocodeCache)
        .values({ locationQuery: query, failed: true })
        .run();
      return { latitude: null, longitude: null, displayName: null };
    }

    const result = data[0];
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    const displayName = result.display_name;

    // Cache the result
    db.insert(schema.geocodeCache)
      .values({
        locationQuery: query,
        latitude: lat,
        longitude: lng,
        displayName,
      })
      .run();

    return { latitude: lat, longitude: lng, displayName };
  } catch (error) {
    console.error("Geocode error for", location, error);
    // Cache the failure to avoid re-hitting
    db.insert(schema.geocodeCache)
      .values({ locationQuery: query, failed: true })
      .onConflictDoNothing()
      .run();
    return { latitude: null, longitude: null, displayName: null };
  }
}

/**
 * Geocode multiple locations with rate limiting (1 req/sec for Nominatim).
 */
export async function geocodeBatch(
  locations: string[]
): Promise<Map<string, GeoResult>> {
  const results = new Map<string, GeoResult>();

  // Deduplicate
  const unique = [...new Set(locations.filter(Boolean))];

  for (const loc of unique) {
    const result = await geocode(loc);
    results.set(loc, result);

    // Rate limit: 1 req/sec for Nominatim (only for uncached)
    const cached = db
      .select()
      .from(schema.geocodeCache)
      .where(eq(schema.geocodeCache.locationQuery, loc.trim().toLowerCase()))
      .get();

    if (!cached) {
      await new Promise((r) => setTimeout(r, 1100));
    }
  }

  return results;
}
