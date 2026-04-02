import { getSetting } from "@/lib/settings";

interface HunterEmailResult {
  email: string;
  firstName: string | null;
  lastName: string | null;
  position: string | null;
  confidence: number;
  type: string; // "personal" or "generic"
}

interface HunterDomainResult {
  emails: HunterEmailResult[];
  organization: string | null;
  domain: string;
}

/**
 * Find email addresses at a company domain using Hunter.io
 * Free tier: 25 searches/month
 */
export async function findCompanyEmails(
  domain: string,
  limit: number = 5
): Promise<HunterDomainResult | null> {
  const apiKey = await getSetting("hunter_api_key");
  if (!apiKey) return null;

  try {
    const params = new URLSearchParams({
      domain,
      api_key: apiKey,
      limit: String(limit),
    });

    const res = await fetch(
      `https://api.hunter.io/v2/domain-search?${params.toString()}`
    );

    if (!res.ok) {
      console.error("Hunter.io error:", res.status);
      return null;
    }

    const data = await res.json();
    const result = data.data;

    return {
      domain,
      organization: result.organization || null,
      emails: (result.emails || []).map((e: Record<string, unknown>) => ({
        email: e.value as string,
        firstName: (e.first_name as string) || null,
        lastName: (e.last_name as string) || null,
        position: (e.position as string) || null,
        confidence: (e.confidence as number) || 0,
        type: (e.type as string) || "generic",
      })),
    };
  } catch (error) {
    console.error("Hunter.io error:", error);
    return null;
  }
}

/**
 * Find a specific person's email at a company
 */
export async function findPersonEmail(
  domain: string,
  firstName: string,
  lastName: string
): Promise<{ email: string; confidence: number } | null> {
  const apiKey = await getSetting("hunter_api_key");
  if (!apiKey) return null;

  try {
    const params = new URLSearchParams({
      domain,
      first_name: firstName,
      last_name: lastName,
      api_key: apiKey,
    });

    const res = await fetch(
      `https://api.hunter.io/v2/email-finder?${params.toString()}`
    );

    if (!res.ok) return null;

    const data = await res.json();
    return {
      email: data.data?.email || null,
      confidence: data.data?.confidence || 0,
    };
  } catch {
    return null;
  }
}

export async function isConfigured(): Promise<boolean> {
  const key = await getSetting("hunter_api_key");
  return !!key;
}
