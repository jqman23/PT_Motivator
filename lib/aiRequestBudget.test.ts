import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Node's type-stripping test runner requires the explicit extension.
import { AI_CLIENT_REQUEST_TIMEOUT_MS, AI_SERVER_REQUEST_BUDGET_MS, AiRequestBudgetError, aiProviderBudget, createAiRequestDeadline } from './aiRequestBudget.ts';

test('server processing budget always ends before the browser timeout', () => {
  assert.ok(AI_SERVER_REQUEST_BUDGET_MS < AI_CLIENT_REQUEST_TIMEOUT_MS);
  assert.equal(createAiRequestDeadline(1_000), 1_000 + AI_SERVER_REQUEST_BUDGET_MS);
});

test('provider calls share the request-wide deadline instead of starting fresh cascades', () => {
  const limits = aiProviderBudget(20_000, {
    maxTotalMs: 15_000,
    attemptTimeoutMs: 9_000,
    maxAttempts: 4,
    reserveMs: 2_000,
    now: 12_000,
  });
  assert.deepEqual(limits, { attemptTimeoutMs: 6_000, totalTimeoutMs: 6_000, maxAttempts: 4, maxAttemptsPerRoute: 2, preserveProviderDiversity: true });
});

test('provider work stops when only response-assembly reserve remains', () => {
  assert.throws(() => aiProviderBudget(20_000, {
    maxTotalMs: 5_000,
    attemptTimeoutMs: 3_000,
    maxAttempts: 2,
    reserveMs: 1_500,
    now: 17_600,
  }), AiRequestBudgetError);
});
