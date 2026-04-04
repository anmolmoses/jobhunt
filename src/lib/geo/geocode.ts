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
 * Extract the first city name from a location string.
 * "Bengaluru, Karnataka, India" → "Bengaluru"
 */
function extractCity(location: string): string {
  return location.split(/[,/]/)[0].trim();
}

/** Common city name aliases for matching */
const CITY_ALIASES: Record<string, string[]> = {
  bengaluru: ["bangalore", "bengaluru", "blr"],
  mumbai: ["bombay", "mumbai"],
  chennai: ["madras", "chennai"],
  kolkata: ["calcutta", "kolkata"],
  gurgaon: ["gurugram", "gurgaon"],
  pune: ["pune", "poona"],
  hyderabad: ["hyderabad"],
  delhi: ["delhi", "new delhi", "ncr", "noida", "ghaziabad"],
};

function getCityVariants(city: string): string[] {
  const lower = city.toLowerCase();
  for (const aliases of Object.values(CITY_ALIASES)) {
    if (aliases.some((a) => lower.includes(a))) return aliases;
  }
  return [lower];
}

/**
 * Extract address from Firecrawl search results for a city.
 * Handles Indian addresses (park names, ring roads, PIN codes),
 * US addresses (street numbers), and international formats.
 */
function extractAddressFromSearchResults(
  results: { title?: string; description?: string; url?: string }[],
  city: string
): string | null {
  const cityLower = city.toLowerCase();

  const cityVariants = getCityVariants(city);

  for (const result of results) {
    const text = `${result.title || ""} ${result.description || ""}`;
    const textLower = text.toLowerCase();

    // Must mention the city or any of its aliases
    if (!cityVariants.some((v) => textLower.includes(v))) continue;

    // Strategy 1: Explicit address patterns — most reliable
    // Only match "address" when followed by actual address content (numbers, building names, roads)
    const explicitMatch = text.match(/(?:India-in|registered office address is|address is|located (?:at|in)|office at)\s*[:\s]+([^.]{15,200})/i)
      || text.match(/\baddress[:\s]+(\d[^.]{15,200})/i)
      || text.match(/\baddress[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+[^.]{10,150})/i);
    if (explicitMatch) {
      const addr = explicitMatch[1].replace(/[*#\[\]]/g, "").trim();
      if (addr.length > 15) return addr;
    }

    // Strategy 2: Known Indian tech park / business park landmarks
    const landmarkPatterns = [
      // "Embassy Golf Links" / "RMZ Ecoworld" / "Tech Park" style
      /([A-Z][A-Za-z\s]+(?:Business Park|Tech Park|Technopark|IT Park|Software Park|Ecoworld|Embassy|Campus|Tower|Center|Centre|Plaza)[A-Za-z0-9\s,.'/-]*)/i,
      // Ring Road / well-known area references
      /((?:[A-Za-z0-9']+[,\s]+){2,}(?:Ring Road|Ring Rd|Outer Ring|Inner Ring|Intermediate Ring|Hosur Road|Whitefield|Electronic City|Manyata|Hebbal|Marathahalli|Bellandur|Koramangala|Indiranagar|HSR|BTM|JP Nagar|Bannerghatta)[^.]*)/i,
    ];

    for (const pattern of landmarkPatterns) {
      const match = text.match(pattern);
      if (match) {
        let addr = match[1].replace(/[*#\[\]]/g, "").trim().replace(/[,\s]+$/, "");
        // Append city if not already in the address
        if (!addr.toLowerCase().includes(cityLower)) addr += " " + city;
        if (addr.length > 15 && addr.length < 250) return addr;
      }
    }

    // Strategy 3: Postal/PIN code based — grab everything before the PIN code
    const pinMatch = text.match(/([A-Za-z][A-Za-z0-9\s,'./()-]{10,150}\b\d{5,6}\b)/);
    if (pinMatch) {
      const addr = pinMatch[1].replace(/[*#\[\]]/g, "").trim();
      if (addr.length > 15 && addr.length < 250) return addr;
    }

    // Strategy 4: General street-number based addresses
    const streetMatch = text.match(/(\d+[,\s/]+[A-Za-z][A-Za-z\s,.'/-]+(?:Road|Rd|Street|St|Avenue|Ave|Blvd|Lane|Drive|Dr|Way|Marg|Nagar|Cross|Main)[^.]*)/i);
    if (streetMatch) {
      const addr = streetMatch[1].replace(/[*#\[\]]/g, "").trim().replace(/[,\s]+$/, "");
      if (addr.length > 15 && addr.length < 250) return addr;
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

  // Use just the city name for search — "Bengaluru" not "Bengaluru, Karnataka, India"
  const city = extractCity(location);

  try {
    const client = await getFirecrawlClient();
    if (!client) return { latitude: null, longitude: null, displayName: null };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const searchResult = await (client as any).search(`${company} office ${city} address`, { limit: 5 });

    // SDK v4 returns { web: [...] }, raw API returns { data: [...] }
    const results = (searchResult?.data || searchResult?.web || []) as { title?: string; description?: string; url?: string }[];
    if (results.length === 0) return { latitude: null, longitude: null, displayName: null };

    // Try to extract a street address from search results
    const address = extractAddressFromSearchResults(results, city);
    if (address) {
      // Try the full extracted address first
      const geo = await nominatimSearch(address);
      if (geo.latitude) return geo;
      // Extract just the landmark/park name + city (Nominatim works better with short queries)
      const parkMatch = address.match(/((?:Embassy|RMZ|Manyata|Prestige|Brigade|Salarpuria|Cessna|Bagmane|Kalyani|Divyasree|Pritech|DLF|Cyber|Raheja|Mindspace)\s+[A-Za-z\s]+?(?:Park|World|Space|Tech|Campus|City|Tower|Centre|Center|Plaza))\b/i);
      if (parkMatch) {
        const parkQuery = parkMatch[1].trim() + " " + city;
        const geo2 = await nominatimSearch(parkQuery);
        if (geo2.latitude) return geo2;
      }

      // Try the first building/road mention + city
      const shortParts = address.split(/,/).slice(0, 2).join(",").trim();
      if (shortParts.length > 10) {
        const geo3 = await nominatimSearch(shortParts + " " + city);
        if (geo3.latitude) return geo3;
      }
    }

    // Last resort: try geocoding the first result description directly
    for (const r of results) {
      const desc = r.description || "";
      if (desc.length < 20) continue;
      // Take the first sentence/chunk that mentions the city
      const chunks = desc.split(/[.·]/).filter((c) => c.toLowerCase().includes(city.toLowerCase()));
      for (const chunk of chunks.slice(0, 2)) {
        const cleaned = chunk.replace(/[*#\[\]()]/g, "").trim();
        if (cleaned.length > 10 && cleaned.length < 200) {
          const geo = await nominatimSearch(cleaned);
          if (geo.latitude) return geo;
        }
      }
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
    // Strategy 1: "{company} {city}" — just the city name, NO commas
    // Nominatim fails with "Company Bengaluru, Karnataka, India" but works with "Company Bengaluru"
    const city = extractCity(locationClean);
    const poiResult = await nominatimSearch(`${companyClean} ${city}`);
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
      // Firecrawl search for office address
      const fcResult = await firecrawlGeocode(companyClean, locationClean);
      if (fcResult.latitude) {
        cacheResult(cacheKey, fcResult);
        return fcResult;
      }
    } catch (e) {
      console.error("Firecrawl geocode failed for", company, e);
    }

    // Strategy 4: Fall back to just the city (city-level)
    const locationResult = await nominatimSearch(city);
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
