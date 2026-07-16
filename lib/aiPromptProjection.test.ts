import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Node's type-stripping test runner requires the explicit extension.
import { aiPromptSystem, projectAiPromptContext, selectAiPromptProfile } from './aiPromptProjection.ts';

test('history questions receive evidence but not unrelated mutation or app configuration payloads', () => {
  const profile = selectAiPromptProfile({ agent: false, hasServerAnalytics: false, usesHistory: true, exercise: false });
  const projected = projectAiPromptContext(profile, {
    question: 'When did I mention my left foot?',
    conversation: Array.from({ length: 10 }, (_, index) => ({ role: 'user', content: String(index) })),
    candidateDays: [{ date: '2026-07-03' }],
    agentActionContract: { huge: true },
    appContext: { widgets: ['all'] },
    relevantExercisesInApp: Array.from({ length: 500 }, () => ({ name: 'unrelated' })),
  });
  assert.equal(profile, 'history-read');
  assert.deepEqual(projected.candidateDays, [{ date: '2026-07-03' }]);
  assert.equal(Array.isArray(projected.conversation) ? projected.conversation.length : 0, 6);
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
