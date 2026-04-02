import { getSetting } from "@/lib/settings";

/**
 * Get a company logo URL via logo.dev.
 * Tries domain guessing first, falls back to brand search.
 * Returns null if no token configured.
 */
export async function getCompanyLogoUrl(companyName: string, existingLogo: string | null): Promise<string | null> {
  // If we already have a logo, keep it
  if (existingLogo) return existingLogo;

  const token = await getSetting("logodev_api_key");
  if (!token) return null;

  // Guess the domain from the company name
  const domain = guessDomain(companyName);
  if (domain) {
    // Use logo.dev with monogram fallback — this way if logo doesn't exist, it shows initials instead of broken image
    return `https://img.logo.dev/${domain}?token=${token}&size=128&format=png&fallback=monogram`;
  }

  return null;
}

/**
 * Guess a company's domain from its name.
 * Handles common patterns: "Google" -> "google.com", "Meta Platforms" -> "meta.com"
 */
function guessDomain(companyName: string): string | null {
  if (!companyName) return null;

  // Clean the name
  let name = companyName
    .trim()
    .toLowerCase()
    // Remove common suffixes
    .replace(/\s*(inc\.?|llc\.?|ltd\.?|corp\.?|co\.?|plc\.?|gmbh|sa|ag|group|technologies|technology|solutions|systems|consulting|services|software|labs?|studio|digital|global|international)\s*/gi, "")
    .replace(/[^a-z0-9\s.-]/g, "")
    .trim();

  // If it already looks like a domain
  if (name.includes(".")) return name;

  // Remove spaces and try .com
  const slug = name.replace(/\s+/g, "");
  if (slug.length > 0 && slug.length <= 30) {
    return `${slug}.com`;
  }

  return null;
}

/**
 * Build logo URL directly for a known domain.
 */
export async function getLogoUrlForDomain(domain: string): Promise<string | null> {
  const token = await getSetting("logodev_api_key");
  if (!token) return null;
  return `https://img.logo.dev/${domain}?token=${token}&size=128&format=png`;
}
