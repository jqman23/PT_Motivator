import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Node's type-stripping test runner requires the explicit extension.
import { resolveAnalysisRequest } from './aiAnalysisIntent.ts';
// @ts-expect-error Node's type-stripping test runner requires the explicit extension.
import { buildAiRequestPlan } from './aiExecutionPlan.ts';
// @ts-expect-error Node's type-stripping test runner requires the explicit extension.
import { resolveBoundedHistoryWindow } from './aiHistoryScope.ts';
// @ts-expect-error Node's type-stripping test runner requires the explicit extension.
import { isAgentRequest, isHistorySummaryRequest } from './aiRequestIntent.ts';

const today = '2026-07-15';

function requestSignals(question: string) {
  const analysis = resolveAnalysisRequest(question, [], []);
  const window = resolveBoundedHistoryWindow(question, today);
  const agent = isAgentRequest(question);
  const historySummary = isHistorySummaryRequest(analysis.effectiveQuestion);
  const pattern = /\b(?:compare|average|pattern|trend|usually|better|worse|over time|correlat)\b/i.test(analysis.effectiveQuestion);
  const needsHistory = Boolean(window) || analysis.visualization || analysis.semanticTextAggregate || analysis.wholeHistory || historySummary || pattern;
  return {
    analysis,
    window,
    agent,
    plan: buildAiRequestPlan({
      needsHistory,
      hasBoundedWindow: Boolean(window),
      wholeHistory: analysis.wholeHistory,
      semanticAggregate: analysis.semanticTextAggregate,
      visualization: analysis.visualization,
      actionProposal: agent,
      patternAnalysis: pattern || historySummary,
    }),
  };
}

test('golden request: past-week summary resolves the prior seven complete calendar days', () => {
  const result = requestSignals('What stood out to you this past week?');
  assert.deepEqual(result.window && {
    startDate: result.window.startDate,
    endDate: result.window.endDate,
    dayCount: result.window.dayCount,
  }, { startDate: '2026-07-08', endDate: '2026-07-14', dayCount: 7 });
  assert.equal(result.plan.historyStrategy, 'bounded-complete');
  assert.equal(result.plan.requestedOutputs.actionProposal, false);
});

test('golden request: compound analysis, chart, and writes remain simultaneous subgoals', () => {
  const result = requestSignals('Compare my pain over the last 90 days, chart it by week, and add a note to the three worst days.');
  assert.equal(result.agent, true);
  assert.equal(result.analysis.visualization, true);
  assert.equal(result.window?.dayCount, 90);
  assert.equal(result.plan.compound, true);
  assert.equal(result.plan.requestedOutputs.visualization, true);
  assert.equal(result.plan.requestedOutputs.actionProposal, true);
  assert.ok(result.plan.steps.some(step => step.capability === 'calculate_structured_analytics'));
  assert.ok(result.plan.steps.some(step => step.capability === 'propose_actions'));
});

test('golden request: ten-entity mention count requires complete semantic evidence, not a health dashboard', () => {
  const result = requestSignals('Show a table counting how often I mentioned each of my ten toes in my whole history.');
  assert.equal(result.analysis.semanticTextAggregate, true);
  assert.equal(result.analysis.visualization, true);
  assert.equal(result.analysis.requestedCategoryCount, 10);
  assert.equal(result.plan.historyStrategy, 'semantic-corpus');
  assert.equal(result.plan.steps.some(step => step.capability === 'extract_semantic_evidence'), true);
  assert.equal(result.plan.steps.some(step => step.capability === 'calculate_structured_analytics'), false);
});

test('golden request: symptom advice never becomes a write merely because it describes an update', () => {
  const result = requestSignals('Ten hours later it still hurts when I load my leg. What is your advice?');
  assert.equal(result.agent, false);
  assert.equal(result.plan.requestedOutputs.actionProposal, false);
  assert.equal(result.plan.steps.some(step => step.capability === 'propose_actions'), false);
});
