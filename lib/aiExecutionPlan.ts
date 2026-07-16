import type { DomainCommandId } from './domainCommands';

export type AiCapabilityId =
  | 'resolve_scope'
  | 'retrieve_history'
  | 'rank_history'
  | 'extract_semantic_evidence'
  | 'calculate_structured_analytics'
  | 'compose_response'
  | 'render_visualization'
  | 'link_evidence_dates'
  | 'propose_actions';

export type AiCapabilityDefinition = {
  id: AiCapabilityId;
  description: string;
  mode: 'read' | 'write-proposal';
  executor: 'deterministic' | 'model-assisted';
  risk: 'low' | 'review-required';
  requiresPermission: boolean;
  preview: boolean;
  apply: boolean;
  undo: boolean;
  domainCommands: DomainCommandId[];
};

// This registry is deliberately data, not a switch statement hidden in the route.
// Adding a capability must declare its safety and execution boundary before a planner
// can use it. Write capabilities remain proposals until the existing Apply workflow.
export const AI_CAPABILITY_REGISTRY: Readonly<Record<AiCapabilityId, AiCapabilityDefinition>> = Object.freeze({
  resolve_scope: { id: 'resolve_scope', description: 'Resolve dates, follow-up references, and requested coverage.', mode: 'read', executor: 'deterministic', risk: 'low', requiresPermission: false, preview: false, apply: false, undo: false, domainCommands: [] },
  retrieve_history: { id: 'retrieve_history', description: 'Load the bounded personal-data fields required by the request.', mode: 'read', executor: 'deterministic', risk: 'low', requiresPermission: true, preview: false, apply: false, undo: false, domainCommands: [] },
  rank_history: { id: 'rank_history', description: 'Expand the most relevant saved notes when complete rich expansion is unnecessary.', mode: 'read', executor: 'model-assisted', risk: 'low', requiresPermission: true, preview: false, apply: false, undo: false, domainCommands: [] },
  extract_semantic_evidence: { id: 'extract_semantic_evidence', description: 'Interpret note wording and verify every category against exact source evidence.', mode: 'read', executor: 'model-assisted', risk: 'low', requiresPermission: true, preview: false, apply: false, undo: false, domainCommands: [] },
  calculate_structured_analytics: { id: 'calculate_structured_analytics', description: 'Calculate validated metrics, groups, comparisons, and chart values on the server.', mode: 'read', executor: 'deterministic', risk: 'low', requiresPermission: true, preview: false, apply: false, undo: false, domainCommands: [] },
  compose_response: { id: 'compose_response', description: 'Explain the evidence and complete every requested response subgoal.', mode: 'read', executor: 'model-assisted', risk: 'low', requiresPermission: false, preview: false, apply: false, undo: false, domainCommands: [] },
  render_visualization: { id: 'render_visualization', description: 'Render a validated server-calculated dataset.', mode: 'read', executor: 'deterministic', risk: 'low', requiresPermission: false, preview: false, apply: false, undo: false, domainCommands: [] },
  link_evidence_dates: { id: 'link_evidence_dates', description: 'Preserve clickable navigation for every saved date named in the answer.', mode: 'read', executor: 'deterministic', risk: 'low', requiresPermission: false, preview: false, apply: false, undo: false, domainCommands: [] },
  propose_actions: { id: 'propose_actions', description: 'Prepare validated app changes for Review, Apply, and Undo through shared domain commands without executing them.', mode: 'write-proposal', executor: 'model-assisted', risk: 'review-required', requiresPermission: true, preview: true, apply: true, undo: true, domainCommands: ['set_exercise_completion', 'update_exercise_note', 'record_health_observation', 'set_exercise_metrics', 'update_exercise_library', 'update_exercise_category', 'update_doctor_note', 'update_pt_session', 'update_app_preference', 'attach_media'] },
});

export type AiExecutionStep = {
  id: string;
  capability: AiCapabilityId;
  dependsOn: string[];
  required: boolean;
};

export type AiAnalyticsExecutionBinding = {
  scopes: Array<{ id: string; startDate: string; endDate: string }>;
  measures: Array<{ field: string; aggregation: string }>;
  groupBy: string;
  requestedCoverage: { observedCount: boolean; missingCount: boolean };
};

export type AiContextExecutionBinding = {
  focalDates: string[];
  evidenceScopes: Array<{ id: string; startDate: string; endDate: string }>;
};

export type AiActionExecutionBinding = {
  key: string;
  type: string;
};

export type AiRequestPlan = {
  version: 1;
  historyStrategy: 'none' | 'bounded-complete' | 'whole-compact' | 'semantic-corpus' | 'ranked-expanded';
  requestedOutputs: {
    answer: true;
    evidence: boolean;
    visualization: boolean;
    actionProposal: boolean;
    dateNavigation: boolean;
  };
  compound: boolean;
  bindings?: {
    analytics?: AiAnalyticsExecutionBinding;
    context?: AiContextExecutionBinding;
    actions?: AiActionExecutionBinding[];
  };
  steps: AiExecutionStep[];
};

export type BuildAiRequestPlanInput = {
  needsHistory: boolean;
  hasBoundedWindow: boolean;
  wholeHistory: boolean;
  semanticAggregate: boolean;
  visualization: boolean;
  actionProposal: boolean;
  patternAnalysis: boolean;
  analytics?: AiAnalyticsExecutionBinding;
  context?: AiContextExecutionBinding;
};

