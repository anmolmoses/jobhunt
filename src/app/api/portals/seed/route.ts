import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

interface SeedPortal {
  companyName: string;
  slug: string;
  scanMethod: "greenhouse" | "lever";
  category: string;
}

const DEFAULT_PORTALS: SeedPortal[] = [
  // AI Labs
  { companyName: "Anthropic", slug: "anthropic", scanMethod: "greenhouse", category: "AI Labs" },
  { companyName: "OpenAI", slug: "openai", scanMethod: "greenhouse", category: "AI Labs" },
  { companyName: "Mistral", slug: "mistralai", scanMethod: "greenhouse", category: "AI Labs" },
  { companyName: "Cohere", slug: "cohere", scanMethod: "greenhouse", category: "AI Labs" },
  { companyName: "LangChain", slug: "langchain", scanMethod: "greenhouse", category: "AI Labs" },
  { companyName: "Pinecone", slug: "pinecone", scanMethod: "greenhouse", category: "AI Labs" },

  // AI Platforms
  { companyName: "Vercel", slug: "vercel", scanMethod: "greenhouse", category: "AI Platforms" },
  { companyName: "Retool", slug: "retool", scanMethod: "greenhouse", category: "AI Platforms" },
  { companyName: "Linear", slug: "linear", scanMethod: "greenhouse", category: "AI Platforms" },
  { companyName: "Notion", slug: "notion", scanMethod: "greenhouse", category: "AI Platforms" },
  { companyName: "Figma", slug: "figma", scanMethod: "greenhouse", category: "AI Platforms" },

  // Voice AI
  { companyName: "ElevenLabs", slug: "elevenlabs", scanMethod: "greenhouse", category: "Voice AI" },
  { companyName: "Deepgram", slug: "deepgram", scanMethod: "greenhouse", category: "Voice AI" },

  // Enterprise
  { companyName: "Stripe", slug: "stripe", scanMethod: "greenhouse", category: "Enterprise" },
  { companyName: "Twilio", slug: "twilio", scanMethod: "greenhouse", category: "Enterprise" },
];

export async function POST() {
  try {
    let added = 0;
    let skipped = 0;

    for (const portal of DEFAULT_PORTALS) {
      const normalizedName = portal.companyName.toLowerCase().replace(/[^a-z0-9]/g, "");

      // Check if already exists
      const existing = db
        .select()
        .from(schema.companyPortals)
        .where(eq(schema.companyPortals.normalizedName, normalizedName))
        .get();

      if (existing) {
        skipped++;
        continue;
      }

      const careersUrl = `https://boards.greenhouse.io/${portal.slug}`;
      const apiEndpoint = `https://boards-api.greenhouse.io/v1/boards/${portal.slug}/jobs`;

      db.insert(schema.companyPortals)
        .values({
          companyName: portal.companyName,
          normalizedName,
          careersUrl,
          apiEndpoint,
          scanMethod: portal.scanMethod,
          category: portal.category,
        })
        .run();

      added++;
    }

    return NextResponse.json({
      success: true,
      added,
      skipped,
      total: DEFAULT_PORTALS.length,
    });
  } catch (error) {
    console.error("Seed portals error:", error);
    return NextResponse.json({ error: "Failed to seed portals" }, { status: 500 });
  }
}
