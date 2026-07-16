// @ts-expect-error Node's type-stripping test runner requires the explicit extension.
import { normalizeAgentPlan, type AgentPreviewItem, type PreviewedAgentPlan } from './aiAgent.ts';
// @ts-expect-error Node's type-stripping test runner requires the explicit extension.
import { normalizeAiVisualizations, type AiVisualization } from './aiVisualizations.ts';

export type StoredAiDateLink = {
  date: string;
  label: string;
  reason?: string;
};

export type StoredAiDateSummary = {
  date: string;
  summary: string;
};

export type StoredAiExerciseDraft = {
  id?: string;
  name?: string;
  cat?: string;
  cue?: string;
  sets?: string;
  imageSearch?: string;
  confidence?: string;
  nextStep?: string;
  tips?: string[];
};

export type StoredAiReplyDebug = {
  requestId?: string;
  build?: string;
  normalizedQuestion?: string;
  resolvedAnalysis?: {
    effectiveQuestion?: string;
    inheritedGoal: boolean;
    anchorQuestion?: string;
    requestedCategoryCount?: number;
  };
  intents?: {
    agent: boolean;
    visualization: boolean;
    semanticTextAggregate: boolean;
    wholeHistory: boolean;
    boundedWindow: boolean;
    pattern: boolean;
  };
  historyScope?: {
    mode: 'none' | 'ranked' | 'window' | 'whole';
    startDate?: string;
    endDate?: string;
    loadedDays: number;
  };
  secretNotes?: {
    included: boolean;
    reason?: string;
  };
  visualization?: {
    source: 'none' | 'deterministic' | 'model' | 'semantic-repair';
    firstPassCount: number;
    deterministicCount: number;
    repairedCount: number;
    finalCount: number;
    repairModel?: string;
    repairProviderKey?: string;
  };
  attemptedModels?: string[];
  providerAttempts?: Array<{
    model: string;
    providerKey?: string;
    status?: number;
    statusText?: string;
    detail?: string;
  }>;
};

export type StoredAiReply = {
  answer: string;
  options: string[];
  dateLinks: StoredAiDateLink[];
  dateSummaries?: StoredAiDateSummary[];
  confirmedExercise?: StoredAiExerciseDraft;
  model?: string;
  providerKey?: string;
  searchedDays?: number;
  comparedDays?: number;
  rerankerModel?: string;
  rerankerProviderKey?: string;
  rerankedCandidates?: number;
  degraded?: boolean;
  agentPlan?: PreviewedAgentPlan;
  agentPlanningStatus?: 'planned' | 'clarification' | 'missing' | 'invalid';
  visualizations?: AiVisualization[];
  debug?: StoredAiReplyDebug;
};

export type StoredAiChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  aiInstructions?: string[];
  reply?: StoredAiReply;
};

export type AiChatSessionSummary = {
  id: string;
  title: string;
  preview: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
};

