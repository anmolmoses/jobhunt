import { getAIProvider, getSetting } from "@/lib/settings";
import { ClaudeProvider } from "./claude";
import { OpenAIProvider } from "./openai";
import type { AIProvider } from "@/types/ai";

export async function createAIProvider(): Promise<AIProvider> {
  const providerName = await getAIProvider();

  // Try the user's preferred provider first
  if (providerName === "openai") {
    const openai = new OpenAIProvider();
    if (await openai.isConfigured()) return openai;
    // Fall back to Claude if OpenAI isn't configured
    const claude = new ClaudeProvider();
    if (await claude.isConfigured()) return claude;
    throw new Error("No AI provider configured. Add an API key in Settings.");
  }

  // Default: try Claude first, fall back to OpenAI
  const claude = new ClaudeProvider();
  if (await claude.isConfigured()) return claude;

  const openai = new OpenAIProvider();
  if (await openai.isConfigured()) return openai;

  throw new Error("No AI provider configured. Add an API key in Settings.");
}
