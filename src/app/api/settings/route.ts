import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { encrypt, decrypt, maskApiKey } from "@/lib/encryption";

const SENSITIVE_KEYS = [
  "openai_api_key",
  "anthropic_api_key",
  "jsearch_api_key",
  "adzuna_app_id",
  "adzuna_app_key",
  "happenstance_api_key",
  "logodev_api_key",
  "hunter_api_key",
  "firecrawl_api_key",
  "linkedin_li_at",
];

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
  firecrawl_api_url: "FIRECRAWL_API_URL",
  firecrawl_api_key: "FIRECRAWL_API_KEY",
};

export async function GET() {
  try {
    const allSettings = db.select().from(schema.settings).all();

    const result: Record<string, string> = {};

    // Load from DB first
    for (const setting of allSettings) {
      if (setting.isEncrypted) {
        try {
          const decrypted = decrypt(setting.value);
          result[setting.key] = maskApiKey(decrypted);
        } catch {
          result[setting.key] = "••••••••";
        }
      } else {
        result[setting.key] = setting.value;
      }
    }

    // Fill in from env vars for any keys not already in DB
    for (const [settingKey, envVar] of Object.entries(ENV_VAR_MAP)) {
      if (!result[settingKey] && process.env[envVar]) {
        result[settingKey] = maskApiKey(process.env[envVar]!);
        result[`${settingKey}_source`] = "env";
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to get settings:", error);
    return NextResponse.json({ error: "Failed to get settings" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();

    for (const [key, value] of Object.entries(body)) {
      if (typeof value !== "string") continue;

      const isSensitive = SENSITIVE_KEYS.includes(key);
      const storeValue = isSensitive ? encrypt(value) : value;

      const existing = db
        .select()
        .from(schema.settings)
        .where(eq(schema.settings.key, key))
        .get();

      if (existing) {
        db.update(schema.settings)
          .set({
            value: storeValue,
            isEncrypted: isSensitive,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(schema.settings.key, key))
          .run();
      } else {
        db.insert(schema.settings)
          .values({
            key,
            value: storeValue,
            isEncrypted: isSensitive,
          })
          .run();
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update settings:", error);
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