export type StoredAiChatArchiveSession = AiChatSessionSummary & {
  messages: StoredAiChatMessage[];
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function cleanText(value: unknown, limit: number) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

function cleanNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function normalizeReplyDebug(value: unknown): StoredAiReplyDebug | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const rawIntents = raw.intents && typeof raw.intents === 'object' && !Array.isArray(raw.intents) ? raw.intents as Record<string, unknown> : null;
  const rawScope = raw.historyScope && typeof raw.historyScope === 'object' && !Array.isArray(raw.historyScope) ? raw.historyScope as Record<string, unknown> : null;
  const rawVisual = raw.visualization && typeof raw.visualization === 'object' && !Array.isArray(raw.visualization) ? raw.visualization as Record<string, unknown> : null;
  const rawResolvedAnalysis = raw.resolvedAnalysis && typeof raw.resolvedAnalysis === 'object' && !Array.isArray(raw.resolvedAnalysis) ? raw.resolvedAnalysis as Record<string, unknown> : null;
  const rawSecrets = raw.secretNotes && typeof raw.secretNotes === 'object' && !Array.isArray(raw.secretNotes) ? raw.secretNotes as Record<string, unknown> : null;
  const scopeMode = rawScope?.mode === 'ranked' || rawScope?.mode === 'window' || rawScope?.mode === 'whole' ? rawScope.mode : 'none';
  const visualSource = rawVisual?.source === 'deterministic' || rawVisual?.source === 'model' || rawVisual?.source === 'semantic-repair' ? rawVisual.source : 'none';
  return {
    requestId: cleanText(raw.requestId, 120) || undefined,
    build: cleanText(raw.build, 80) || undefined,
    normalizedQuestion: cleanText(raw.normalizedQuestion, 1_500) || undefined,
    resolvedAnalysis: rawResolvedAnalysis ? {
      effectiveQuestion: cleanText(rawResolvedAnalysis.effectiveQuestion, 6_000) || undefined,
      inheritedGoal: rawResolvedAnalysis.inheritedGoal === true,
      anchorQuestion: cleanText(rawResolvedAnalysis.anchorQuestion, 3_200) || undefined,
      requestedCategoryCount: cleanNumber(rawResolvedAnalysis.requestedCategoryCount),
    } : undefined,
    intents: rawIntents ? {
      agent: rawIntents.agent === true,
      visualization: rawIntents.visualization === true,
      semanticTextAggregate: rawIntents.semanticTextAggregate === true,
      wholeHistory: rawIntents.wholeHistory === true,
      boundedWindow: rawIntents.boundedWindow === true,
      pattern: rawIntents.pattern === true,
    } : undefined,
    historyScope: rawScope ? {
      mode: scopeMode,
      startDate: cleanText(rawScope.startDate, 10) || undefined,
      endDate: cleanText(rawScope.endDate, 10) || undefined,
      loadedDays: cleanNumber(rawScope.loadedDays) ?? 0,
    } : undefined,
    secretNotes: rawSecrets ? {
      included: rawSecrets.included === true,
      reason: cleanText(rawSecrets.reason, 160) || undefined,
    } : undefined,
    visualization: rawVisual ? {
      source: visualSource,
      firstPassCount: cleanNumber(rawVisual.firstPassCount) ?? 0,
      deterministicCount: cleanNumber(rawVisual.deterministicCount) ?? 0,
      repairedCount: cleanNumber(rawVisual.repairedCount) ?? 0,
      finalCount: cleanNumber(rawVisual.finalCount) ?? 0,
      repairModel: cleanText(rawVisual.repairModel, 120) || undefined,
      repairProviderKey: cleanText(rawVisual.repairProviderKey, 40) || undefined,
    } : undefined,
    attemptedModels: Array.isArray(raw.attemptedModels)
      ? raw.attemptedModels.map(model => cleanText(model, 120)).filter(Boolean).slice(0, 40)
      : undefined,
    providerAttempts: Array.isArray(raw.providerAttempts) ? raw.providerAttempts.flatMap(item => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
      const attempt = item as Record<string, unknown>;
      const model = cleanText(attempt.model, 120);
      if (!model) return [];
      return [{
        model,
        providerKey: cleanText(attempt.providerKey, 80) || undefined,
        status: cleanNumber(attempt.status),
        statusText: cleanText(attempt.statusText, 80) || undefined,
        detail: cleanText(attempt.detail, 240) || undefined,
      }];
    }).slice(0, 40) : undefined,
  };
}