export function buildAiRequestPlan(input: BuildAiRequestPlanInput): AiRequestPlan {
  const steps: AiExecutionStep[] = [];
  const add = (capability: AiCapabilityId, dependsOn: string[] = [], required = true) => {
    const id = `${steps.length + 1}-${capability}`;
    steps.push({ id, capability, dependsOn, required });
    return id;
  };

  const scope = add('resolve_scope');
  let history = '';
  let analysis = '';
  if (input.needsHistory) {
    history = add('retrieve_history', [scope]);
    if (input.semanticAggregate) analysis = add('extract_semantic_evidence', [history]);
    else if (input.visualization || input.patternAnalysis) analysis = add('calculate_structured_analytics', [history]);
    if (!input.hasBoundedWindow && !input.wholeHistory && !input.semanticAggregate) add('rank_history', [history], false);
  }
  const action = input.actionProposal ? add('propose_actions', [analysis || scope]) : '';
  const composeDependencies = [analysis || history, action].filter(Boolean);
  const compose = add('compose_response', composeDependencies);
  if (input.visualization) add('render_visualization', [analysis || history || compose]);
  const dateNavigation = input.needsHistory;
  if (dateNavigation) add('link_evidence_dates', [compose]);

  const requestedOutputs = {
    answer: true as const,
    evidence: input.needsHistory,
    visualization: input.visualization,
    actionProposal: input.actionProposal,
    dateNavigation,
  };
  const outputCount = [requestedOutputs.evidence, requestedOutputs.visualization, requestedOutputs.actionProposal].filter(Boolean).length;
  const historyStrategy = !input.needsHistory ? 'none'
    : input.semanticAggregate ? 'semantic-corpus'
      : input.hasBoundedWindow ? 'bounded-complete'
        : input.wholeHistory ? 'whole-compact'
          : 'ranked-expanded';

  const plan: AiRequestPlan = {
    version: 1,
    historyStrategy,
    requestedOutputs,
    compound: outputCount > 1,
    bindings: input.analytics || input.context ? { analytics: input.analytics, context: input.context } : undefined,
    steps,
  };
  validateAiRequestPlan(plan);
  return plan;
}

export function validateAiRequestPlan(plan: AiRequestPlan) {
  const ids = new Set(plan.steps.map(step => step.id));
  if (ids.size !== plan.steps.length) throw new Error('AI request plan contains duplicate step IDs.');
  const visited = new Set<string>();
  for (const step of plan.steps) {
    if (!AI_CAPABILITY_REGISTRY[step.capability]) throw new Error(`Unknown AI capability: ${step.capability}`);
    for (const dependency of step.dependsOn) {
      if (!ids.has(dependency)) throw new Error(`Unknown AI request-plan dependency: ${dependency}`);
      if (!visited.has(dependency)) throw new Error(`AI request-plan dependency must precede its consumer: ${dependency}`);
    }
    visited.add(step.id);
  }
  if (plan.requestedOutputs.actionProposal && !plan.steps.some(step => step.capability === 'propose_actions')) {
    throw new Error('AI request plan omitted its requested action proposal.');
  }
  if (plan.requestedOutputs.visualization && !plan.steps.some(step => step.capability === 'render_visualization')) {
    throw new Error('AI request plan omitted its requested visualization.');
  }
  return plan;
}

export type AiExecutionRecord = {
  planVersion: 1;
  scope: { mode: AiRequestPlan['historyStrategy']; startDate?: string; endDate?: string; loadedDays: number };
  capabilities: Array<{ id: string; capability: AiCapabilityId; status: 'completed' | 'not-needed' | 'incomplete' }>;
  requestedOutputs: AiRequestPlan['requestedOutputs'];
  completedOutputs: { answer: boolean; evidence: boolean; visualization: boolean; actionProposal: boolean; dateNavigation: boolean };
  assumptions: string[];
  evidence?: unknown;
  elapsedMs: number;
  remainingBudgetMs: number;
};

export function buildAiExecutionRecord(
  plan: AiRequestPlan,
  input: {
    scope: { startDate?: string; endDate?: string; loadedDays: number };
    completedCapabilities: AiCapabilityId[];
    completedOutputs: AiExecutionRecord['completedOutputs'];
    assumptions?: string[];
    evidence?: unknown;
    elapsedMs: number;
    remainingBudgetMs: number;
  },
): AiExecutionRecord {
  const completed = new Set(input.completedCapabilities);
  return {
    planVersion: 1,
    scope: { mode: plan.historyStrategy, ...input.scope },
    capabilities: plan.steps.map(step => ({
      id: step.id,
      capability: step.capability,
      status: completed.has(step.capability) ? 'completed' : step.required ? 'incomplete' : 'not-needed',
    })),
    requestedOutputs: plan.requestedOutputs,
    completedOutputs: input.completedOutputs,
    assumptions: (input.assumptions ?? []).slice(0, 12),
    evidence: input.evidence,
    elapsedMs: Math.max(0, Math.round(input.elapsedMs)),
    remainingBudgetMs: Math.max(0, Math.round(input.remainingBudgetMs)),
  };
}
