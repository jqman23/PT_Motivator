// @ts-expect-error Node's type-stripping test runner requires the explicit extension.
import { isHistoryCorrectionFollowUp, isHistoryScopeFollowUp, isSemanticTextAggregateRequest, isVisualizationRequest, isWholeHistoryComparisonRequest } from './aiRequestIntent.ts';

export type AnalysisConversationMessage = {
  role: 'user' | 'assistant';
  content: string;
  aiInstructions?: string[];
  artifacts?: string;
};

export type ResolvedAnalysisRequest = {
  effectiveQuestion: string;
  visualization: boolean;
  semanticTextAggregate: boolean;
  wholeHistory: boolean;
  inheritedGoal: boolean;
  anchorQuestion?: string;
  requestedCategoryCount?: number;
};

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20,
};

function clean(value: unknown, limit = 2400) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function messageIntentText(message: AnalysisConversationMessage) {
  return clean([message.content, ...(message.aiInstructions ?? [])].filter(Boolean).join(' '), 3200);
}

function hasAnalyticalSubject(value: string) {
  const text = clean(value).toLowerCase();
  if (!text) return false;
  if (isSemanticTextAggregateRequest(text) || isWholeHistoryComparisonRequest(text)) return true;
  return /\b(?:compare|correlat|count|frequency|how often|how many|pattern|relationship|distribution|breakdown|average|highest|lowest|most|least|across|over time|history|records?|logs?|notes?)\b/.test(text)
    && !/^(?:i want|show|give|make|create|display|output|please|can you|could you|you didn't|you did not|still|that(?:'s| is)|this is)\b.{0,35}\b(?:table|chart|graph|visuali[sz]ation|visual)\b[.! ]*$/.test(text);
}

