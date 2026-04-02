import { NextRequest, NextResponse } from "next/server";
import { getSetting } from "@/lib/settings";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

export async function POST(request: NextRequest) {
  try {
    const { provider } = await request.json();

    if (provider === "claude") {
      const apiKey = await getSetting("anthropic_api_key");
      if (!apiKey) {
        return NextResponse.json({ success: false, error: "No Anthropic API key configured" });
      }
      const client = new Anthropic({ apiKey });
      await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 10,
        messages: [{ role: "user", content: "Say hi" }],
      });
      return NextResponse.json({ success: true });
    }

    if (provider === "openai") {
      const apiKey = await getSetting("openai_api_key");
      if (!apiKey) {
        return NextResponse.json({ success: false, error: "No OpenAI API key configured" });
      }
      const client = new OpenAI({ apiKey });
      await client.chat.completions.create({
        model: "gpt-4o",
        max_tokens: 10,
        messages: [{ role: "user", content: "Say hi" }],
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: "Unknown provider" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Connection failed";
    return NextResponse.json({ success: false, error: message });
  }
}
