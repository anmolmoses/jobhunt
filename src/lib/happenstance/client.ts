import { getSetting } from "@/lib/settings";

const BASE_URL = "https://api.happenstance.ai/v1";

async function getApiKey(): Promise<string> {
  const key = await getSetting("happenstance_api_key");
  if (!key) throw new Error("Happenstance API key not configured. Add it in Settings.");
  return key;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const apiKey = await getApiKey();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    throw new Error(
      errBody?.detail || `Happenstance API error: ${res.status}`
    );
  }

  return res.json();
}

// --- Types ---

export interface SearchResult {
  id: string;
  url: string;
  status: "completed" | "processing" | "failed";
  text: string;
  results?: PersonResult[];
  mutuals?: string[];
  next_page_id?: string;
}

export interface PersonResult {
  name: string;
  title?: string;
  bio?: string;
  location?: string;
  linkedin_url?: string;
  email?: string;
  image_url?: string;
  mutual_connections?: string[];
  connection_type?: string;
  introducer?: string;
  // There may be more fields — we store the full raw object
  [key: string]: unknown;
}

export interface ResearchResult {
  id: string;
  status: "completed" | "processing" | "failed";
  query: string;
  profile?: {
    name?: string;
    title?: string;
    bio?: string;
    linkedin_url?: string;
    email?: string;
    location?: string;
    [key: string]: unknown;
  };
}

// --- API Methods ---

/**
 * Search for people at a company or matching a query.
 * Costs 2 credits. Returns a search ID to poll for results.
 */
export async function createSearch(
  query: string,
  options?: {
    includeMyConnections?: boolean;
    includeFriendsConnections?: boolean;
    groupIds?: string[];
  }
): Promise<{ id: string; url: string }> {
  return request<{ id: string; url: string }>("/search", {
    method: "POST",
    body: JSON.stringify({
      text: query,
      include_my_connections: options?.includeMyConnections ?? true,
      include_friends_connections: options?.includeFriendsConnections ?? true,
      group_ids: options?.groupIds,
    }),
  });
}

/**
 * Get search results. Poll this until status is "completed".
 */
export async function getSearch(searchId: string, pageId?: string): Promise<SearchResult> {
  const params = pageId ? `?page_id=${pageId}` : "";
  return request<SearchResult>(`/search/${searchId}${params}`);
}

/**
 * Search and wait for results (polls until complete, max 30s).
 */
export async function searchAndWait(
  query: string,
  options?: {
    includeMyConnections?: boolean;
    includeFriendsConnections?: boolean;
  }
): Promise<SearchResult> {
  const { id } = await createSearch(query, options);

  // Poll for results
  const maxAttempts = 15;
  for (let i = 0; i < maxAttempts; i++) {
    const result = await getSearch(id);
    if (result.status === "completed" || result.status === "failed") {
      return result;
    }
    // Wait 2 seconds between polls
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  // Return whatever we have after timeout
  return getSearch(id);
}

/**
 * Research a specific person. Costs 1 credit.
 */
export async function createResearch(
  description: string
): Promise<{ id: string; url: string }> {
  return request<{ id: string; url: string }>("/research", {
    method: "POST",
    body: JSON.stringify({ description }),
  });
}

/**
 * Get research results for a person.
 */
export async function getResearch(researchId: string): Promise<ResearchResult> {
  return request<ResearchResult>(`/research/${researchId}`);
}

/**
 * Get current user profile.
 */
export async function getMe(): Promise<{ email: string; name: string; friends: string[] }> {
  return request("/users/me");
}

/**
 * Get credit usage info.
 */
export async function getUsage(): Promise<{
  balance_credits: number;
  has_credits: boolean;
}> {
  return request("/usage");
}

/**
 * Check if Happenstance is configured.
 */
export async function isConfigured(): Promise<boolean> {
  const key = await getSetting("happenstance_api_key");
  return !!key;
}
