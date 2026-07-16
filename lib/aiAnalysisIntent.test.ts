import assert from 'node:assert/strict';
import test from 'node:test';

// @ts-expect-error Node's type-stripping test runner requires the explicit extension.
import { requestedCategoryCount, resolveAnalysisRequest } from './aiAnalysisIntent.ts';

test('AI guidance participates in visualization intent on the first turn', () => {
  const result = resolveAnalysisRequest(
    'Count how often I mentioned each symptom',
    ['I want a simple chart or table showing every category and its count.'],
    [],
  );
  assert.equal(result.visualization, true);
  assert.equal(result.semanticTextAggregate, true);
  assert.equal(result.wholeHistory, true);
  assert.equal(result.inheritedGoal, false);
});

test('artifact-only follow-up inherits the prior analytical subject', () => {
  const result = resolveAnalysisRequest('I want a table or visualization', [], [
    { role: 'user', content: 'Count how many times I mentioned each pain location', aiInstructions: [] },
    { role: 'assistant', content: 'Here is what stood out.', artifacts: 'No visualization was returned.' },
  ]);
  assert.equal(result.visualization, true);
  assert.equal(result.semanticTextAggregate, true);
  assert.equal(result.inheritedGoal, true);
  assert.match(result.effectiveQuestion, /pain location/i);
});

test('frustrated correction keeps the original goal instead of becoming a generic dashboard', () => {
  const result = resolveAnalysisRequest('That is not the chart I asked for. You output dates and sleep.', [], [
    { role: 'user', content: 'Show a table counting every phrase I used for each medication' },
    { role: 'assistant', content: 'Here is a daily overview.', artifacts: 'Table columns: Date, Pain, Sleep' },
  ]);
  assert.equal(result.semanticTextAggregate, true);
  assert.equal(result.visualization, true);
  assert.match(result.effectiveQuestion, /each medication/i);
});

test('an explicit new bounded scope overrides inherited whole-history scope', () => {
  const result = resolveAnalysisRequest('Do the same table for the past 5 days', [], [
    { role: 'user', content: 'Across my entire history, count each symptom mention in a table' },
  ]);
  assert.equal(result.visualization, true);
  assert.equal(result.wholeHistory, false);
});

test('extracts a generic explicitly requested group size without domain rules', () => {
  assert.equal(requestedCategoryCount('Show each of my ten categories'), 10);
  assert.equal(requestedCategoryCount('Count all 12 medications'), 12);
  assert.equal(requestedCategoryCount('Look at the past 5 days'), undefined);
});

test('recovers a resolved goal from assistant artifact metadata after the original turn falls outside recent history', () => {
  const result = resolveAnalysisRequest('Still nothing. Try again.', [], [
    { role: 'assistant', content: 'I could not make the artifact.', artifacts: 'Resolved analytical goal: Count every phrase used for each treatment in a table\nPrevious artifact: none' },
    { role: 'user', content: 'Look at the whole range' },
    { role: 'assistant', content: 'I still could not make it.' },
  ]);
  assert.equal(result.inheritedGoal, true);
  assert.equal(result.semanticTextAggregate, true);
  assert.match(result.effectiveQuestion, /each treatment/i);
});

test('inherits a visible unanswered first turn after a failed request', () => {
  const result = resolveAnalysisRequest('do what i asked', [], [
    {
      role: 'user',
      content: 'I want to know the frequency of times I have mentioned my ten categories',
      aiInstructions: ['I refer to the categories in different ways. Show the ten categories and counts in a compact table.'],
    },
  ]);
  assert.equal(result.inheritedGoal, true);
  assert.equal(result.semanticTextAggregate, true);
  assert.equal(result.visualization, true);
  assert.equal(result.requestedCategoryCount, 10);
});

test('corrective advice follow-ups retain the original conversational goal', () => {
  const history = [
    { role: 'user' as const, content: "What treatment do you recommend for my bike fall given today's notes?" },
    { role: 'assistant' as const, content: 'Which doctor note should I update?' },
    { role: 'user' as const, content: 'No, I want your recommendations' },
    { role: 'assistant' as const, content: 'Here are some general recommendations.' },
    { role: 'user' as const, content: 'Ten hours later it still hurts when I put pressure on my leg.' },
    { role: 'assistant' as const, content: 'Please provide a doctor-note ID.' },
    { role: 'user' as const, content: 'Why would you ask for a doctor-note ID?' },
    { role: 'assistant' as const, content: 'The app needs an ID.' },
  ];
  const result = resolveAnalysisRequest('I AM ASKING FOR YOUR ADVICE', [], history);
  assert.equal(result.inheritedGoal, true);
  assert.match(result.effectiveQuestion, /treatment do you recommend/i);
  assert.doesNotMatch(result.anchorQuestion ?? '', /doctor-note id/i);
});

test('verification and reasoning-method follow-ups retain the original analytical goal', () => {
  const history = [
    { role: 'user' as const, content: 'Compare my left and right heel symptoms over the whole history and chart them.' },
    { role: 'assistant' as const, content: 'Here is the comparison.' },
  ];
  const verification = resolveAnalysisRequest('triple check', [], history);
  const reasoning = resolveAnalysisRequest('Use AI to interpret it', [], history);
  assert.equal(verification.inheritedGoal, true);
  assert.equal(reasoning.inheritedGoal, true);
  assert.match(verification.effectiveQuestion, /left and right heel/i);
  assert.match(reasoning.effectiveQuestion, /left and right heel/i);
});
