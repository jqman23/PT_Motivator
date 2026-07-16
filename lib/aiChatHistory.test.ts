import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Node's type-stripping test runner requires the explicit extension.
import { aiChatArchiveDebugBundle, aiChatArchiveTranscript, aiChatDebugBundle, aiChatPreview, aiChatTitle, aiChatTranscript, normalizeAiChatMessages } from './aiChatHistory.ts';

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
        debug: {
          requestId: 'iad1::abc', build: 'abc123', normalizedQuestion: 'Show all pain',
          intents: { agent: false, visualization: true, semanticTextAggregate: false, wholeHistory: true, boundedWindow: false, pattern: true },
          historyScope: { mode: 'whole', startDate: '2026-06-01', endDate: '2026-07-15', loadedDays: 47 },
          visualization: { source: 'deterministic', firstPassCount: 1, deterministicCount: 1, repairedCount: 0, finalCount: 1 },
          attemptedModels: ['model-before-fallback'],
        },
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
  assert.equal(messages[1].reply?.debug?.historyScope?.mode, 'whole');
  assert.equal(messages[1].reply?.debug?.visualization?.source, 'deterministic');
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

test('copies a portable transcript with complete chart and table source data', () => {
  const messages = normalizeAiChatMessages([
    { id: 'user', role: 'user', content: 'Show my patterns', aiInstructions: ['Use full history'] },
    {
      id: 'assistant', role: 'assistant', content: 'Here are the patterns.', reply: {
        answer: 'Here are the patterns.', options: [], dateLinks: [], model: 'model-a', providerKey: 'Gemini',
        visualizations: [
          { type: 'line', title: 'Pain and sleep', labels: ['7/14', '7/15'], series: [{ name: 'Pain', unit: '/10', values: [6, 5] }, { name: 'Sleep', unit: 'hours', values: [7, null] }] },
          { type: 'table', title: 'Mentions', columns: ['Region', 'Count'], rows: [['Left side', '3'], ['Right side', '2']], drilldowns: [
            { label: 'Left side', items: [{ date: '2026-07-15', source: 'Pain note', excerpt: 'Left side hurt', match: 'Left side', count: 1 }] },
            { label: 'Right side', items: [] },
          ] },
        ],
      },
    },
  ]);

  const transcript = aiChatTranscript(messages);
  assert.match(transcript, /AI guidance:\n- Use full history/);
  assert.match(transcript, /Label\tPain \(\/10\)\tSleep \(hours\)/);
  assert.match(transcript, /7\/15\t5\t—/);
  assert.match(transcript, /Region\tCount\nLeft side\t3\nRight side\t2/);
  assert.match(transcript, /Evidence behind counts:[\s\S]*2026-07-15 · Pain note · matched "Left side" · excerpt "Left side hurt"/);
  assert.match(transcript, /Model: model-a · Gemini/);

  const debug = JSON.parse(aiChatDebugBundle(messages, 'conversation-1')) as Record<string, unknown>;
  assert.equal(debug.format, 'pt-motivator-ai-debug-v1');
  assert.equal(debug.conversationId, 'conversation-1');
  assert.equal(Array.isArray(debug.messages), true);
  assert.match(String(debug.transcript), /Left side\t3/);

  const archiveSession = [{
    id: 'conversation-1', title: 'Patterns', preview: 'Here are the patterns.', messageCount: messages.length,
    createdAt: '2026-07-15T12:00:00.000Z', updatedAt: '2026-07-15T12:01:00.000Z', messages,
  }];
  assert.match(aiChatArchiveTranscript(archiveSession), /CHAT 1: Patterns/);
  const archiveDebug = JSON.parse(aiChatArchiveDebugBundle(archiveSession)) as Record<string, unknown>;
  assert.equal(archiveDebug.format, 'pt-motivator-ai-debug-archive-v1');
  assert.equal(archiveDebug.sessionCount, 1);
});
