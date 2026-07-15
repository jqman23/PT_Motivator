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

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function cleanText(value: unknown, limit: number) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

function cleanNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
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
    visualizations: normalizeAiVisualizations(raw.visualizations),
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
