/**
 * Attempt to repair truncated JSON from AI responses.
 * Handles: markdown code fences, unterminated strings, unclosed arrays/objects.
 */
export function repairJson(str: string): string {
  let s = str.trim();

  // Strip markdown code fences
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  // If it already parses, return as-is
  try {
    JSON.parse(s);
    return s;
  } catch {
    // Continue to repair
  }

  // Close unterminated strings
  const quoteCount = (s.match(/(?<!\\)"/g) || []).length;
  if (quoteCount % 2 !== 0) {
    s += '"';
  }

  // Count open/close brackets
  const opens = { "{": 0, "[": 0 };
  const closes: Record<string, keyof typeof opens> = { "}": "{", "]": "[" };
  let inString = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"' && (i === 0 || s[i - 1] !== "\\")) {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{" || ch === "[") opens[ch]++;
    if (ch === "}" || ch === "]") opens[closes[ch]]--;
  }

  // Remove trailing comma before closing
  s = s.replace(/,\s*$/, "");

  // Close remaining open brackets
  for (let i = 0; i < opens["["]; i++) s += "]";
  for (let i = 0; i < opens["{"]; i++) s += "}";

  return s;
}

/**
 * Parse JSON from AI response with repair fallback.
 */
export function parseAiJson<T = unknown>(raw: string): T {
  const repaired = repairJson(raw);
  return JSON.parse(repaired);
}