function normalizeReply(value: unknown): StoredAiReply | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  const answer = cleanText(raw.answer, 2_000);
  const options = Array.isArray(raw.options)
    ? raw.options.map(option => cleanText(option, 180)).filter(Boolean).slice(0, 4)
    : [];
  const dateLinks = Array.isArray(raw.dateLinks) ? raw.dateLinks.flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const link = item as Record<string, unknown>;
    const date = cleanText(link.date, 10);
    if (!DATE_PATTERN.test(date)) return [];
    return [{ date, label: cleanText(link.label, 160), reason: cleanText(link.reason, 300) || undefined }];
  }).slice(0, 5) : [];
  const dateSummaries = Array.isArray(raw.dateSummaries) ? raw.dateSummaries.flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const summary = item as Record<string, unknown>;
    const date = cleanText(summary.date, 10);
    const text = cleanText(summary.summary, 400);
    return DATE_PATTERN.test(date) && text ? [{ date, summary: text }] : [];
  }).slice(0, 8) : [];

  let confirmedExercise: StoredAiExerciseDraft | undefined;
  if (raw.confirmedExercise && typeof raw.confirmedExercise === 'object') {
    const draft = raw.confirmedExercise as Record<string, unknown>;
    const name = cleanText(draft.name, 180);
    if (name) {
      confirmedExercise = {
        id: cleanText(draft.id, 100) || undefined,
        name,
        cat: cleanText(draft.cat, 80) || undefined,
        cue: cleanText(draft.cue, 500) || undefined,
        sets: cleanText(draft.sets, 160) || undefined,
        imageSearch: cleanText(draft.imageSearch, 180) || undefined,
        confidence: cleanText(draft.confidence, 80) || undefined,
        nextStep: cleanText(draft.nextStep, 300) || undefined,
        tips: Array.isArray(draft.tips) ? draft.tips.map(tip => cleanText(tip, 300)).filter(Boolean).slice(0, 8) : [],
      };
    }
  }

  let agentPlan: PreviewedAgentPlan | undefined;
  const normalizedPlan = normalizeAgentPlan(raw.agentPlan);
  if (normalizedPlan && raw.agentPlan && typeof raw.agentPlan === 'object' && !Array.isArray(raw.agentPlan)) {
    const rawPlan = raw.agentPlan as Record<string, unknown>;
    const actionIds = new Set(normalizedPlan.actions.map(action => action.id));
    const previewItems: AgentPreviewItem[] = Array.isArray(rawPlan.previewItems) ? rawPlan.previewItems.flatMap(item => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
      const preview = item as Record<string, unknown>;
      const actionId = cleanText(preview.actionId, 80);
      const risk: AgentPreviewItem['risk'] = preview.risk === 'navigation' || preview.risk === 'destructive' || preview.risk === 'bulk' ? preview.risk : 'change';
      if (!actionIds.has(actionId)) return [];
      return [{ actionId, title: cleanText(preview.title, 200), detail: cleanText(preview.detail, 500), risk }];
    }).slice(0, normalizedPlan.actions.length) : [];
    agentPlan = {
      ...normalizedPlan,
      previewItems,
      appliedRunId: cleanText(rawPlan.appliedRunId, 120) || undefined,
      appliedAt: cleanText(rawPlan.appliedAt, 60) || undefined,
      appliedActionIds: Array.isArray(rawPlan.appliedActionIds)
        ? rawPlan.appliedActionIds.map(item => cleanText(item, 80)).filter(id => actionIds.has(id)).slice(0, normalizedPlan.actions.length)
        : undefined,
      undoneAt: cleanText(rawPlan.undoneAt, 60) || undefined,
    };
  }

  return {
    answer,
    options,
    dateLinks,
    dateSummaries,
    confirmedExercise,
    model: cleanText(raw.model, 120) || undefined,
    providerKey: cleanText(raw.providerKey, 40) || undefined,
    searchedDays: cleanNumber(raw.searchedDays),
    comparedDays: cleanNumber(raw.comparedDays),
    rerankerModel: cleanText(raw.rerankerModel, 120) || undefined,
    rerankerProviderKey: cleanText(raw.rerankerProviderKey, 40) || undefined,
    rerankedCandidates: cleanNumber(raw.rerankedCandidates),
    degraded: raw.degraded === true,
    agentPlan,
    agentPlanningStatus: raw.agentPlanningStatus === 'planned' || raw.agentPlanningStatus === 'clarification' || raw.agentPlanningStatus === 'missing' || raw.agentPlanningStatus === 'invalid'
      ? raw.agentPlanningStatus
      : undefined,
    // Deterministic all-history visuals can legitimately contain one point per
    // loaded day. Keep them complete when a saved conversation is reopened.
    visualizations: normalizeAiVisualizations(raw.visualizations, { maxPoints: 730 }),
    debug: normalizeReplyDebug(raw.debug),
  };
}

export function normalizeAiChatMessages(value: unknown): StoredAiChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    if (!item || typeof item !== 'object') return [];
    const raw = item as Record<string, unknown>;
    if (raw.role !== 'user' && raw.role !== 'assistant') return [];
    const content = cleanText(raw.content, 4_000);
    if (!content) return [];
    const role = raw.role === 'assistant' ? 'assistant' as const : 'user' as const;
    const aiInstructions = Array.isArray(raw.aiInstructions)
      ? raw.aiInstructions.map(instruction => cleanText(instruction, 400)).filter(Boolean).slice(0, 6)
      : [];
    return [{
      id: cleanText(raw.id, 100) || `restored-${index}`,
      role,
      content,
      aiInstructions: aiInstructions.length ? aiInstructions : undefined,
      reply: role === 'assistant' ? normalizeReply(raw.reply) : undefined,
    }];
  }).slice(-100);
}

export function aiChatTitle(messages: StoredAiChatMessage[]) {
  const firstQuestion = messages.find(message => message.role === 'user')?.content ?? 'Untitled conversation';
  return firstQuestion.replace(/\s+/g, ' ').trim().slice(0, 90);
}

