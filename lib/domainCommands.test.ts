import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Node's type-stripping test runner requires the explicit extension.
import { DOMAIN_COMMAND_REGISTRY, domainCommandsForAgentActions, isDomainDate } from './domainCommands.ts';

test('AI actions map to stable domain commands instead of persistence tables', () => {
  const commands = domainCommandsForAgentActions([
    { id: 'one', type: 'health_change', date: '2026-07-15', field: 'pain', mode: 'replace', value: 6, reason: 'Record pain' },
    { id: 'two', type: 'metrics_clear', date: '2026-07-15', exerciseId: 'bike', reason: 'Clear metrics' },
    { id: 'three', type: 'navigate', destination: 'calendar', reason: 'Open calendar' },
  ]);
  assert.deepEqual(commands, ['record_health_observation', 'set_exercise_metrics']);
  assert.equal(DOMAIN_COMMAND_REGISTRY.record_health_observation.targetCallers.includes('ui'), true);
  assert.equal(DOMAIN_COMMAND_REGISTRY.record_health_observation.targetCallers.includes('ai'), true);
  assert.equal(DOMAIN_COMMAND_REGISTRY.record_health_observation.implementation, 'shared-validation');
});

test('shared domain date validation rejects impossible calendar dates', () => {
  assert.equal(isDomainDate('2026-07-15'), true);
  assert.equal(isDomainDate('2026-02-30'), false);
  assert.equal(isDomainDate('7/15/2026'), false);
});
