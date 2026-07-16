import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Node's type-stripping test runner requires the explicit extension.
import { MAX_AGENT_ACTIONS, buildDeterministicAgentFallback, coalesceAgentActions, normalizeAgentActions, normalizeAgentPlan, normalizeModelAgentPlan } from './aiAgent.ts';

test('normalizes supported actions and rejects malformed targets', () => {
  const actions = normalizeAgentActions([
    { id: 'complete', type: 'completion_set', date: '2026-07-15', exerciseId: 'ankle-band', completed: true },
    { id: 'bad-date', type: 'completion_set', date: '2026-02-30', exerciseId: 'ankle-band', completed: true },
    { id: 'unknown', type: 'run_sql', statement: 'DELETE FROM health_log' },
    { id: 'photo', type: 'photo_attach', target: 'exercise_note', date: '2026-07-15', exerciseId: 'ankle-band', dataUrl: 'not accepted' },
  ]);

  assert.deepEqual(actions.map(action => action.id), ['complete', 'photo']);
  assert.equal(actions[1].type, 'photo_attach');
  assert.equal('dataUrl' in actions[1], false);
});

test('defaults note changes to append and clamps health values', () => {
  const actions = normalizeAgentActions([
    { type: 'exercise_note_change', date: '2026-07-15', exerciseId: 'balance', text: 'Felt steadier.' },
    { type: 'health_change', date: '2026-07-15', field: 'pain', mode: 'append', value: 15 },
    { type: 'health_change', date: '2026-07-15', field: 'general_notes', value: 'Walked outside.' },
  ]);

  assert.equal(actions[0].type, 'exercise_note_change');
  if (actions[0].type === 'exercise_note_change') assert.equal(actions[0].mode, 'append');
  if (actions[1].type === 'health_change') {
    assert.equal(actions[1].mode, 'replace');
    assert.equal(actions[1].value, 10);
  }
  if (actions[2].type === 'health_change') assert.equal(actions[2].mode, 'append');
});

test('keeps action ids unique and bounds oversized plans', () => {
  const plan = normalizeAgentPlan({
    summary: 'Bulk completion update',
    actions: Array.from({ length: MAX_AGENT_ACTIONS + 20 }, (_, index) => ({
      id: 'same-id',
      type: 'completion_set',
      date: `2026-07-${String((index % 15) + 1).padStart(2, '0')}`,
      exerciseId: `exercise-${index}`,
      completed: true,
    })),
  });

  assert.equal(plan?.actions.length, MAX_AGENT_ACTIONS);
  assert.equal(new Set(plan?.actions.map(action => action.id)).size, MAX_AGENT_ACTIONS);
});

test('accepts deterministic bulk rules only with bounded dates and note fields', () => {
  const actions = normalizeAgentActions([
    { type: 'bulk_completion_from_note', exerciseId: 'calf-raise', phrase: 'walk', field: 'general_notes', startDate: '2026-01-01', endDate: '2026-07-15', completed: true },
    { type: 'bulk_completion_from_note', exerciseId: 'calf-raise', phrase: 'x', field: 'general_notes', startDate: '2026-01-01', endDate: '2026-07-15', completed: true },
    { type: 'bulk_completion_from_note', exerciseId: 'calf-raise', phrase: 'walk', field: 'pain', startDate: '2026-01-01', endDate: '2026-07-15', completed: true },
  ]);

  assert.equal(actions.length, 1);
  assert.equal(actions[0].type, 'bulk_completion_from_note');
});

test('requires a meaningful doctor-note patch and an exact navigation destination', () => {
  const actions = normalizeAgentActions([
    { type: 'doctor_note_upsert', mode: 'create', patch: { title: 'Questions for PT', body: 'Ask about stairs.' } },
    { type: 'doctor_note_upsert', mode: 'update', noteId: 'note-1', patch: {} },
    { type: 'navigate', destination: 'doctorNote', noteId: 'note-1' },
    { type: 'navigate', destination: 'doctorNote' },
    { type: 'navigate', destination: 'date' },
    { type: 'navigate', destination: 'arbitrary-css-selector' },
    { type: 'navigate', target: 'settings' },
  ]);

  assert.deepEqual(actions.map(action => action.type), ['doctor_note_upsert', 'navigate', 'navigate']);
  assert.equal(actions[2].type === 'navigate' ? actions[2].destination : '', 'settings');
});

test('bounds colors and media URLs to values the app can render', () => {
  const actions = normalizeAgentActions([
    { type: 'category_upsert', name: 'Pool work', color: 'transparent' },
    {
      type: 'exercise_add',
      exercise: {
        name: 'Pool walk', cat: 'mobility', cue: 'Walk slowly',
        mainImageUrl: 'javascript:alert(1)',
        mainImageUrls: ['https://example.com/a.jpg', 'data:image/png;base64,abc'],
      },
    },
  ]);

  if (actions[0].type === 'category_upsert') assert.equal(actions[0].color, undefined);
  if (actions[1].type === 'exercise_add') {
    assert.equal(actions[1].exercise.mainImageUrl, '');
    assert.deepEqual(actions[1].exercise.mainImageUrls, ['https://example.com/a.jpg']);
  }
});

