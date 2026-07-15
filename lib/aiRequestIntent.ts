export function isAgentRequest(value: string) {
  const text = value.toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, ' ').trim();
  if (!text) return false;

  if (/\b(?:do not|don't|dont|never|not asking (?:you )?to|i am not asking (?:you )?to|i'm not asking (?:you )?to)\b.{0,32}\b(?:add|apply|change|delete|edit|log|record|remove|save|set|update)\b/.test(text)) {
    return false;
  }

  if (/\b(how (?:can|do|would) (?:i|you)|what (?:can|would) you|could you explain|can you imagine|should i|do you recommend|would it help|what if)\b/.test(text)) {
    return false;
  }

  if (/^(?:yes[,.! ]*)?(?:do it|do that|go ahead|apply (?:it|that|those)|make (?:it|that) happen|proceed|yes please)\b/.test(text)) {
    return true;
  }

  if (/\b(?:take|bring) me to\b|\bgo to (?:the )?\b/.test(text)) return true;
  if (/\b(?:i|we) (?:did|completed|finished|performed)\b/.test(text)) return true;
  if (/\b(?:pain|energy|mood|sleep quality)\b\s*(?:is|was|at|=)\s*\d+(?:\.\d+)?\b|\bi slept\s+\d+(?:\.\d+)?\s*(?:hours?|hrs?)?\b/.test(text)) return true;
  if (/\b(?:ask|remind me to ask)\s+(?:my )?(?:doctor|pt|provider)\b/.test(text)) return true;
  if (/\b(?:i (?:have|had)|there(?:'s| is)|my)?\s*(?:a\s+)?(?:pt|physical therapy|training)(?: session| appointment)?\b.{0,32}\b(?:today|tomorrow|on\s+(?:mon|tue|wed|thu|fri|sat|sun)|\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2})\b/.test(text)) return true;
  if (/\b\d+\s*sets?\b.{0,24}\b(?:of\s+)?\d+\s*reps?\b|\b\d+\s*sets?\s+of\s+\d+\b/.test(text)) return true;

  return /\b(?:add|append|apply|attach|change|check|clear|complete|create|delete|disable|done|edit|enable|finished|hide|log|mark|move|note|open|pin|put|record|remove|rename|replace|reorder|save|schedule|set|show|track|turn on|turn off|uncheck|update)\b/.test(text);
}

export function isExerciseCompletionCoverageRequest(value: string) {
  const text = value.toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, ' ').trim();
  if (!/\b(?:exercise|exercises|movement|movements|stretch|stretches|workout)\b/.test(text)) return false;
  return /\b(?:did not|didn't|didnt|not do|not done|not complete|not completed|never did|never completed|missed|skip(?:ped)?|unchecked|wasn't done|weren't done|was not done|were not done)\b/.test(text)
    || /\bwhat\b.{0,32}\b(?:haven't|have not)\b.{0,24}\b(?:done|completed)\b/.test(text);
}

export function isHistoryCorrectionFollowUp(value: string) {
  const text = value.toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, ' ').trim();
  return /^(?:no[,!. ]+)?(?:look|check|search|try) (?:again|harder|more carefully)\b/.test(text)
    || /\b(?:that(?:'s| is) not true|that's wrong|that is wrong|you(?:'re| are) missing|why can(?:'t| not) you see|check the actual records|look at the actual records|i did plenty|i logged plenty)\b/.test(text);
}

export function isHistoryScopeFollowUp(value: string) {
  const text = value.toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, ' ').trim();
  if (isHistoryCorrectionFollowUp(text)) return true;
  if (/\b(?:that|those|them|same|above|previous answer|period|date range|time range)\b/.test(text)) return true;
  return /^(?:and|also|what about|how about)\b.{0,64}$/.test(text);
}

export function isVisualizationRequest(value: string) {
  return /\b(?:visuali[sz]e|visualization|graph|graphs|chart|charts|plot|plots|table|trend line|bar graph|line graph)\b/i.test(value);
}

export function isWholeHistoryComparisonRequest(value: string) {
  const text = value.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!text) return false;

  const historyScope = /\b(?:days?|sessions?|history|timeline|logs?|records?|entries|check-?ins?|tracked data|saved data)\b/;
  const exhaustiveMarker = /\b(?:all|every|each|entire|full|complete|whole|overall|all[- ]time|lifetime|everything)\b/;
  const exhaustiveAction = /\b(?:analy[sz]e|base|compare|consider|go through|include|look (?:back )?(?:at|through)|review|scan|take|use)\b/;
  const scopeAndMarker = (historyScope.test(text) && exhaustiveMarker.test(text));
  const actionAndMarker = exhaustiveAction.test(text) && exhaustiveMarker.test(text);
  const fromTheBeginning = /\b(?:from (?:the )?(?:very )?(?:start|beginning)|since (?:i|we) (?:started|began)|since (?:i|we)(?:'ve| have) been (?:logging|recording|tracking)|for as long as (?:i|we)(?:'ve| have) been (?:logging|recording|tracking))\b/.test(text)
    && (historyScope.test(text) || /\b(?:logging|logged|recording|recorded|tracking|tracked)\b/.test(text));
  const everythingLogged = /\beverything\b.{0,48}\b(?:i|we|you)(?:'ve| have)?\s*(?:logged|saved|recorded|tracked|have)\b/.test(text)
    || /\b(?:all|every|each)\b.{0,32}\b(?:logged|saved|recorded|tracked)\b/.test(text);
  const explicitlyNotPartial = /\b(?:not (?:just|only) (?:the )?(?:recent|latest|top|selected|candidate)|without (?:leaving|missing|skipping|excluding) (?:anything|any|a single)|leave nothing out|do not leave anything out)\b/.test(text);
  const allOfThem = /\b(?:compare|consider|include|review|scan|use)\b.{0,32}\b(?:all of (?:it|them|those)|them all)\b/.test(text);
  const globalSuperlative = /\b(?:best|worst|strongest|weakest|easiest|hardest|most positive|most difficult)\b.{0,40}\b(?:day|session|log|entry)\b/.test(text)
    || /\b(?:day|session|log|entry)\b.{0,40}\b(?:best|worst|strongest|weakest|easiest|hardest|most positive|most difficult)\b/.test(text)
    || /\b(?:best|worst|strongest|weakest|easiest|hardest)\b.{0,24}\b(?:ever|of all time)\b/.test(text);

  return scopeAndMarker || actionAndMarker || fromTheBeginning || everythingLogged || explicitlyNotPartial || allOfThem || globalSuperlative;
}
