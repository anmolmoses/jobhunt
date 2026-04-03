import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

interface GeoResult {
  latitude: number | null;
  longitude: number | null;
  displayName: string | null;
}

let lastNominatimCall = 0;

async function nominatimSearch(query: string): Promise<GeoResult> {
  // Rate limit: 1 req/sec
  const now = Date.now();
  const elapsed = now - lastNominatimCall;
  if (elapsed < 1100) {
    await new Promise((r) => setTimeout(r, 1100 - elapsed));
  }
  lastNominatimCall = Date.now();

  const params = new URLSearchParams({
    q: query,
    format: "json",
    limit: "1",
    addressdetails: "1",
  });

  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?${params.toString()}`,
    { headers: { "User-Agent": "JobHunt/1.0 (self-hosted job search app)" } }
  );

  if (!res.ok) throw new Error(`Nominatim error: ${res.status}`);
  const data = await res.json();
  if (data.length === 0) return { latitude: null, longitude: null, displayName: null };

  return {
    latitude: parseFloat(data[0].lat),
    longitude: parseFloat(data[0].lon),
    displayName: data[0].display_name,
  };
}

function cacheResult(query: string, result: GeoResult) {
  db.insert(schema.geocodeCache)
    .values({
      locationQuery: query,
      latitude: result.latitude,
      longitude: result.longitude,
      displayName: result.displayName,
      failed: !result.latitude,
    })
    .onConflictDoNothing()
    .run();
}

function checkCache(query: string): GeoResult | null {
  const cached = db
    .select()
    .from(schema.geocodeCache)
    .where(eq(schema.geocodeCache.locationQuery, query))
    .get();
  if (!cached) return null;
  if (cached.failed) return { latitude: null, longitude: null, displayName: null };
  return { latitude: cached.latitude, longitude: cached.longitude, displayName: cached.displayName };
}

/**
 * Geocode a location string to lat/lng using Nominatim (OpenStreetMap).
 * Results are cached in the geocode_cache table.
 */
export async function geocode(location: string): Promise<GeoResult> {
  if (!location || location.toLowerCase() === "remote") {
    return { latitude: null, longitude: null, displayName: null };
  }

  const query = location.trim().toLowerCase();
  const cached = checkCache(query);
  if (cached) return cached;

  try {
    const result = await nominatimSearch(location);
    cacheResult(query, result);
    return result;
  } catch (error) {
    console.error("Geocode error for", location, error);
    cacheResult(query, { latitude: null, longitude: null, displayName: null });
    return { latitude: null, longitude: null, displayName: null };
  }
}

/**
 * Geocode a company at a location. Tries increasingly specific queries:
 * 1. "{company} office, {location}" — finds the actual office POI
 * 2. "{company}, {location}" — finds company as a place
 * 3. "{location}" — falls back to city-level
 * Results are cached per company+location combo.
 */
export async function geocodeCompany(
  company: string,
  location: string,
  headquarters?: string | null
): Promise<GeoResult> {
  if (!location || location.toLowerCase() === "remote") {
    return { latitude: null, longitude: null, displayName: null };
  }

  // Normalize company name for cache key
  const companyClean = company.replace(/\s*(inc\.?|ltd\.?|llc|corp\.?|pvt\.?|private|limited)\s*/gi, "").trim();
  const cacheKey = `company:${companyClean.toLowerCase()}:${location.trim().toLowerCase()}`;

  const cached = checkCache(cacheKey);
  if (cached) return cached;

  try {
    // Strategy 1: If we have a specific headquarters address from enrichment, try that
    if (headquarters && headquarters.length > 10) {
      const hqResult = await nominatimSearch(headquarters);
      if (hqResult.latitude) {
        cacheResult(cacheKey, hqResult);
        return hqResult;
      }
    }

    // Strategy 2: Try "{company} office, {location}" — works for well-known companies in OSM
    const officeResult = await nominatimSearch(`${companyClean} office, ${location}`);
    if (officeResult.latitude) {
      cacheResult(cacheKey, officeResult);
      return officeResult;
    }

    // Strategy 3: Try "{company}, {location}" — company as POI
    const companyResult = await nominatimSearch(`${companyClean}, ${location}`);
    if (companyResult.latitude) {
      cacheResult(cacheKey, companyResult);
      return companyResult;
    }

    // Strategy 4: Fall back to just the location
    const locationResult = await nominatimSearch(location);
    cacheResult(cacheKey, locationResult);
    return locationResult;
  } catch (error) {
    console.error("Geocode company error for", company, location, error);
    // Fall back to basic location geocoding
    const fallback = await geocode(location);
    cacheResult(cacheKey, fallback);
    return fallback;
  }
}

/**
 * Geocode multiple locations with rate limiting (1 req/sec for Nominatim).
 */
export async function geocodeBatch(
  locations: string[]
): Promise<Map<string, GeoResult>> {
  const results = new Map<string, GeoResult>();
  const unique = [...new Set(locations.filter(Boolean))];

  for (const loc of unique) {
    const result = await geocode(loc);
    results.set(loc, result);
  }

  return results;
}
