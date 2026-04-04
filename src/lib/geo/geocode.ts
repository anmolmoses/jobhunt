import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { isFirecrawlConfigured, getFirecrawlClient } from "@/lib/firecrawl/client";

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

/**
 * Extract a street address from Firecrawl search result descriptions.
 * Search results often contain the full address in the description or title.
 */
function extractAddressFromSearchResults(
  results: { title?: string; description?: string; url?: string }[],
  city: string
): string | null {
  const cityTerms = city.toLowerCase().split(/[\s,]+/).filter((t) => t.length > 2);

  for (const result of results) {
    const text = `${result.title || ""} ${result.description || ""}`;
    const textLower = text.toLowerCase();

    // Must mention the city
    if (!cityTerms.some((term) => textLower.includes(term))) continue;

    // Look for address patterns: "123, Street Name, Area, City, State PIN"
    const addressPatterns = [
      // Full address with postal code
      /(\d+[,\s]+[A-Za-z][A-Za-z\s,.-]+(?:\d{5,6}|\d{3}\s?\d{3})[,\s]*(?:India|USA|UK|Canada|Australia|[A-Z]{2})?)/g,
      // "by the address ..." pattern
      /(?:address|located at|office at)[:\s]+([^.]+)/gi,
      // General address with street indicators
      /(\d+[,\s]+(?:[A-Za-z]+\s+)*(?:Road|Rd|Street|St|Avenue|Ave|Blvd|Lane|Ring Rd|Highway|Hwy|Marg|Nagar)[^.]*)/gi,
    ];

    for (const pattern of addressPatterns) {
      pattern.lastIndex = 0;
      const match = pattern.exec(text);
      if (match && match[1]) {
        const addr = match[1].replace(/[*#\[\]()]/g, "").trim().replace(/[,\s]+$/, "");
        if (addr.length > 15 && addr.length < 250) return addr;
      }
    }
  }

  return null;
}

/**
 * Use Firecrawl search to find the actual office address for a company in a city,
 * then geocode that specific address with Nominatim.
 */
async function firecrawlGeocode(
  company: string,
  location: string
): Promise<GeoResult> {
  if (!(await isFirecrawlConfigured())) {
    return { latitude: null, longitude: null, displayName: null };
  }

  try {
    const client = await getFirecrawlClient();
    if (!client) return { latitude: null, longitude: null, displayName: null };

    // Use Firecrawl search to find the office address
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const searchResult = await (client as any).search(`${company} office ${location} address`, { limit: 3 });

    const results = (searchResult?.data || []) as { title?: string; description?: string; url?: string }[];
    if (results.length === 0) return { latitude: null, longitude: null, displayName: null };

    // Extract address from search result descriptions
    const address = extractAddressFromSearchResults(results, location);
    if (address) {
      const geo = await nominatimSearch(address);
      if (geo.latitude) return geo;
    }

    // If no structured address found, try using the first result's description as context
    // and geocode "{company} {first_result_description_snippet}"
    const firstDesc = results[0]?.description || "";
    if (firstDesc.length > 20) {
      // Extract just the location-relevant part
      const snippet = firstDesc.slice(0, 100).replace(/[.!?].*$/, "").trim();
      const geo = await nominatimSearch(`${company} ${snippet}`);
      if (geo.latitude) return geo;
    }
  } catch (e) {
    console.error("Firecrawl search geocode error:", e);
  }

  return { latitude: null, longitude: null, displayName: null };
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
 * Geocode a company at a location. Tries strategies in order:
 * 1. "{company} {location}" — finds company POI in OpenStreetMap (no comma!)
 * 2. Enrichment headquarters address — from company enrichment data
 * 3. Firecrawl — scrapes company website for office address, geocodes that
 * 4. "{location}" — falls back to city-level
 *
 * NOTE: Commas in Nominatim queries cause failures. "Cisco Bangalore" works,
 * "Cisco, Bangalore" returns nothing. Always use space-separated queries.
 */
export async function geocodeCompany(
  company: string,
  location: string,
  headquarters?: string | null,
  companyDomain?: string | null
): Promise<GeoResult> {
  if (!location || location.toLowerCase() === "remote") {
    return { latitude: null, longitude: null, displayName: null };
  }

  // Normalize company name for cache key
  const companyClean = company.replace(/\s*(inc\.?|ltd\.?|llc|corp\.?|pvt\.?|private|limited)\s*/gi, "").trim();
  const cacheKey = `company:${companyClean.toLowerCase()}:${location.trim().toLowerCase()}`;

  const cached = checkCache(cacheKey);
  if (cached) return cached;

  // Clean location — strip parenthetical notes like "(Remote)" or "(Hybrid)"
  const locationClean = location.replace(/\s*\(.*?\)\s*/g, "").trim();

  try {
    // Strategy 1: "{company} {location}" — NO COMMA, finds company POI in OSM
    const poiResult = await nominatimSearch(`${companyClean} ${locationClean}`);
    if (poiResult.latitude) {
      cacheResult(cacheKey, poiResult);
      return poiResult;
    }

    // Strategy 2: Enrichment headquarters address
    if (headquarters && headquarters.length > 10 && headquarters !== "Unknown") {
      const hqResult = await nominatimSearch(headquarters);
      if (hqResult.latitude) {
        cacheResult(cacheKey, hqResult);
        return hqResult;
      }
    }

    // Strategy 3: Firecrawl search — search for company office address, then geocode
    try {
      const fcResult = await firecrawlGeocode(companyClean, locationClean);
      if (fcResult.latitude) {
        cacheResult(cacheKey, fcResult);
        return fcResult;
      }
    } catch (e) {
      console.error("Firecrawl geocode failed for", company, e);
    }

    // Strategy 4: Fall back to just the location (city-level)
    const locationResult = await nominatimSearch(locationClean);
    cacheResult(cacheKey, locationResult);
    return locationResult;
  } catch (error) {
    console.error("Geocode company error for", company, location, error);
    const fallback = await geocode(location);
    cacheResult(cacheKey, fallback);
    return fallback;
  }
}

/**
 * Clear geocode cache entries so they can be re-geocoded.
 * Used by the "Update Map Coordinates" button in settings.
 */
export function clearGeocodeCache() {
  db.delete(schema.geocodeCache).run();
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
