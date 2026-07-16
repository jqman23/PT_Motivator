function hasPersistentCommandAlongsideVisual(value: string) {
  const mutation = /\b(?:add|append|apply|attach|book|cancel|change|check|clear|complete|create|customize|delete|disable|draft|edit|enable|get rid of|hide|log|mark|move|open|pin|record|remove|rename|replace|reorder|save|schedule|set|track|turn on|turn off|uncheck|update|write)\b/;
  const target = /\b(?:app|application|screen|page|setting|widget|title|note|log|record|entry|metric|field|value|exercise|workout|session|appointment|photo|picture|image|category|timer|calendar|summary|pain|energy|mood|sleep|it|this|that|those|them)\b/;
  return value
    .split(/\s*(?:[,;]|\b(?:and then|and|then|also|plus)\b)\s*/)
    .some(clause => clause
      && !isVisualizationRequest(clause)
      && mutation.test(clause)
      && target.test(clause));
}

export function isAgentRequest(value: string) {
  const text = value.toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, ' ').trim();
  if (!text) return false;

  if (isExistingPhotoInspectionRequest(text)) return false;

  // A generated visual is a chat response, not a persistent app mutation. Verbs
  // such as “make” and “create” must not turn charts or tables into Apply cards.
  if (isVisualizationRequest(text) && !hasPersistentCommandAlongsideVisual(text)) return false;

  if (/\b(?:do not|don't|dont|never|not asking (?:you )?to|i am not asking (?:you )?to|i'm not asking (?:you )?to)\b.{0,32}\b(?:add|apply|change|delete|edit|log|record|remove|save|set|update)\b/.test(text)) {
    return false;
  }

  // Read/write is a high-level contract, not a bag-of-verbs classification. Words
  // such as “put”, “load”, “change”, and “note” occur constantly in symptom
  // narratives and questions about existing data. They are not app mutations unless
  // the user actually directs the assistant to persist, navigate, or change something.
  const asksForAdviceOrInterpretation = /\b(?:advice|advise|recommendations?|what do you recommend|treatment options?|interpret|assessment|opinion|what do you think|is it normal|does this sound|should i|help me understand|describe my)\b/.test(text);
  const asksAboutAssistantBehavior = /^(?:why (?:did|do|would|are|were|can|can't|cannot) (?:you|the (?:ai|assistant|app))|what do you mean|i(?:'m| am) asking (?:you )?for|answer (?:me|my question)|just answer)\b/.test(text)
    || /\b(?:why (?:are|were) you asking|why (?:do|did) you need|doctor[- ]?note id|review card)\b/.test(text);
  const doctorResponseCommand = isDoctorNoteResponseCommand(text);
  const explicitlyPersistsAdvice = /^(?:please\s+)?(?:add|append|record|save|write|put)\b.{0,100}\b(?:note|log|record|entry)\b/.test(text);
  if ((asksForAdviceOrInterpretation && !explicitlyPersistsAdvice) || (asksAboutAssistantBehavior && !doctorResponseCommand)) {
    return false;
  }

  if (/\b(?:worried|worry|concerned|concern|nervous|scared|afraid|anxious|can you help|help me|reassure|positive)\b/.test(text)) {
    return false;
  }

  if (/\b(how (?:can|do|would) (?:i|you)|what (?:can|would) you|what should i|(?:could|can) you explain|can you imagine|should i|do you recommend|would it help|what if|what would happen)\b/.test(text)) {
    return false;
  }

  if (/^(?:yes[,.! ]*)?(?:do it|do that|go ahead|apply (?:it|that|those)|make (?:it|that) happen|proceed|yes please)\b/.test(text)) {
    return true;
  }

  // Doctor-note responses are persistent app edits even though people naturally
  // say "answer" or "respond" instead of "append". The visible note title/topic
  // is the target; an internal note ID is never user input.
  if (doctorResponseCommand) return true;
  if (/\bjust\s+(?:create|add|make|save|update)\b.{0,60}\b(?:the\s+)?(?:doc(?:tor)?\s+)?note\b/.test(text)) return true;

  if (/\b(?:take|bring) me to\b|\bgo to (?:the )?\b/.test(text)) return true;
  if (/\b(?:i|we) (?:did|completed|finished|performed)\b/.test(text)) return true;
  if (/\b(?:is|was)\s+(?:done|complete|completed)\b/.test(text)
    && /\b(?:today|yesterday|tomorrow)\b|\b\d+\s*[x×]\s*\d+\b|\bnote\b/.test(text)) return true;
  if (/\b(?:pain|energy|mood|sleep quality)\b\s*(?:is|was|at|=)\s*\d+(?:\.\d+)?\b|\bi slept\s+\d+(?:\.\d+)?\s*(?:hours?|hrs?)?\b/.test(text)) return true;
  if (/\b(?:pain|energy|mood)\s+\d+(?:\.\d+)?\b/.test(text)) return true;
  if (/\b(?:ask|remind me to ask)\s+(?:my )?(?:doctor|pt|provider)\b/.test(text)) return true;
  if (/\b(?:i (?:have|had)|there(?:'s| is)|my)?\s*(?:a\s+)?(?:pt|physical therapy|training)(?: session| appointment)?\b.{0,32}\b(?:today|tomorrow|on\s+(?:mon|tue|wed|thu|fri|sat|sun)|\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2})\b/.test(text)) return true;
  if (/\b\d+\s*sets?\b.{0,24}\b(?:of\s+)?\d+\s*reps?\b|\b\d+\s*sets?\s+of\s+\d+\b/.test(text)) return true;
  if (/\b(?:timer|calendar|daily summary|doctor notes?|ask ai|exercise library)\b.{0,18}\b(?:on|off|hidden|shown|visible|disabled|enabled)\b/.test(text)) return true;
  if (/\b(?:timer|calendar|daily summary|doctor notes?|ask ai|exercise library)\b.{0,24}\b(?:gone|away|back|available)\b/.test(text)) return true;
  if (/\b(?:no|without)\s+(?:the\s+)?(?:timer|calendar|daily summary|doctor notes?|ask ai|exercise library)(?:\s+(?:please|anymore|on (?:the )?(?:home|main) screen))?[.!]*$/.test(text)) return true;
  if (/\b(?:call|name)\s+(?:the\s+)?app\b.{0,48}\b|\b(?:app|application)\s+title\s+(?:should|needs? to|has to)\s+be\b/.test(text)) return true;
  if (/\b(?:there should be|put down|book me for)\b.{0,40}\b(?:pt|physical therapy|training)(?: session| appointment)?\b/.test(text)) return true;
  if (/^(?:please\s+)?put\b.{0,80}\b(?:in|into|on|under)\b.{0,40}\b(?:note|log|record|entry)\b/.test(text)) return true;
  if (/\bcan i\b.{0,32}\b(?:send|upload|choose)\b.{0,32}\b(?:photo|picture|image|screenshot)\b.{0,48}\battach\b/.test(text)) return true;

  const mutationVerb = '(?:add|append|apply|attach|book|cancel|change|check|clear|complete|create|customize|delete|disable|draft|edit|enable|get rid of|hide|log|mark|move|open|pin|record|remove|rename|replace|reorder|save|schedule|set|track|turn on|turn off|uncheck|update|write)';
  const appTarget = '(?:app|application|screen|page|setting|widget|title|note|log|record|entry|metric|field|value|exercise|workout|session|appointment|photo|picture|image|category|timer|calendar|summary|pain|energy|mood|sleep|it|this|that|those|them)';
  const directCommand = new RegExp(`(?:^(?:please\\s+)?${mutationVerb}\\b|^${mutationVerb}\\b|\\b(?:can|could|would|will) you(?: please)?\\s+${mutationVerb}\\b|\\b(?:i want|i need|i would like|i'd like)(?: you)?(?: to)?\\s+${mutationVerb}\\b|\\b(?:and|then|also)\\s+(?:you\\s+)?${mutationVerb}\\b)`);
  const namesAnAppTarget = new RegExp(`\\b${appTarget}\\b`).test(text);

  // Direct “add/create X” commands are meaningful in an app even when X is a
  // user-defined entity the classifier has never seen. Everything else needs a
  // persistent target so physical-world statements do not become Apply cards.
  if (directCommand.test(text) && (namesAnAppTarget || /^(?:please\s+)?(?:add|create)\s+(?!up\b)\S+/.test(text))) return true;

  return false;
}

export function isDoctorNoteResponseCommand(value: string) {
  const text = value.toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, ' ').trim();
  return /\b(?:answer|respond|reply)\b.{0,100}\b(?:doc(?:tor)?(?:'s)?\s+(?:note|question)|medical note)\b/.test(text)
    || /\b(?:doc(?:tor)?(?:'s)?\s+(?:note|question)|medical note)\b.{0,100}\b(?:answer|respond|reply)\b/.test(text);
}

export function isBulkNoteAgentRequest(value: string) {
  const text = value.toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, ' ').trim();
  if (!text || isDoctorNoteResponseCommand(text)) return false;
  return /\b(?:anytime|every time|whenever|all days|across)\b/i.test(text)
    || /\bwhere\b.{0,80}\bnotes?\b/i.test(text)
    || /\bnotes?\b.{0,48}\b(?:contain|mention|include)\b/i.test(text);
}

export function prefersChronologicalHistoryAnswer(value: string) {
  const text = value.toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, ' ').trim();
  if (!text) return false;
  if (/\b(?:recent|latest|most recent|newest|last)\b/.test(text)) return false;
  return /\bwhen have i\b|\bwhen did i\b|\bmain episodes?\b|\bepisode(?:s)?\b|\btimeline\b|\bchronolog(?:ical|ically|y)\b|\bearliest to latest\b|\boldest to newest\b/.test(text);
}

export function isExistingPhotoInspectionRequest(value: string) {
  const text = value.toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, ' ').trim();
  if (!/\b(?:photo|picture|image|screenshot|attachment|attached it|uploaded it)\b/.test(text)) return false;
  if (/\b(?:(?:don't|dont|do not|not)\s+want\s+to\s+upload|without\s+uploading|upload\s+it\s+again|upload\s+(?:the\s+)?(?:photo|picture|image|screenshot)\s+again)\b/.test(text)) return true;
  if (/\b(?:attach|add|choose|upload|send)\b.{0,28}\b(?:photo|picture|image|screenshot)\b|\b(?:photo|picture|image|screenshot)\b.{0,28}\b(?:attach|add|choose|upload|send)\b/.test(text)) return false;
  return /\b(?:can you see|do you see|look at|look over|inspect|analy[sz]e|what.*see|anything about|already attached|already uploaded|don't want to upload|dont want to upload|do not want to upload|not want to upload|without uploading again)\b/.test(text);
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
  if (/^(?:that|those|them|it)\b/.test(text)) return true;
  if (/^(?:visuali[sz]e|chart|graph|plot|tabulate|show|display|do|apply|use)\b.{0,48}\b(?:that|those|them|it)\b/.test(text)) return true;
  if (/\b(?:same|above|previous answer|same period|same date range|same time range)\b/.test(text)) return true;
  return /^(?:and|also|what about|how about)\b.{0,64}$/.test(text);
}

export function isVisualizationRequest(value: string) {
  return /\b(?:visuals?|visuali[sz]e|visualization|graph|graphs|chart|charts|plot|plots|table|trend line|bar graph|line graph)\b/i.test(value);
}

export function isSemanticTextAggregateRequest(value: string) {
  const text = value.toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, ' ').trim();
  if (!text) return false;
  const aggregateLanguage = /\b(?:frequency|frequencies|how often|how many times|number of times|tally|tallies)\b/.test(text)
    || /\b(?:count|counts|counted|counting|breakdown|distribution)\b.{0,64}\b(?:mention|mentions|mentioned|talk|talked|write|wrote|written|note|noted|occur|occurred|appear|appeared|phrase|phrases|term|terms|word|words|reference|references)\b/.test(text)
    || /\b(?:mention|mentions|mentioned|talk|talked|write|wrote|written|note|noted|occur|occurred|appear|appeared)\b.{0,48}\b(?:each|every|per|frequency|frequencies|count|counts|how much)\b/.test(text);
  return aggregateLanguage;
}

export function isWholeHistoryComparisonRequest(value: string) {
  const text = value.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!text) return false;

  // "Hyperlink every date you discuss" constrains the output artifact, not the
  // evidence scope. Remove citation/navigation modifiers before detecting an
  // exhaustive history request so a targeted symptom search stays targeted.
  const scopeText = text
    .replace(/\b(?:hyperlink|link|cite|make clickable|keep clickable)\s+(?:each|every|all)\s+(?:date|day)(?:s)?(?:\s+(?:you|that you)\s+(?:discuss|mention|use|cite|reference))?/g, ' ')
    .replace(/\b(?:preserve|include|show)\s+(?:a\s+)?(?:link|hyperlink)\s+for\s+(?:each|every|all)\s+(?:date|day)(?:s)?/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const historyScope = /\b(?:days?|sessions?|history|timeline|logs?|records?|entries|check-?ins?|tracked data|saved data)\b/;
  const exhaustiveMarker = /\b(?:all|every|each|entire|full|whole|overall|all[- ]time|lifetime|everything)\b/;
  const exhaustiveAction = /\b(?:analy[sz]e|base|compare|consider|go through|include|look (?:back )?(?:at|through)|review|scan|take|use)\b/;
  const analyticalOperation = /\b(?:analy[sz](?:e|ed|ing)?|chart(?:ed|ing|s)?|compar(?:e|ed|ing|ison)|correlat(?:e|ed|ing|ion)|graph(?:ed|ing|s)?|map(?:ped|ping)?|pattern|plot(?:ted|ting|s)?|summari[sz](?:e|ed|ing)?|table|trend|visuali[sz](?:e|ed|ing|ation|ations)?)\b/;
  const negatesExhaustiveScope = /\b(?:do not|don't|dont|not)\b.{0,20}\b(?:all|every|each|entire|full|whole|everything)\b/.test(scopeText);
  const narrowsToPartialScope = /\b(?:just|only)\b.{0,20}\b(?:recent|latest|last|selected|some|top)\b/.test(scopeText)
    && !/\b(?:do not|don't|dont|not)\s+(?:just|only)\b/.test(scopeText);
  const rejectsExhaustiveScope = negatesExhaustiveScope || narrowsToPartialScope;
  const explicitlyCompleteHistory = /\bcomplete\s+(?:(?:saved|tracked|available)\s+)?(?:history|timeline|logs?|records?|entries|check-?ins?|data)\b/.test(scopeText);
  const scopeAndMarker = !rejectsExhaustiveScope && ((historyScope.test(scopeText) && exhaustiveMarker.test(scopeText)) || explicitlyCompleteHistory);
  const actionAndMarker = !rejectsExhaustiveScope && exhaustiveAction.test(scopeText) && exhaustiveMarker.test(scopeText);
  // Exhaustive scope belongs to the analytical operation, regardless of which app
  // dimension follows it. Retrieval ranking must not silently narrow a requested visual.
  const exhaustiveAnalysis = !rejectsExhaustiveScope
    && analyticalOperation.test(scopeText)
    && (exhaustiveMarker.test(scopeText) || /\bcomplete\b/.test(scopeText));
  const fromTheBeginning = /\b(?:from (?:the )?(?:very )?(?:start|beginning)|since (?:i|we) (?:started|began)|since (?:i|we)(?:'ve| have) been (?:logging|recording|tracking)|for as long as (?:i|we)(?:'ve| have) been (?:logging|recording|tracking))\b/.test(scopeText)
    && (historyScope.test(scopeText) || /\b(?:logging|logged|recording|recorded|tracking|tracked)\b/.test(scopeText));
  const everythingLogged = /\beverything\b.{0,48}\b(?:i|we|you)(?:'ve| have)?\s*(?:logged|saved|recorded|tracked|have)\b/.test(scopeText)
    || /\b(?:all|every|each)\b.{0,32}\b(?:logged|saved|recorded|tracked)\b/.test(scopeText);
  const explicitlyNotPartial = /\b(?:not (?:just|only) (?:the )?(?:recent|latest|top|selected|candidate)|without (?:leaving|missing|skipping|excluding) (?:anything|any|a single)|leave nothing out|do not leave anything out)\b/.test(scopeText);
  const allOfThem = /\b(?:compare|consider|include|review|scan|use)\b.{0,32}\b(?:all of (?:it|them|those)|them all)\b/.test(scopeText);
  const semanticTextAggregate = isSemanticTextAggregateRequest(text);
  const globalSuperlative = /\b(?:best|worst|strongest|weakest|easiest|hardest|most positive|most difficult)\b.{0,40}\b(?:day|session|log|entry)\b/.test(scopeText)
    || /\b(?:day|session|log|entry)\b.{0,40}\b(?:best|worst|strongest|weakest|easiest|hardest|most positive|most difficult)\b/.test(scopeText)
    || /\b(?:best|worst|strongest|weakest|easiest|hardest)\b.{0,24}\b(?:ever|of all time)\b/.test(scopeText);

  return scopeAndMarker || actionAndMarker || exhaustiveAnalysis || semanticTextAggregate || fromTheBeginning || everythingLogged || explicitlyNotPartial || allOfThem || globalSuperlative;
}

export function isHistorySummaryRequest(value: string) {
  const text = value.toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, ' ').trim();
  if (!text) return false;

  if (isSemanticTextAggregateRequest(text) || isWholeHistoryComparisonRequest(text)) return true;

  return /\b(?:what stood out|stood out|caught your attention|what caught your attention|what did you notice|what do you notice|what was notable|what's notable|main takeaways?|key takeaways?|highlights?|overview|summary|summarize|recap|what changed|what was different|how was (?:my|the|this|that)\s+(?:week|day|session)|how did (?:my|the|this|that)\s+(?:week|day|session)\s+go|what happened|what went on|anything (?:stand out|interesting|notable)|give me an overview)\b/.test(text);
}
