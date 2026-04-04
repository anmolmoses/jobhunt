/**
 * Fuzzy company name matching.
 *
 * Handles cases like:
 * - "HARMAN India" vs "HARMAN International" vs "Harman"
 * - "Google LLC" vs "Google India Pvt Ltd"
 * - "Booz Allen Hamilton" vs "Booz Allen"
 * - "JP Morgan Chase" vs "JPMorgan"
 */

const STRIP_SUFFIXES = [
  // Legal/corporate
  "inc", "incorporated", "corp", "corporation", "llc", "ltd", "limited",
  "plc", "gmbh", "ag", "sa", "sas", "bv", "nv", "co", "company",
  "pvt", "private", "public",
  // Regional
  "india", "usa", "us", "uk", "international", "global", "worldwide",
  "americas", "europe", "asia", "pacific", "apac", "emea", "latam",
  "north america", "south asia",
  // Industry descriptors commonly appended
  "technologies", "technology", "tech", "software", "solutions",
  "services", "systems", "group", "holdings", "enterprises",
  "consulting", "labs", "digital", "studios",
  // Common noise
  "the",
];

// Sort longest-first so "north america" is tried before "america"
const SORTED_SUFFIXES = [...STRIP_SUFFIXES].sort((a, b) => b.length - a.length);

/**
 * Extract the core company name by stripping common suffixes,
 * punctuation, and normalizing whitespace.
 */
export function coreCompanyName(name: string): string {
  let n = name.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();

  // Strip suffixes iteratively (a name might have multiple: "Google India Pvt Ltd")
  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of SORTED_SUFFIXES) {
      if (n.endsWith(` ${suffix}`)) {
        n = n.slice(0, -(suffix.length + 1)).trim();
        changed = true;
      }
      if (n.startsWith(`${suffix} `)) {
        n = n.slice(suffix.length + 1).trim();
        changed = true;
      }
    }
  }

  // Remove all spaces for final comparison token
  return n.replace(/\s+/g, "");
}

/**
 * Compute bigram similarity between two strings (Dice coefficient).
 * Returns 0-1 where 1 is identical.
 */
function bigramSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const bigramsA = new Set<string>();
  for (let i = 0; i < a.length - 1; i++) bigramsA.add(a.slice(i, i + 2));

  const bigramsB = new Set<string>();
  for (let i = 0; i < b.length - 1; i++) bigramsB.add(b.slice(i, i + 2));

  let intersection = 0;
  for (const bg of bigramsA) {
    if (bigramsB.has(bg)) intersection++;
  }

  return (2 * intersection) / (bigramsA.size + bigramsB.size);
}

/**
 * Check if two company names refer to the same company.
 *
 * Strategy:
 * 1. Exact normalized match (fast path)
 * 2. Core name exact match (strips suffixes)
 * 3. One core contains the other (for partial names)
 * 4. Bigram similarity > 0.7 on core names
 */
export function companiesMatch(nameA: string, nameB: string): boolean {
  // Fast path: exact normalized match
  const normA = nameA.toLowerCase().replace(/[^a-z0-9]/g, "");
  const normB = nameB.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (normA === normB) return true;

  // Core name comparison
  const coreA = coreCompanyName(nameA);
  const coreB = coreCompanyName(nameB);
  if (!coreA || !coreB) return false;

  // Exact core match
  if (coreA === coreB) return true;

  // One contains the other (handles "Booz Allen" vs "Booz Allen Hamilton")
  if (coreA.length >= 3 && coreB.length >= 3) {
    if (coreA.includes(coreB) || coreB.includes(coreA)) return true;
  }

  // Bigram similarity for close matches (handles "JPMorgan" vs "JP Morgan")
  const sim = bigramSimilarity(coreA, coreB);
  if (sim >= 0.7) return true;

  return false;
}

/**
 * Filter an array of items by fuzzy company match.
 * More efficient than calling companiesMatch N times — pre-computes the target core name.
 */
export function filterByCompany<T>(
  items: T[],
  targetCompany: string,
  getCompany: (item: T) => string | null | undefined
): T[] {
  const targetNorm = targetCompany.toLowerCase().replace(/[^a-z0-9]/g, "");
  const targetCore = coreCompanyName(targetCompany);

  return items.filter((item) => {
    const company = getCompany(item);
    if (!company) return false;

    const itemNorm = company.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (itemNorm === targetNorm) return true;

    const itemCore = coreCompanyName(company);
    if (!itemCore || !targetCore) return false;
    if (itemCore === targetCore) return true;
    if (itemCore.length >= 3 && targetCore.length >= 3) {
      if (itemCore.includes(targetCore) || targetCore.includes(itemCore)) return true;
    }
    if (bigramSimilarity(itemCore, targetCore) >= 0.7) return true;

    return false;
  });
}