test('liberally normalizes model aliases across every agent action family', () => {
  const plan = normalizeModelAgentPlan({
    agent_plan: {
      title: 'Review requested changes',
      proposed_actions: [
        { actionType: 'completeExercise', day: 'today', exerciseName: 'Standing Calf Stretch', status: 'checked' },
        { type: 'add_exercise_note', day: 'today', exercise: 'Standing Calf Stretch', note: 'I did 1 set' },
        { type: 'set_health_metric', day: 'today', metric: 'pain score', score: 4 },
        { type: 'update_metrics', day: 'today', exerciseName: 'Standing Calf Stretch', setsCount: 2, repsCount: 10, weightValue: 5, unit: 'lb', multiplier: 2 },
        { type: 'clear_metrics', day: 'today', exerciseName: 'Standing Calf Stretch' },
        { type: 'add_exercise', exercise: { name: 'Pool Walk', category: 'mobility', description: 'Walk slowly in waist-deep water' }, categoryName: 'Mobility' },
        { type: 'edit_exercise', exerciseName: 'Standing Calf Stretch', changes: { sets: '2 x 30 sec' } },
        { type: 'move_exercise', exerciseName: 'Standing Calf Stretch', destination: 'Mobility' },
        { type: 'delete_exercise', exerciseName: 'Standing Calf Stretch' },
        { type: 'add_category', categoryName: 'Pool work', color: 'blue' },
        { type: 'delete_category', name: 'Mobility' },
        { type: 'add_doctor_question', title: 'Questions for PT', question: 'Ask about stairs' },
        { type: 'append_doctor_note', noteTitle: 'PT Questions', content: 'Ask about swelling' },
        { type: 'delete_doctor_note', title: 'PT Questions' },
        { type: 'add_pt_session', date: 'tomorrow', note: 'Morning appointment' },
        { type: 'remove_training_session', date: '7/14' },
        { type: 'hide_widget', widget: 'daily summary' },
        { type: 'change_app_title', value: 'Recovery Board' },
        { type: 'attach_photo', target: 'exercise note', date: 'today', exerciseName: 'Standing Calf Stretch' },
        { type: 'complete_from_note', exerciseName: 'Standing Calf Stretch', match: 'walked', noteField: 'general note', startDate: '2026-07-01', endDate: 'today' },
        { type: 'open_screen', screen: 'settings' },
        { type: 'run_sql', statement: 'DROP TABLE health_log' },
      ],
    },
  }, {
    question: 'Make these changes',
    today: '2026-07-15',
    selectedDate: '2026-07-15',
    exercises: [{ id: 'calf-1', name: 'Standing Calf Stretch' }],
    categories: [{ id: 'mobility-cat', name: 'Mobility' }],
    doctorNotes: [{ id: 'doc-1', title: 'PT Questions' }],
  });

  assert.deepEqual(plan?.actions.map(action => action.type), [
    'completion_set', 'exercise_note_change', 'health_change', 'metrics_set', 'metrics_clear',
    'exercise_add', 'exercise_update', 'exercise_move', 'exercise_remove', 'category_upsert',
    'category_remove', 'doctor_note_upsert', 'doctor_note_upsert', 'doctor_note_remove',
    'pt_session_upsert', 'pt_session_remove', 'widget_set', 'app_title_set', 'photo_attach',
    'bulk_completion_from_note', 'navigate',
  ]);
  assert.equal(plan?.actions[0].type === 'completion_set' ? plan.actions[0].exerciseId : '', 'calf-1');
  assert.equal(plan?.actions[2].type === 'health_change' ? plan.actions[2].field : '', 'pain');
  assert.equal(plan?.actions[15].type === 'pt_session_remove' ? plan.actions[15].kind : '', 'training');
  assert.equal(plan?.actions[16].type === 'widget_set' ? plan.actions[16].enabled : true, false);
});

test('turns an app-ready exercise draft into an add action only for an explicit add command', () => {
  const added = normalizeModelAgentPlan({
    confirmedExercise: { name: 'Pool Walk', cat: 'mobility', cue: 'Walk slowly' },
  }, { question: 'Add this exercise', today: '2026-07-15' });
  const described = normalizeModelAgentPlan({
    confirmedExercise: { name: 'Pool Walk', cat: 'mobility', cue: 'Walk slowly' },
  }, { question: 'Describe this exercise', today: '2026-07-15' });
  assert.equal(added?.actions[0]?.type, 'exercise_add');
  assert.equal(described, undefined);
});

test('builds a dated duration-metric review plan from terse wording plus AI guidance', () => {
  const plan = buildDeterministicAgentFallback({
    question: 'change metrics for standing calf from 7/15 to 3 sets adjust metrics for this exercise to 3 sets 1 min',
    today: '2026-07-16',
    selectedDate: '2026-07-16',
    explicitDates: ['2026-07-15'],
    exercises: [{ id: 'calf-1', name: 'Standing Calf Stretch' }],
  });

  assert.equal(plan?.actions.length, 1);
  const action = plan?.actions[0];
  assert.equal(action?.type, 'metrics_set');
  if (action?.type === 'metrics_set') {
    assert.deepEqual(action, {
      id: 'metrics-1',
      type: 'metrics_set',
      date: '2026-07-15',
      exerciseId: 'calf-1',
      sets: 3,
      reps: null,
      durationSeconds: 60,
      weight: null,
      weightUnit: 'lb',
      scopeMultiplier: 1,
      reason: 'You asked to update Standing Calf Stretch metrics.',
    });
  }
});

