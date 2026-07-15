import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Node's type-stripping test runner requires the explicit extension.
import { isAgentRequest, isWholeHistoryComparisonRequest } from './aiRequestIntent.ts';

test('recognizes natural app commands and short follow-ups', () => {
  for (const request of [
    'Log that I completed calf raises today',
    'Record pain as 4 for today',
    'Save this in my general note',
    'Turn off the daily summary widget',
    'Take me to my doctor notes',
    'I completed my balance exercise',
    'Yes, do that',
  ]) assert.equal(isAgentRequest(request), true, request);
});

test('does not turn advice or capability questions into commands', () => {
  for (const request of [
    'Should I add another calf exercise?',
    'How can I record pain more consistently?',
    'What can you change in the app?',
    'Do you recommend turning off reminders?',
  ]) assert.equal(isAgentRequest(request), false, request);
});

test('recognizes requests that require comparison across the whole loaded history', () => {
  assert.equal(isWholeHistoryComparisonRequest('Look at all sessions. Tell me about my best day.'), true);
  assert.equal(isWholeHistoryComparisonRequest('Which was my worst session overall?'), true);
  assert.equal(isWholeHistoryComparisonRequest('When did I mention heel burning?'), false);
});
