import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Node's type-stripping test runner requires the explicit extension.
import { buildDeterministicAgentFallback } from './aiAgent.ts';

test('builds safe navigation plans for explicit destinations', () => {
  const plan = buildDeterministicAgentFallback({ question: 'Open settings', today: '2026-07-15' });
  assert.equal(plan?.actions[0]?.type, 'navigate');
  assert.equal(plan?.actions[0]?.type === 'navigate' ? plan.actions[0].destination : '', 'settings');
  assert.equal(buildDeterministicAgentFallback({ question: 'What settings are available?', today: '2026-07-15' }), undefined);
});

test('builds bounded numeric health plans on the selected or explicit day', () => {
  const selected = buildDeterministicAgentFallback({
    question: 'Set my pain to 4',
    today: '2026-07-15',
    selectedDate: '2026-07-12',
  });
  assert.deepEqual(selected?.actions[0], {
    id: 'health-1',
    type: 'health_change',
    date: '2026-07-12',
    field: 'pain',
    mode: 'replace',
    value: 4,
    reason: 'You asked to record pain as 4.',
  });

  const explicit = buildDeterministicAgentFallback({
    question: 'Record mood as 5 on July 10',
    today: '2026-07-15',
    selectedDate: '2026-07-12',
    explicitDates: ['2026-07-10'],
  });
  assert.equal(explicit?.actions[0]?.type === 'health_change' ? explicit.actions[0].date : '', '2026-07-10');
});
