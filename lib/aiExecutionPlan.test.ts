import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Node's type-stripping test runner requires the explicit extension.
import { AI_CAPABILITY_REGISTRY, buildAiExecutionRecord, buildAiRequestPlan, validateAiRequestPlan } from './aiExecutionPlan.ts';

const base = {
  needsHistory: false,
  hasBoundedWindow: false,
  wholeHistory: false,
  semanticAggregate: false,
  visualization: false,
  actionProposal: false,
  patternAnalysis: false,
};

test('golden: a normal advice question remains open conversation without a write proposal', () => {
  const plan = buildAiRequestPlan(base);
  assert.equal(plan.historyStrategy, 'none');
  assert.equal(plan.requestedOutputs.actionProposal, false);
  assert.deepEqual(plan.steps.map(step => step.capability), ['resolve_scope', 'compose_response']);
});

test('golden: a bounded weekly interpretation retrieves the complete window and preserves date navigation', () => {
  const plan = buildAiRequestPlan({ ...base, needsHistory: true, hasBoundedWindow: true, patternAnalysis: true });
  assert.equal(plan.historyStrategy, 'bounded-complete');
  assert.equal(plan.requestedOutputs.dateNavigation, true);
  assert.equal(plan.steps.some(step => step.capability === 'rank_history'), false);
  assert.equal(plan.steps.some(step => step.capability === 'calculate_structured_analytics'), true);
});

test('golden: semantic frequency scans source evidence and does not substitute generic analytics', () => {
  const plan = buildAiRequestPlan({ ...base, needsHistory: true, wholeHistory: true, semanticAggregate: true, visualization: true });
  assert.equal(plan.historyStrategy, 'semantic-corpus');
  assert.equal(plan.steps.some(step => step.capability === 'extract_semantic_evidence'), true);
  assert.equal(plan.steps.some(step => step.capability === 'calculate_structured_analytics'), false);
});

test('golden: compound chart plus app update retains both outputs in one dependency graph', () => {
  const plan = buildAiRequestPlan({
    ...base,
    needsHistory: true,
    wholeHistory: true,
    visualization: true,
    actionProposal: true,
    patternAnalysis: true,
    analytics: { scopes: [{ id: 'whole', startDate: '2026-01-01', endDate: '2026-07-15' }], measures: [{ field: 'pain', aggregation: 'maximum' }], groupBy: 'day', requestedCoverage: { observedCount: false, missingCount: false } },
  });
  assert.equal(plan.compound, true);
  assert.equal(plan.requestedOutputs.visualization, true);
  assert.equal(plan.requestedOutputs.actionProposal, true);
  const capabilities = plan.steps.map(step => step.capability);
  assert.ok(capabilities.includes('calculate_structured_analytics'));
  assert.ok(capabilities.includes('render_visualization'));
  assert.ok(capabilities.includes('propose_actions'));
  assert.ok(capabilities.includes('compose_response'));
  const analyticsStep = plan.steps.find(step => step.capability === 'calculate_structured_analytics');
  const actionStep = plan.steps.find(step => step.capability === 'propose_actions');
  assert.deepEqual(actionStep?.dependsOn, [analyticsStep?.id]);
  assert.equal(plan.bindings?.analytics?.measures[0].field, 'pain');
});

test('every registered write proposal retains preview, apply, and undo safeguards', () => {
  const proposal = AI_CAPABILITY_REGISTRY.propose_actions;
  assert.equal(proposal.mode, 'write-proposal');
  assert.equal(proposal.risk, 'review-required');
  assert.equal(proposal.preview && proposal.apply && proposal.undo, true);
  assert.ok(proposal.domainCommands.includes('record_health_observation'));
});

test('plan validation rejects missing or forward dependencies', () => {
  const plan = buildAiRequestPlan({ ...base, visualization: true });
  const broken = { ...plan, steps: plan.steps.map((step, index) => index === 0 ? { ...step, dependsOn: ['missing'] } : step) };
  assert.throws(() => validateAiRequestPlan(broken), /Unknown AI request-plan dependency/);
});

test('execution records expose incomplete requested outputs instead of hiding them', () => {
  const plan = buildAiRequestPlan({ ...base, needsHistory: true, visualization: true, actionProposal: true, patternAnalysis: true });
  const record = buildAiExecutionRecord(plan, {
    scope: { startDate: '2026-07-01', endDate: '2026-07-07', loadedDays: 7 },
    completedCapabilities: ['resolve_scope', 'retrieve_history', 'calculate_structured_analytics', 'compose_response', 'render_visualization', 'link_evidence_dates'],
    completedOutputs: { answer: true, evidence: true, visualization: true, actionProposal: false, dateNavigation: true },
    assumptions: ['Unlogged values are excluded.'],
    elapsedMs: 1200,
    remainingBudgetMs: 30000,
  });
  assert.equal(record.completedOutputs.actionProposal, false);
  assert.equal(record.capabilities.find(step => step.capability === 'propose_actions')?.status, 'incomplete');
  assert.equal(record.scope.loadedDays, 7);
});

test('plan bindings keep the focal date separate from the evidence window', () => {
  const plan = buildAiRequestPlan({
    ...base,
    needsHistory: true,
    hasBoundedWindow: true,
    context: {
      focalDates: ['2026-07-15'],
      evidenceScopes: [{ id: 'primary', startDate: '2026-07-09', endDate: '2026-07-15' }],
    },
  });
  assert.deepEqual(plan.bindings?.context, {
    focalDates: ['2026-07-15'],
    evidenceScopes: [{ id: 'primary', startDate: '2026-07-09', endDate: '2026-07-15' }],
  });
});