export function aiChatPreview(messages: StoredAiChatMessage[]) {
  const latest = [...messages].reverse().find(message => message.role === 'assistant')
    ?? [...messages].reverse().find(message => message.role === 'user');
  return (latest?.content ?? '').replace(/\s+/g, ' ').trim().slice(0, 180);
}

function transcriptCell(value: unknown) {
  return String(value ?? '—').replace(/[\t\r\n]+/g, ' ').trim() || '—';
}

function visualizationTranscript(visual: AiVisualization) {
  const heading = `[${visual.type === 'table' ? 'Table' : `${visual.type === 'line' ? 'Line' : 'Bar'} chart`}: ${visual.title}]`;
  const context = [heading, visual.subtitle].filter(Boolean) as string[];
  if (visual.type === 'table') {
    context.push(visual.columns.map(transcriptCell).join('\t'));
    context.push(...visual.rows.map(row => visual.columns.map((_, index) => transcriptCell(row[index])).join('\t')));
  } else {
    const seriesHeadings = visual.series.map(series => `${series.name}${series.unit ? ` (${series.unit})` : ''}`);
    context.push(['Label', ...seriesHeadings].map(transcriptCell).join('\t'));
    context.push(...visual.labels.map((label, index) => [
      transcriptCell(label),
      ...visual.series.map(series => transcriptCell(series.values[index])),
    ].join('\t')));
  }
  if (visual.drilldowns?.length) {
    context.push('Evidence behind counts:');
    for (const drilldown of visual.drilldowns) {
      context.push(`${transcriptCell(drilldown.label)}:`);
      if (!drilldown.items.length) context.push('- No matching saved-note evidence');
      else context.push(...drilldown.items.map(item => [
        '-', item.date, item.source,
        item.count && item.count > 1 ? `${item.count} matches` : '',
        item.match ? `matched "${item.match}"` : '',
        `excerpt "${item.excerpt}"`,
      ].filter(Boolean).map(transcriptCell).join(' · ')));
    }
  }
  if (visual.footnote) context.push(`Note: ${visual.footnote}`);
  return context.join('\n');
}

export function aiChatTranscript(messages: StoredAiChatMessage[]) {
  return messages.flatMap(message => {
    const sections = [`${message.role === 'user' ? 'You' : 'AI'}:\n${message.content}`];
    if (message.aiInstructions?.length) sections.push(`AI guidance:\n${message.aiInstructions.map(instruction => `- ${instruction}`).join('\n')}`);
    if (message.role === 'assistant' && message.reply) {
      sections.push(...(message.reply.visualizations ?? []).map(visualizationTranscript));
      if (message.reply.agentPlan) {
        sections.push([
          `[Review plan: ${message.reply.agentPlan.summary}]`,
          ...message.reply.agentPlan.actions.map(action => JSON.stringify(action)),
        ].join('\n'));
      }
      const model = [message.reply.model, message.reply.providerKey].filter(Boolean).join(' · ');
      if (model) sections.push(`Model: ${model}`);
    }
    return [sections.join('\n\n')];
  }).join('\n\n---\n\n');
}

export function aiChatDebugBundle(messages: StoredAiChatMessage[], conversationId?: string) {
  return JSON.stringify({
    format: 'pt-motivator-ai-debug-v1',
    exportedAt: new Date().toISOString(),
    conversationId: cleanText(conversationId, 120) || undefined,
    transcript: aiChatTranscript(messages),
    messages,
  }, null, 2);
}

export function aiChatArchiveTranscript(sessions: StoredAiChatArchiveSession[], truncated = false) {
  const chats = sessions.map((session, index) => [
    `CHAT ${index + 1}: ${session.title || 'Untitled conversation'}`,
    `Updated: ${session.updatedAt} · ${session.messageCount} messages`,
    aiChatTranscript(session.messages),
  ].join('\n'));
  if (truncated) chats.push('[Archive truncated at the server export limit.]');
  return chats.join('\n\n========================================\n\n');
}

export function aiChatArchiveDebugBundle(sessions: StoredAiChatArchiveSession[], truncated = false) {
  return JSON.stringify({
    format: 'pt-motivator-ai-debug-archive-v1',
    exportedAt: new Date().toISOString(),
    truncated,
    sessionCount: sessions.length,
    sessions,
  }, null, 2);
}
