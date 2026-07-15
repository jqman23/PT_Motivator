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

test('builds widget and app-title setting plans without depending on model JSON', () => {
  const widget = buildDeterministicAgentFallback({ question: 'Hide the daily summary widget', today: '2026-07-15' });
  const title = buildDeterministicAgentFallback({ question: 'Change the app title to Recovery Board', today: '2026-07-15' });
  assert.equal(widget?.actions[0]?.type, 'widget_set');
  assert.equal(widget?.actions[0]?.type === 'widget_set' ? widget.actions[0].key : '', 'dailySummary');
  assert.equal(widget?.actions[0]?.type === 'widget_set' ? widget.actions[0].enabled : true, false);
  assert.equal(title?.actions[0]?.type === 'app_title_set' ? title.actions[0].title : '', 'Recovery Board');
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

test('builds a compound completion and appended-note plan for an exact exercise match', () => {
  const plan = buildDeterministicAgentFallback({
    question: 'for today check off standing calf stretch and add a note that i did 1 set',
    today: '2026-07-15',
    selectedDate: '2026-07-15',
    explicitDates: ['2026-07-15'],
    exercises: [{ id: 'standing-calf-stretch', name: 'Standing Calf Stretch' }],
  });

  assert.deepEqual(plan?.actions.map(action => action.type), ['completion_set', 'exercise_note_change']);
  assert.equal(plan?.actions[0]?.type === 'completion_set' ? plan.actions[0].exerciseId : '', 'standing-calf-stretch');
  assert.equal(plan?.actions[1]?.type === 'exercise_note_change' ? plan.actions[1].text : '', 'i did 1 set');
});

test('does not infer completion when the user only asks to append a note about doing a set', () => {
  const plan = buildDeterministicAgentFallback({
    question: 'Add a note to Standing Calf Stretch that I did 1 set',
    today: '2026-07-15',
    exercises: [{ id: 'standing-calf-stretch', name: 'Standing Calf Stretch' }],
  });
  assert.deepEqual(plan?.actions.map(action => action.type), ['exercise_note_change']);
});

test('uses the previous user instruction to resolve a terse note follow-up', () => {
  const plan = buildDeterministicAgentFallback({
    question: 'Today, add note for standing calf stretch, today, and make a note.',
    today: '2026-07-15',
    selectedDate: '2026-07-15',
    explicitDates: ['2026-07-15'],
    exercises: [{ id: 'standing-calf-stretch', name: 'Standing Calf Stretch' }],
    priorUserMessages: ['For today check off Standing Calf Stretch and add a note that I did 1 set'],
  });
  assert.deepEqual(plan?.actions.map(action => action.type), ['exercise_note_change']);
  assert.equal(plan?.actions[0]?.type === 'exercise_note_change' ? plan.actions[0].text : '', 'I did 1 set');
});

test('builds PT and training session plans from natural schedule statements', () => {
  const pt = buildDeterministicAgentFallback({
    question: 'I have a PT session tomorrow', today: '2026-07-15', explicitDates: ['2026-07-16'],
  });
  const training = buildDeterministicAgentFallback({
    question: 'Remove my training session on 7/14', today: '2026-07-15', explicitDates: ['2026-07-14'],
  });
  assert.equal(pt?.actions[0]?.type, 'pt_session_upsert');
  assert.equal(pt?.actions[0]?.type === 'pt_session_upsert' ? pt.actions[0].date : '', '2026-07-16');
  assert.equal(training?.actions[0]?.type, 'pt_session_remove');
});

test('builds exercise metric set and clear plans from natural values', () => {
  const set = buildDeterministicAgentFallback({
    question: 'Log 2 sets of 10 reps at 5 lb for Standing Calf Stretch today',
    today: '2026-07-15', exercises: [{ id: 'calf-1', name: 'Standing Calf Stretch' }],
  });
  const clear = buildDeterministicAgentFallback({
    question: 'Clear the metrics for Standing Calf Stretch today',
    today: '2026-07-15', exercises: [{ id: 'calf-1', name: 'Standing Calf Stretch' }],
  });
  assert.equal(set?.actions[0]?.type, 'metrics_set');
  assert.equal(set?.actions[0]?.type === 'metrics_set' ? set.actions[0].reps : 0, 10);
  assert.equal(clear?.actions[0]?.type, 'metrics_clear');
});

test('builds an exact-name destructive exercise removal only for the exercise itself', () => {
  const exercise = { id: 'calf-1', name: 'Standing Calf Stretch' };
  const removeExercise = buildDeterministicAgentFallback({
    question: 'Remove the exercise Standing Calf Stretch', today: '2026-07-15', exercises: [exercise],
  });
  const removeMetrics = buildDeterministicAgentFallback({
    question: 'Remove the metrics for Standing Calf Stretch', today: '2026-07-15', exercises: [exercise],
  });
  assert.equal(removeExercise?.actions[0]?.type, 'exercise_remove');
  assert.equal(removeMetrics?.actions[0]?.type, 'metrics_clear');
});

test('builds append and clear plans for health note fields', () => {
  const append = buildDeterministicAgentFallback({
    question: 'Add to my pain note that my heel burned after walking', today: '2026-07-15',
  });
  const clear = buildDeterministicAgentFallback({
    question: 'Clear my general note today', today: '2026-07-15',
  });
  assert.equal(append?.actions[0]?.type === 'health_change' ? append.actions[0].field : '', 'pain_notes');
  assert.equal(append?.actions[0]?.type === 'health_change' ? append.actions[0].value : '', 'my heel burned after walking');
  assert.equal(clear?.actions[0]?.type === 'health_change' ? clear.actions[0].mode : '', 'replace');
});

test('builds doctor questions and exact-note follow-ups', () => {
  const question = buildDeterministicAgentFallback({
    question: 'Remind me to ask my PT whether I should shorten my walks.',
    today: '2026-07-15',
  });
  const followUp = buildDeterministicAgentFallback({
    question: 'Add a follow-up to PT Questions saying they recommended shorter walks.',
    today: '2026-07-15',
    doctorNotes: [{ id: 'doc-1', title: 'PT Questions' }],
  });

  assert.equal(question?.actions[0]?.type, 'doctor_note_upsert');
  assert.equal(question?.actions[0]?.type === 'doctor_note_upsert' ? question.actions[0].mode : '', 'create');
  assert.equal(followUp?.actions[0]?.type === 'doctor_note_upsert' ? followUp.actions[0].noteId : '', 'doc-1');
  assert.equal(followUp?.actions[0]?.type === 'doctor_note_upsert' ? followUp.actions[0].patch.body : '', 'they recommended shorter walks');
});
