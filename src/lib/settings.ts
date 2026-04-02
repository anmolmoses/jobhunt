import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { decrypt } from "./encryption";

// Map setting keys to env var names
const ENV_VAR_MAP: Record<string, string> = {
  openai_api_key: "OPENAI_API_KEY",
  anthropic_api_key: "ANTHROPIC_API_KEY",
  jsearch_api_key: "JSEARCH_API_KEY",
  adzuna_app_id: "ADZUNA_APP_ID",
  adzuna_app_key: "ADZUNA_APP_KEY",
  happenstance_api_key: "HAPPENSTANCE_API_KEY",
  logodev_api_key: "LOGODEV_API_KEY",
  hunter_api_key: "HUNTER_API_KEY",
};

export async function getSetting(key: string): Promise<string | null> {
  // First check the database
  const row = db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, key))
    .get();

  if (row) {
    if (row.isEncrypted) {
      try {
        return decrypt(row.value);
      } catch {
        // Fall through to env var
      }
    } else {
      return row.value;
    }
  }

  // Fall back to env vars
  const envVar = ENV_VAR_MAP[key];
  if (envVar && process.env[envVar]) {
    return process.env[envVar]!;
  }

  return null;
}

export async function getAIProvider(): Promise<"claude" | "openai"> {
  const provider = await getSetting("ai_provider");
  return (provider as "claude" | "openai") || "claude";
}