function asksAboutAssistantBehavior(value: string) {
  const text = clean(value).toLowerCase();
  return /^(?:why (?:did|do|would|are|were|can|can't|cannot) (?:you|the (?:ai|assistant|app))|what do you mean|what are you talking about)\b/.test(text)
    || /\b(?:why (?:are|were) you asking|why (?:do|did) you need|your (?:answer|response)|doctor[- ]?note id|review card)\b/.test(text);
}

function hasConversationGoal(value: string) {
  const text = clean(value).toLowerCase();
  if (!text || asksAboutAssistantBehavior(text)) return false;
  if (hasAnalyticalSubject(text) || isVisualizationRequest(text)) return true;
  return /^(?:what|how|when|where|which|why|can|could|would|will|do|does|did|is|are|should)\b/.test(text)
    || /\b(?:advice|advise|recommendations?|recommend|help me|tell me|describe|interpret|explain|assess|review|summari[sz]e)\b/.test(text);
}

function isArtifactOnlyRequest(value: string) {
  const text = clean(value).toLowerCase();
  if (!isVisualizationRequest(text)) return false;
  const withoutArtifactWords = text
    .replace(/\b(?:table|chart|graph|visuali[sz]ation|visual|plot|line|bar|output|show|give|make|create|display|want|asked|request(?:ed)?|please|actually|still|anything|something|nothing|didn'?t|did not|not)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return withoutArtifactWords.split(/\s+/).filter(Boolean).length <= 4;
}

function isDependentFollowUp(value: string) {
  const text = clean(value).toLowerCase();
  if (!text) return false;
  if (/^(?:look at|use|check|search|analy[sz]e)?\s*(?:the\s+)?(?:whole|full|entire|complete|all)\s+(?:range|history|records?|data|timeline)[.! ]*$/.test(text)) return true;
  if (/^(?:(?:double|triple)[ -]?)?(?:check|verify|validate|recheck|recount|recalculate)(?:\s+(?:it|that|this|again|carefully|accurately))?[.! ]*$/.test(text)) return true;
  if (/^(?:use|apply)\s+(?:ai|the ai|your (?:reasoning|judgment|brain)|semantic (?:reasoning|interpretation))(?:\s+to\s+(?:interpret|analy[sz]e|check|verify)(?:\s+(?:it|that|this))?)?[.! ]*$/.test(text)) return true;
  if (isHistoryCorrectionFollowUp(text) || isHistoryScopeFollowUp(text) || isArtifactOnlyRequest(text)) return true;
  if (/^(?:still|again|no|wrong|that(?:'s| is)|this(?: is)?|those|it|them|what are you|you (?:didn'?t|did not|haven't|have not)|i asked|i(?:'m| am) asking|look harder|try again|do what i asked|answer (?:me|my question)|just answer)\b/.test(text)) return true;
  return asksAboutAssistantBehavior(text)
    || /\b(?:previous|same|instead|what i asked|what are you talking about|not the (?:table|chart|graph|visual)|didn'?t output|nothing (?:showed|appeared)|no (?:table|chart|graph|visual))\b/.test(text);
}

function conversationAnchor(messages: AnalysisConversationMessage[]) {
  for (const message of [...messages].reverse()) {
    if (message.role !== 'user') continue;
    const text = messageIntentText(message);
    if (!text) continue;
    if (asksAboutAssistantBehavior(text)) continue;
    // A complete request remains a valid anchor even when its natural wording also
    // contains referential words. Goal evidence is stronger than the broad
    // dependent-follow-up heuristic.
    if (isDependentFollowUp(text)) {
      if (hasAnalyticalSubject(text)) return text;
      continue;
    }
    if (hasConversationGoal(text) && !asksAboutAssistantBehavior(text)) return text;
  }
  for (const message of [...messages].reverse()) {
    if (message.role !== 'assistant') continue;
    const artifact = clean(message.artifacts, 6000);
    const resolved = artifact.match(/Resolved analytical goal:\s*([\s\S]*?)(?=Previous artifact:|$)/i)?.[1];
    if (resolved && hasAnalyticalSubject(resolved)) return clean(resolved, 3200);
  }
  return '';
}

export function requestedCategoryCount(value: string) {
  const text = clean(value).toLowerCase();
  const number = '(\\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)';
  const match = text.match(new RegExp(`\\b(?:each of (?:my|the)|all(?: of)?(?: my| the)?|my|the)\\s+${number}\\s+[a-z][a-z-]*s\\b`));
  if (!match) return undefined;
  const count = Number(match[1]) || NUMBER_WORDS[match[1]];
  return count && count <= 50 ? count : undefined;
}

export function resolveAnalysisRequest(
  question: string,
  questionInstructions: string[],
  history: AnalysisConversationMessage[],
): ResolvedAnalysisRequest {
  const current = clean([question, ...questionInstructions].filter(Boolean).join(' '), 3200);
  const anchor = conversationAnchor(history);
  const dependent = isDependentFollowUp(question) || (isVisualizationRequest(current) && !hasAnalyticalSubject(current));
  const inheritedGoal = Boolean(anchor && dependent);
  const artifactContext = inheritedGoal
    ? [...history].reverse().find(message => message.role === 'assistant' && clean(message.artifacts))?.artifacts
    : '';
  const effectiveQuestion = clean([
    inheritedGoal ? `Original user goal: ${anchor}` : current,
    inheritedGoal ? `Current follow-up or correction: ${current}` : '',
    artifactContext ? `Previous response artifact: ${artifactContext}` : '',
  ].filter(Boolean).join('\n'), 6000);
  const explicitlyNarrowsScope = /\b(?:past|last|previous|recent)\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|few|several)?[ -]?(?:days?|weeks?)\b/i.test(question);

  const semanticTextAggregate = isSemanticTextAggregateRequest(effectiveQuestion);
  return {
    effectiveQuestion,
    visualization: isVisualizationRequest(effectiveQuestion) || semanticTextAggregate,
    semanticTextAggregate,
    wholeHistory: !explicitlyNarrowsScope && isWholeHistoryComparisonRequest(effectiveQuestion),
    inheritedGoal,
    anchorQuestion: inheritedGoal ? anchor : undefined,
    requestedCategoryCount: requestedCategoryCount(effectiveQuestion),
  };
}
