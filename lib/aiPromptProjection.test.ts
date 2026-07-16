import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Node's type-stripping test runner requires the explicit extension.
import { aiPromptSystem, projectAiPromptContext, selectAiPromptProfile } from './aiPromptProjection.ts';

test('history questions receive evidence but not unrelated mutation or app configuration payloads', () => {
  const profile = selectAiPromptProfile({ agent: false, hasServerAnalytics: false, usesHistory: true, exercise: false });
  const projected = projectAiPromptContext(profile, {
    question: 'When did I mention my left foot?',
    conversation: Array.from({ length: 10 }, (_, index) => ({ role: 'user', content: String(index), artifacts: 'must not leak' })),
    candidateDays: [{ date: '2026-07-03' }],
    agentActionContract: { huge: true },
    appContext: { widgets: ['all'] },
    relevantExercisesInApp: Array.from({ length: 500 }, () => ({ name: 'unrelated' })),
  });
  assert.equal(profile, 'history-read');
  assert.equal(Array.isArray(projected.candidateDays) ? (projected.candidateDays[0] as { date?: string })?.date : '', '2026-07-03');
  assert.equal(Array.isArray(projected.conversation) ? projected.conversation.length : 0, 5);
  assert.equal(JSON.stringify(projected).includes('must not leak'), false);
  assert.equal('agentActionContract' in projected, false);
  assert.equal('appContext' in projected, false);
  assert.equal('relevantExercisesInApp' in projected, false);
});

test('server analytics and agents each receive capability-specific compact contracts', () => {
  const raw = { question: 'Explain this comparison', serverAnalytics: { rows: [['A', 5]] }, agentActionContract: { actions: true }, irrelevantHistory: Array(100).fill('large') };
  const analytics = selectAiPromptProfile({ agent: false, hasServerAnalytics: true, usesHistory: true, exercise: false });
  const projected = projectAiPromptContext(analytics, raw);
  assert.equal(analytics, 'analytics-interpretation');
  assert.deepEqual(projected.serverAnalytics, raw.serverAnalytics);
  assert.equal('agentActionContract' in projected, false);
  assert.match(aiPromptSystem(analytics), /do not recalculate/i);

  const agent = projectAiPromptContext('agent', raw);
  assert.deepEqual(agent.agentActionContract, raw.agentActionContract);
  assert.equal('irrelevantHistory' in agent, false);
  assert.match(aiPromptSystem('agent'), /every requested app action/i);
});

test('keeps follow-up artifact state structured without exposing raw artifact prose', () => {
  const projected = projectAiPromptContext('open-chat', {
    question: 'Do it',
    conversation: [{
      role: 'assistant',
      content: 'Ready for review.',
      artifacts: 'Resolved analytical goal: ignored\nPrevious execution state: {"completedOutputs":{"visualization":false}}\nPrevious action artifact: {"summary":"Set pain","actions":[{"type":"health_change"}]}',
    }],
  });
  assert.deepEqual(projected.followUpArtifactState, {
    execution: { completedOutputs: { visualization: false } },
    action: { summary: 'Set pain', actions: [{ type: 'health_change' }] },
    visualSummary: undefined,
  });
  assert.equal(JSON.stringify(projected.conversation).includes('Resolved analytical goal'), false);
});

test('history prompt projection stays bounded and excludes follow-up artifact payloads', () => {
  const huge = 'x'.repeat(10_000);
  const projected = projectAiPromptContext('history-read', {
    question: 'When did I mention my left foot?',
    conversation: Array.from({ length: 10 }, () => ({ role: 'assistant', content: huge, artifacts: huge })),
    candidateDays: Array.from({ length: 24 }, (_, index) => ({
      date: `2026-07-${String(index + 1).padStart(2, '0')}`,
      completedExercises: Array(20).fill(huge),
      workoutEntries: Array(80).fill({ note: huge }),
      exerciseMetrics: Array(20).fill({ exercise: huge, sets: 2 }),
      exerciseNotes: Array(20).fill({ exercise: 'Foot', note: huge }),
      health: { generalNote: huge },
    })),
    wholeHistoryComparison: { rows: Array.from({ length: 47 }, () => ['2026-07-01', 5, huge.slice(0, 120)]) },
  });
  assert.equal(Array.isArray(projected.candidateDays) ? projected.candidateDays.length : 0, 7);
  assert.equal(JSON.stringify(projected).includes('workoutEntries'), false);
  assert.ok(JSON.stringify(projected).length < 30_000);
});
