import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Node's type-stripping test runner requires the explicit extension.
import { aiChatPreview, aiChatTitle, normalizeAiChatMessages } from './aiChatHistory.ts';

test('normalizes a restorable AI conversation and removes oversized fields', () => {
  const fullHistoryLabels = Array.from({ length: 47 }, (_, index) => `Day ${index + 1}`);
  const messages = normalizeAiChatMessages([
    { id: 'one', role: 'user', content: '  When did my ankle hurt?  ', aiInstructions: ['focus on pain'] },
    {
      id: 'two',
      role: 'assistant',
      content: 'It was worse on 2026-06-21.',
      reply: {
        answer: 'It was worse on 2026-06-21.',
        options: ['In the morning'],
        dateLinks: [{ date: '2026-06-21', label: 'June 21' }, { date: 'not-a-date', label: 'Bad' }],
        comparedDays: 47,
        model: 'gemini/gemini-3.5-flash',
        providerKey: 'Gemini',
        agentPlanningStatus: 'missing',
        visualizations: [{
          id: 'pain-trend',
          type: 'line',
          title: 'Pain trend',
          labels: fullHistoryLabels,
          series: [{ name: 'Pain', values: fullHistoryLabels.map((_, index) => index % 11), unit: '/10' }],
        }],
      },
    },
    { id: 'bad', role: 'system', content: 'Do not store this.' },
  ]);

  assert.equal(messages.length, 2);
  assert.equal(messages[0].content, 'When did my ankle hurt?');
  assert.deepEqual(messages[1].reply?.dateLinks.map(link => link.date), ['2026-06-21']);
  assert.equal(messages[1].reply?.comparedDays, 47);
  assert.equal(messages[1].reply?.providerKey, 'Gemini');
  assert.equal(messages[1].reply?.agentPlanningStatus, 'missing');
  assert.equal(messages[1].reply?.visualizations?.[0].type, 'line');
  assert.equal(messages[1].reply?.visualizations?.[0].type === 'line' ? messages[1].reply?.visualizations?.[0].labels.length : 0, 47);
});

test('builds useful history titles and previews', () => {
  const messages = normalizeAiChatMessages([
    { id: 'one', role: 'user', content: 'Describe my pain this week' },
    { id: 'two', role: 'assistant', content: 'Pain was highest after PT.' },
  ]);

  assert.equal(aiChatTitle(messages), 'Describe my pain this week');
  assert.equal(aiChatPreview(messages), 'Pain was highest after PT.');
});

test('bounds long conversations to the most recent 100 messages', () => {
  const messages = normalizeAiChatMessages(Array.from({ length: 105 }, (_, index) => ({
    id: String(index),
    role: index % 2 ? 'assistant' : 'user',
    content: `Message ${index}`,
  })));

  assert.equal(messages.length, 100);
  assert.equal(messages[0].id, '5');
  assert.equal(messages.at(-1)?.id, '104');
});

test('persists reviewed agent plans and their apply and undo status', () => {
  const messages = normalizeAiChatMessages([{
    id: 'assistant-action',
    role: 'assistant',
    content: 'I prepared one change.',
    reply: {
      answer: 'I prepared one change.',
      options: [],
      dateLinks: [],
      agentPlan: {
        version: 1,
        summary: 'Complete ankle band',
        actions: [{ id: 'one', type: 'completion_set', date: '2026-07-15', exerciseId: 'ankle-band', completed: true }],
        previewItems: [{ actionId: 'one', title: 'Complete Ankle Band', detail: '7/15/26', risk: 'change' }],
        appliedRunId: 'agent-conversation-message',
        appliedAt: '2026-07-15T12:00:00.000Z',
        appliedActionIds: ['one'],
        undoneAt: '2026-07-15T12:01:00.000Z',
      },
    },
  }]);

  const plan = messages[0].reply?.agentPlan;
  assert.equal(plan?.actions.length, 1);
  assert.equal(plan?.previewItems[0].title, 'Complete Ankle Band');
  assert.deepEqual(plan?.appliedActionIds, ['one']);
  assert.equal(plan?.undoneAt, '2026-07-15T12:01:00.000Z');
});
