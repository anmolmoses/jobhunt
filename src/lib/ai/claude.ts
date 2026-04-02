import Anthropic from "@anthropic-ai/sdk";
import { getSetting } from "@/lib/settings";
import type { AIProvider, AICompleteOptions } from "@/types/ai";

const DEFAULT_MODEL = "claude-sonnet-4-6";

export class ClaudeProvider implements AIProvider {
  readonly name = "claude" as const;

  async complete(options: AICompleteOptions): Promise<string> {
    const apiKey = await getSetting("anthropic_api_key");
    if (!apiKey) throw new Error("Anthropic API key not configured");

    const savedModel = await getSetting("claude_model");
    const model = savedModel || DEFAULT_MODEL;
    const client = new Anthropic({ apiKey });

    const systemMessage = options.messages.find((m) => m.role === "system");
    const userMessages = options.messages.filter((m) => m.role !== "system");

    const response = await client.messages.create({
      model,
      max_tokens: options.maxTokens || 4096,
      temperature: options.temperature ?? 0.3,
      system: systemMessage?.content || "",
      messages: userMessages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    });

    const textBlock = response.content.find((b) => b.type === "text");
    return textBlock?.text || "";
  }

  async isConfigured(): Promise<boolean> {
    const key = await getSetting("anthropic_api_key");
    return !!key;
  }
}
