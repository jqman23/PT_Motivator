import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Node's type-stripping test runner requires the explicit extension.
import { isAgentRequest, isExerciseCompletionCoverageRequest, isHistoryCorrectionFollowUp, isHistoryScopeFollowUp, isVisualizationRequest, isWholeHistoryComparisonRequest } from './aiRequestIntent.ts';

test('recognizes natural app commands and short follow-ups', () => {
  for (const request of [
    'Log that I completed calf raises today',
    'Record pain as 4 for today',
    'Save this in my general note',
    'Turn off the daily summary widget',
    'Take me to my doctor notes',
    'I completed my balance exercise',
    'Yes, do that',
    'My pain is 4 today',
    'I slept 7.5 hours',
    'Ask my doctor about the swelling',
    'PT session tomorrow',
    '2 sets of 10 reps on calf raises',
    'On [today], mark [prone McKenzie] complete and log [1] set of [12]',
    'I want you to rename my Mobility category',
    'Could you please draft removing tomorrow’s PT session?',
    'I want the timer gone please',
    'No daily summary on the home screen anymore.',
    'Call the app Recovery Board',
    'The app title should be Recovery Board',
    'There should be a PT session tomorrow',
    'Get rid of my training appointment on Friday',
    'Prone McKenzie is done today — 1 x 12, note test',
  ]) assert.equal(isAgentRequest(request), true, request);
});

test('does not turn advice or capability questions into commands', () => {
  for (const request of [
    'Should I add another calf exercise?',
    'How can I record pain more consistently?',
    'What can you change in the app?',
    'Do you recommend turning off reminders?',
    'What should I name the app?',
    'What would happen without the timer?',
  ]) assert.equal(isAgentRequest(request), false, request);
});

test('does not turn explicit no-change corrections into commands', () => {
  for (const request of [
    "Don't update anything—why can't you see my exercises?",
    'Do not change the records; check again.',
    "I'm not asking you to save anything, just answer me.",
  ]) assert.equal(isAgentRequest(request), false, request);
});

test('recognizes completion coverage, correction follow-ups, and visualization requests', () => {
  assert.equal(isExerciseCompletionCoverageRequest('What exercises did I not do at all the past 5 days?'), true);
  assert.equal(isExerciseCompletionCoverageRequest('Which stretches have I never completed this week?'), true);
  assert.equal(isExerciseCompletionCoverageRequest('What exercises did I do?'), false);
  assert.equal(isHistoryCorrectionFollowUp('Look harder'), true);
  assert.equal(isHistoryCorrectionFollowUp("That’s not true, I did plenty of exercises"), true);
  assert.equal(isVisualizationRequest('Visualize my past five days in a table'), true);
});

test('only carries an earlier date window into a genuine follow-up', () => {
  assert.equal(isHistoryScopeFollowUp('Visualize that as a table'), true);
  assert.equal(isHistoryScopeFollowUp('What about energy?'), true);
  assert.equal(isHistoryScopeFollowUp("That's not true—look harder"), true);
  assert.equal(isHistoryScopeFollowUp('What was my worst day ever?'), false);
  assert.equal(isHistoryScopeFollowUp('When did I first mention heel pain?'), false);
});

test('recognizes requests that require comparison across the whole loaded history', () => {
  for (const request of [
    'Look at all sessions. Tell me about my best day.',
    'Which was my worst session overall?',
    'Review everything I have logged.',
    'Use my complete history to answer this.',
    'Analyze my records from the very beginning.',
    'Take every single logged day into account.',
    'Compare them all and tell me what stands out.',
    'Since I started tracking, when was I doing best?',
    'Do not just use the recent days; consider everything.',
    'What was my best day of all time?',
    'Scan each check-in before answering.',
    'Base this on all available saved data.',
  ]) assert.equal(isWholeHistoryComparisonRequest(request), true, request);
});

test('keeps bounded and targeted history questions on retrieval instead of whole-history comparison', () => {
  for (const request of [
    'When did I mention heel burning?',
    'Compare my last seven days.',
    'What happened yesterday?',
    'Find the first day I mentioned stairs.',
    'Summarize this PT session.',
    'Mark Prone McKenzie complete and log 1 set of 12 reps.',
  ]) assert.equal(isWholeHistoryComparisonRequest(request), false, request);
});
