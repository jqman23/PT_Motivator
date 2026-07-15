export function isAgentRequest(value: string) {
  const text = value.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!text) return false;

  if (/\b(how (?:can|do|would) (?:i|you)|what (?:can|would) you|could you explain|can you imagine|should i|do you recommend|would it help|what if)\b/.test(text)) {
    return false;
  }

  if (/^(?:yes[,.! ]*)?(?:do it|do that|go ahead|apply (?:it|that|those)|make (?:it|that) happen|proceed|yes please)\b/.test(text)) {
    return true;
  }

  if (/\b(?:take|bring) me to\b|\bgo to (?:the )?\b/.test(text)) return true;
  if (/\b(?:i|we) (?:did|completed|finished|performed)\b/.test(text)) return true;

  return /\b(?:add|append|apply|attach|change|check|clear|complete|create|delete|disable|edit|enable|hide|log|mark|move|note|open|pin|put|record|remove|rename|replace|reorder|save|schedule|set|show|track|turn on|turn off|uncheck|update)\b/.test(text);
}

export function isWholeHistoryComparisonRequest(value: string) {
  const text = value.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!text) return false;

  const wholeScope = /\b(?:all|every|entire|whole|overall|across)\b.{0,48}\b(?:days?|sessions?|history|logs?|records?|entries)\b/.test(text)
    || /\b(?:days?|sessions?|history|logs?|records?|entries)\b.{0,48}\b(?:all|every|entire|whole|overall|across)\b/.test(text);
  const globalSuperlative = /\b(?:best|worst|strongest|weakest|easiest|hardest|most positive|most difficult)\b.{0,32}\b(?:day|session|log|entry)\b/.test(text)
    || /\b(?:day|session|log|entry)\b.{0,32}\b(?:best|worst|strongest|weakest|easiest|hardest|most positive|most difficult)\b/.test(text);

  return wholeScope || globalSuperlative;
}