test('normalizes common category rename and doctor follow-up shapes', () => {
  const plan = normalizeModelAgentPlan({ actions: [
    { type: 'rename_category', category: 'Mobility', newName: 'Daily Mobility' },
    { type: 'add_follow_up', noteTitle: 'PT Questions', followUp: 'They recommended shorter walks.' },
  ] }, {
    question: 'Rename Mobility and add that follow-up',
    today: '2026-07-15',
    categories: [{ id: 'cat-1', name: 'Mobility' }],
    doctorNotes: [{ id: 'doc-1', title: 'PT Questions' }],
  });

  assert.equal(plan?.actions[0].type === 'category_upsert' ? plan.actions[0].categoryId : '', 'cat-1');
  assert.equal(plan?.actions[0].type === 'category_upsert' ? plan.actions[0].name : '', 'Daily Mobility');
  assert.equal(plan?.actions[1].type === 'doctor_note_upsert' ? plan.actions[1].noteId : '', 'doc-1');
  assert.equal(plan?.actions[1].type === 'doctor_note_upsert' ? plan.actions[1].mode : '', 'append');
  assert.equal(plan?.actions[1].type === 'doctor_note_upsert' ? plan.actions[1].patch.body : '', 'Response - 2026-07-15\nAnswer / notes: They recommended shorter walks.');
});

test('maps provider exercise instruction aliases to visible exercise fields', () => {
  const plan = normalizeModelAgentPlan({ actions: [
    {
      type: 'edit_exercise',
      exerciseName: 'Standing Calf Stretch',
      changes: {
        shortCue: 'Keep the heel down and lean forward.',
        dosage: '2 x 30 sec',
        howTo: '1. Stand facing a wall.\n2. Step one foot back.\n3. Keep the back heel down.',
        image_search: 'standing calf stretch physical therapy',
      },
    },
  ] }, {
    question: 'Update the exercise instructions',
    today: '2026-07-15',
    exercises: [{ id: 'calf-1', name: 'Standing Calf Stretch' }],
  });

  const action = plan?.actions[0];
  assert.equal(action?.type, 'exercise_update');
  if (action?.type === 'exercise_update') {
    assert.deepEqual(action.patch, {
      cue: 'Keep the heel down and lean forward.',
      sets: '2 x 30 sec',
      tips: ['Stand facing a wall.', 'Step one foot back.', 'Keep the back heel down.'],
      imageSearch: 'standing calf stretch physical therapy',
    });
  }
});

test('coalesces compatible edits without losing earlier fields or appended text', () => {
  const actions = normalizeAgentActions([
    { id: 'health-1', type: 'health_change', date: '2026-07-15', field: 'general_notes', mode: 'append', value: 'Walked outside.' },
    { id: 'health-2', type: 'health_change', date: '2026-07-15', field: 'general_notes', mode: 'append', value: 'Used the cane.' },
    { id: 'exercise-1', type: 'exercise_update', exerciseId: 'calf-1', patch: { cue: 'Keep the heel down.' } },
    { id: 'exercise-2', type: 'exercise_update', exerciseId: 'calf-1', patch: { sets: '2 x 30 sec' } },
    { id: 'doctor-1', type: 'doctor_note_upsert', noteId: 'doc-1', mode: 'append', patch: { body: 'Ask about swelling.' } },
    { id: 'doctor-2', type: 'doctor_note_upsert', noteId: 'doc-1', mode: 'update', patch: { pinned: true } },
  ]);
  const coalesced = coalesceAgentActions(actions);

  assert.equal(coalesced.length, 3);
  assert.equal(coalesced[0].type === 'health_change' ? coalesced[0].value : '', 'Walked outside.\nUsed the cane.');
  assert.deepEqual(coalesced[1].type === 'exercise_update' ? coalesced[1].patch : {}, { cue: 'Keep the heel down.', sets: '2 x 30 sec' });
  assert.deepEqual(coalesced[2].type === 'doctor_note_upsert' ? coalesced[2].patch : {}, { body: 'Ask about swelling.', pinned: true });
  assert.equal(coalesced[2].type === 'doctor_note_upsert' ? coalesced[2].mode : '', 'append');
});

test('lets an explicit exercise removal override incompatible move and edit actions', () => {
  const actions = normalizeAgentActions([
    { type: 'exercise_update', exerciseId: 'calf-1', patch: { sets: '2 x 30 sec' } },
    { type: 'exercise_move', exerciseId: 'calf-1', categoryName: 'Mobility' },
    { type: 'exercise_remove', exerciseId: 'calf-1' },
  ]);
  assert.deepEqual(coalesceAgentActions(actions).map(action => action.type), ['exercise_remove']);
});
