import OpenAI from "openai";
import { getSetting } from "@/lib/settings";
import type { AIProvider, AICompleteOptions } from "@/types/ai";

const DEFAULT_MODEL = "gpt-4o";

// Reasoning models don't support temperature, top_p
const REASONING_MODELS = ["o3", "o3-mini", "o4-mini", "o1", "o1-mini"];

// GPT-5+ models also don't support temperature
const NO_TEMPERATURE_MODELS = [...REASONING_MODELS, "gpt-5", "gpt-5.4"];

function isReasoningModel(model: string): boolean {
  return REASONING_MODELS.some((m) => model.startsWith(m));
}

function supportsTemperature(model: string): boolean {
  return !NO_TEMPERATURE_MODELS.some((m) => model.startsWith(m));
}

export class OpenAIProvider implements AIProvider {
  readonly name = "openai" as const;

  async complete(options: AICompleteOptions): Promise<string> {
    const apiKey = await getSetting("openai_api_key");
    if (!apiKey) throw new Error("OpenAI API key not configured");

    const savedModel = await getSetting("openai_model");
    const model = savedModel || DEFAULT_MODEL;
    const client = new OpenAI({ apiKey });

    const isReasoning = isReasoningModel(model);
    const hasTemperature = supportsTemperature(model);

    // Build request params
    const params: Record<string, unknown> = {
      model,
      messages: options.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      // All current OpenAI models use max_completion_tokens (max_tokens is deprecated)
      max_completion_tokens: options.maxTokens || 4096,
    };

    // Temperature only for models that support it
    if (hasTemperature) {
      params.temperature = options.temperature ?? 0.3;
    }

    // JSON mode for models that support response_format
    if (options.responseFormat === "json" && !isReasoning) {
      params.response_format = { type: "json_object" };
    }

    const response = await client.chat.completions.create(
      params as unknown as OpenAI.ChatCompletionCreateParamsNonStreaming
    );
    return response.choices[0]?.message?.content || "";
  }

  async isConfigured(): Promise<boolean> {
    const key = await getSetting("openai_api_key");
    return !!key;
  }
}
