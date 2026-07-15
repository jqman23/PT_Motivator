const ASSISTANT_PROMPT_START = /^(?:what|when|where|why|how|which|who|whom|whose|do|does|did|is|are|am|was|were|can|could|would|should|will|have|has|had|tell me|describe|explain|clarify|rate|choose|select|share|provide|please)\b/i;

export function normalizeAiReplyOptions(value: unknown, limit = 4) {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const options: string[] = [];

  for (const item of value) {
    const option = String(item ?? '').replace(/\s+/g, ' ').trim().slice(0, 170);
    const key = option.toLowerCase();
    if (!option || option.includes('?') || ASSISTANT_PROMPT_START.test(option) || seen.has(key)) continue;
    seen.add(key);
    options.push(option);
    if (options.length >= limit) break;
  }

  return options;
}
