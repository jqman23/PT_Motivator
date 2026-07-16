import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Node's type-stripping test runner requires the explicit extension.
import { resolveAnalysisRequest } from './aiAnalysisIntent.ts';
// @ts-expect-error Node's type-stripping test runner requires the explicit extension.
import { buildAiRequestPlan } from './aiExecutionPlan.ts';
// @ts-expect-error Node's type-stripping test runner requires the explicit extension.
import { resolveBoundedHistoryWindow, resolveHistoryScopePlan } from './aiHistoryScope.ts';
// @ts-expect-error Node's type-stripping test runner requires the explicit extension.
import { composeAiAnalyticsAnswer, executeAiAnalyticsPlan, inferAiAnalyticsPlan } from './aiAnalytics.ts';
// @ts-expect-error Node's type-stripping test runner requires the explicit extension.
import { isAgentRequest, isBulkNoteAgentRequest, isHistorySummaryRequest, prefersChronologicalHistoryAnswer } from './aiRequestIntent.ts';

const today = '2026-07-15';

function requestSignals(question: string) {
  const analysis = resolveAnalysisRequest(question, [], []);
  const window = resolveBoundedHistoryWindow(question, today);
  const agent = isAgentRequest(question);
  const historySummary = isHistorySummaryRequest(analysis.effectiveQuestion);
  const pattern = /\b(?:compare|average|pattern|trend|usually|better|worse|over time|correlat)\b/i.test(analysis.effectiveQuestion);
  const historyLookup = /\bwhen\b|\bhistory\b|\brecords?\b|\blogs?\b|\brecent notes?\b/i.test(analysis.effectiveQuestion);
  const analyticsPlan = inferAiAnalyticsPlan(analysis.effectiveQuestion);
  const needsHistory = Boolean(window) || analysis.visualization || analysis.semanticTextAggregate || analysis.wholeHistory || historySummary || pattern || historyLookup;
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
      patternAnalysis: Boolean(analyticsPlan),
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
  assert.equal(result.plan.steps.some(step => step.capability === 'calculate_structured_analytics'), false);
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

test('golden request: terse plural-metrics edits require a reviewable action proposal', () => {
  const result = requestSignals('change metrics for standing calf from 7/15 to 3 sets');
  assert.equal(result.agent, true);
  assert.equal(result.plan.requestedOutputs.actionProposal, true);
  assert.ok(result.plan.steps.some(step => step.capability === 'propose_actions'));
});

test('golden request: targeted laterality search is retrieval, not unsupported derived analytics', () => {
  const result = requestSignals('When have I complained about my left foot? Summarize the main episodes, preserve laterality, and hyperlink every date you discuss.');
  assert.equal(result.analysis.wholeHistory, false);
  assert.equal(result.analysis.visualization, false);
  assert.equal(result.plan.steps.some(step => step.capability === 'calculate_structured_analytics'), false);
  assert.equal(result.plan.steps.some(step => step.capability === 'retrieve_history'), true);
  assert.equal(prefersChronologicalHistoryAnswer(result.analysis.effectiveQuestion), true);
});

test('golden request: doctor-note responses are direct actions, not bulk note scans', () => {
  const question = "Respond to the Nerve issues/EMG doc note by saying I'll do a follow up.";
  assert.equal(isAgentRequest(question), true);
  assert.equal(isBulkNoteAgentRequest(question), false);
});

test('golden request: two-period averages bind both scopes and complete without a model', () => {
  const question = 'what is avg pain score past 7 days and how compare to avg score 7 days before that';
  const scopes = resolveHistoryScopePlan(question, today);
  const analyticsPlan = inferAiAnalyticsPlan(question, scopes?.windows);
  const records = Array.from({ length: 14 }, (_, index) => {
    const date = new Date('2026-07-01T12:00:00Z');
    date.setUTCDate(date.getUTCDate() + index);
    return {
      date: date.toISOString().slice(0, 10), completed: [], exerciseNotes: [], session: null,
      health: { pain: index < 7 ? 4 : 6 },
    };
  });
  const result = analyticsPlan ? executeAiAnalyticsPlan(analyticsPlan, records) : null;
  assert.deepEqual(scopes?.loadWindow && [scopes.loadWindow.startDate, scopes.loadWindow.endDate, scopes.loadWindow.dayCount], ['2026-07-01', '2026-07-14', 14]);
  assert.deepEqual(result?.visualization.type === 'table' ? result.visualization.rows.map(row => row[1]) : [], ['6', '4']);
  assert.match(result ? composeAiAnalyticsAnswer(result) : '', /higher than the previous period by 2/i);
});

test('golden request: weekly averages remain averages when coverage is also requested', () => {
  const question = 'Chart my average pain by week over the last 7 days. State how many days had recorded pain and how missing days were handled.';
  const plan = inferAiAnalyticsPlan(question);
  const values = [6, 6, 6, 5, 5, 4, 3];
  const records = values.map((pain, index) => ({
    date: `2026-06-${String(index + 1).padStart(2, '0')}`, completed: [], exerciseNotes: [], session: null, health: { pain },
  }));
  const result = plan ? executeAiAnalyticsPlan(plan, records) : null;
  assert.equal(plan?.measures[0].aggregation, 'average');
  assert.deepEqual(plan?.requestedCoverage, { observedCount: true, missingCount: true });
  assert.deepEqual(result?.visualization.type === 'line' ? result.visualization.series[0].values : [], [5]);
  assert.equal(result?.coverage.measures[0].observedValues, 7);
  assert.match(result ? composeAiAnalyticsAnswer(result) : '', /7 recorded days? and 0 unlogged days?/i);
});
