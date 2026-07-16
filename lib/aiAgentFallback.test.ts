import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Node's type-stripping test runner requires the explicit extension.
import { buildDeterministicAgentFallback, requiredAgentActionSlots, validateAgentPlanAgainstSlots } from './aiAgent.ts';

test('builds safe navigation plans for explicit destinations', () => {
  const plan = buildDeterministicAgentFallback({ question: 'Open settings', today: '2026-07-15' });
  assert.equal(plan?.actions[0]?.type, 'navigate');
  assert.equal(plan?.actions[0]?.type === 'navigate' ? plan.actions[0].destination : '', 'settings');
  assert.equal(buildDeterministicAgentFallback({ question: 'What settings are available?', today: '2026-07-15' }), undefined);
});

test('builds widget and app-title setting plans without depending on model JSON', () => {
  const widget = buildDeterministicAgentFallback({ question: 'Hide the daily summary widget', today: '2026-07-15' });
  const timer = buildDeterministicAgentFallback({
    question: 'Customize my app by [hiding the timer]. Exact change: hide timer',
    today: '2026-07-15',
  });
  const calendar = buildDeterministicAgentFallback({ question: 'Turn off calendar', today: '2026-07-15' });
  const title = buildDeterministicAgentFallback({ question: 'Change the app title to Recovery Board', today: '2026-07-15' });
  const desiredTimer = buildDeterministicAgentFallback({ question: 'I want the timer gone please', today: '2026-07-15' });
  const terseSummary = buildDeterministicAgentFallback({ question: 'Daily summary off', today: '2026-07-15' });
  const desiredTitle = buildDeterministicAgentFallback({ question: 'The app title should be Recovery Board', today: '2026-07-15' });
  assert.equal(widget?.actions[0]?.type, 'widget_set');
  assert.equal(widget?.actions[0]?.type === 'widget_set' ? widget.actions[0].key : '', 'dailySummary');
  assert.equal(widget?.actions[0]?.type === 'widget_set' ? widget.actions[0].enabled : true, false);
  assert.deepEqual(timer?.actions[0], {
    id: 'widget-1',
    type: 'widget_set',
    key: 'timer',
    enabled: false,
    reason: 'You asked to hide Timer.',
  });
  assert.equal(calendar?.actions[0]?.type === 'widget_set' ? calendar.actions[0].key : '', 'calendar');
  assert.equal(calendar?.actions[0]?.type === 'widget_set' ? calendar.actions[0].enabled : true, false);
  assert.equal(title?.actions[0]?.type === 'app_title_set' ? title.actions[0].title : '', 'Recovery Board');
  assert.equal(desiredTimer?.actions[0]?.type === 'widget_set' ? desiredTimer.actions[0].enabled : true, false);
  assert.equal(terseSummary?.actions[0]?.type === 'widget_set' ? terseSummary.actions[0].key : '', 'dailySummary');
  assert.equal(desiredTitle?.actions[0]?.type === 'app_title_set' ? desiredTitle.actions[0].title : '', 'Recovery Board');
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

test('compiles a filled workout starter into every requested review action', () => {
  const plan = buildDeterministicAgentFallback({
    question: 'On [today], mark [prone McKenzie] complete. Log [1] sets of [12] with [weight, if any], and add this note: [test].',
    today: '2026-07-15',
    selectedDate: '2026-07-15',
    explicitDates: ['2026-07-15'],
    exercises: [
      { id: 'mckenzie', name: 'Prone McKenzie Extension' },
      { id: 'prone-leg', name: 'Prone Leg Raise' },
    ],
  });

  assert.deepEqual(plan?.actions.map(action => action.type), ['completion_set', 'exercise_note_change', 'metrics_set']);
  assert.equal(plan?.actions[0].type === 'completion_set' ? plan.actions[0].exerciseId : '', 'mckenzie');
  assert.equal(plan?.actions[1].type === 'exercise_note_change' ? plan.actions[1].text : '', 'test');
  assert.deepEqual(plan?.actions[2].type === 'metrics_set' ? {
    sets: plan.actions[2].sets,
    reps: plan.actions[2].reps,
    weight: plan.actions[2].weight,
  } : {}, { sets: 1, reps: 12, weight: null });
});

test('does not guess when a partial exercise name matches multiple exercises equally', () => {
  const plan = buildDeterministicAgentFallback({
    question: 'Mark calf stretch complete today',
    today: '2026-07-15',
    exercises: [
      { id: 'standing', name: 'Standing Calf Stretch' },
      { id: 'wall', name: 'Wall Calf Stretch' },
    ],
  });
  assert.equal(plan, undefined);
});

test('compiles every filled wellness starter field and ignores untouched placeholders', () => {
  const filled = buildDeterministicAgentFallback({
    question: 'For [today], set my pain to [6], energy to [4.5], mood to [5], and sleep to [7]. Add this health note: [Feet were sore].',
    today: '2026-07-15', explicitDates: ['2026-07-15'],
  });
  assert.deepEqual(filled?.actions.map(action => action.type), [
    'health_change', 'health_change', 'health_change', 'health_change', 'health_change',
  ]);
  assert.deepEqual(filled?.actions.map(action => action.type === 'health_change' ? [action.field, action.value] : []), [
    ['sleep_hours', 7], ['pain', 6], ['energy', 4.5], ['mood', 5], ['general_notes', 'Feet were sore'],
  ]);

  const untouched = buildDeterministicAgentFallback({
    question: 'For [date], set my pain to [0–10], energy to [0–10], mood to [0–10], and sleep to [hours]. Add this health note: [details].',
    today: '2026-07-15',
  });
  assert.equal(untouched, undefined);
});

test('compiles and merges independent action clauses without treating note text as an exercise target', () => {
  const context = {
    question: 'For today, set pain to 6, add the health note “Pain increased while walking,” and mark my calf raises complete.',
    today: '2026-07-15',
    explicitDates: ['2026-07-15'],
    exercises: [
      { id: 'walk', name: 'Walk' },
      { id: 'calf-raises', name: 'Calf Raises' },
    ],
  };
  const plan = buildDeterministicAgentFallback(context);
  const slots = requiredAgentActionSlots(context);
  assert.deepEqual(plan?.actions.map(action => action.type), ['health_change', 'health_change', 'completion_set']);
  assert.deepEqual(plan?.actions.filter(action => action.type === 'health_change').map(action => [action.field, action.value]), [
    ['pain', 6],
    ['general_notes', 'Pain increased while walking'],
  ]);
  assert.equal(plan?.actions[2]?.type === 'completion_set' ? plan.actions[2].exerciseId : '', 'calf-raises');
  assert.equal(slots.length, 3);
  assert.ok(validateAgentPlanAgainstSlots(plan, slots));
  assert.equal(validateAgentPlanAgainstSlots({
    version: 1,
    summary: 'Wrong extra target',
    actions: [...(plan?.actions ?? []), { id: 'wrong', type: 'completion_set', date: '2026-07-15', exerciseId: 'walk', completed: true }],
  }, slots), undefined);
});

test('compiles filled doctor, scheduling, exercise-management, and navigation starters', () => {
  const doctor = buildDeterministicAgentFallback({
    question: 'Create a [symptom] doctor note titled [Heel burning] for [Dr. Fox]. Include: [Burning after standing]. Link it to [today].',
    today: '2026-07-15', explicitDates: ['2026-07-15'],
  });
  const session = buildDeterministicAgentFallback({
    question: 'Please [add] a [PT] session on [today] with this note: [Board prep].',
    today: '2026-07-15', explicitDates: ['2026-07-15'],
  });
  const edit = buildDeterministicAgentFallback({
    question: 'Please [edit] [Standing Calf Stretch]. Details: [cue Keep heel down, sets 2 x 30 sec, tips Stop if sharp].',
    today: '2026-07-15', exercises: [{ id: 'calf', name: 'Standing Calf Stretch' }],
  });
  const navigate = buildDeterministicAgentFallback({
    question: 'Take me to [Standing Calf Stretch].',
    today: '2026-07-15', exercises: [{ id: 'calf', name: 'Standing Calf Stretch' }],
  });

  assert.equal(doctor?.actions[0].type, 'doctor_note_upsert');
  assert.equal(doctor?.actions[0].type === 'doctor_note_upsert' ? doctor.actions[0].patch.body : '', 'Burning after standing');
  assert.equal(session?.actions[0].type === 'pt_session_upsert' ? session.actions[0].note : '', 'Board prep');
  assert.deepEqual(edit?.actions.map(action => action.type), ['exercise_update']);
  assert.equal(navigate?.actions[0].type === 'navigate' ? navigate.actions[0].exerciseId : '', 'calf');
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

test('compiles desired-state workout wording without relying on a specific command sentence', () => {
  const plan = buildDeterministicAgentFallback({
    question: 'Prone McKenzie is done today — 1 x 12, note test',
    today: '2026-07-15',
    exercises: [{ id: 'mckenzie', name: 'Prone McKenzie Extension' }],
  });
  assert.deepEqual(plan?.actions.map(action => action.type), ['completion_set', 'exercise_note_change', 'metrics_set']);
  assert.equal(plan?.actions[1]?.type === 'exercise_note_change' ? plan.actions[1].text : '', 'test');
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
  assert.equal(followUp?.actions[0]?.type === 'doctor_note_upsert' ? followUp.actions[0].patch.body : '', 'Response - 2026-07-15\nAnswer / notes: they recommended shorter walks');
});

test('creates doctor notes without user-supplied IDs and preserves the original correction goal', () => {
  const original = 'create a doc note for dr fox i want to ask him about my upcoming emg';
  const created = buildDeterministicAgentFallback({ question: original, today: '2026-07-16' });
  const corrected = buildDeterministicAgentFallback({
    question: 'No in the app i want you to create a doc note',
    today: '2026-07-16',
    priorUserMessages: [original, 'i dont know what that means just create the note'],
  });
  for (const plan of [created, corrected]) {
    const action = plan?.actions[0];
    assert.equal(action?.type, 'doctor_note_upsert');
    if (action?.type !== 'doctor_note_upsert') continue;
    assert.equal(action.mode, 'create');
    assert.equal(action.noteId, undefined);
    assert.equal(action.patch.title, 'Upcoming EMG');
    assert.match(action.patch.provider ?? '', /dr\.? fox/i);
    assert.match(action.patch.body ?? '', /upcoming emg/i);
  }
});

test('appends a requested response to a doctor note resolved by a unique topic token', () => {
  const original = 'the doc note about emg answer it by saying ill do a follow up';
  const context = {
    today: '2026-07-16',
    doctorNotes: [{ id: 'emg-note', title: 'Nerve issues/EMG' }],
  };
  const direct = buildDeterministicAgentFallback({ question: original, ...context });
  const correction = buildDeterministicAgentFallback({
    question: 'DO IT UPDATE THAT response',
    priorUserMessages: [original, 'no im saying i need you to answer it for me'],
    ...context,
  });
  for (const plan of [direct, correction]) {
    const action = plan?.actions[0];
    assert.equal(action?.type, 'doctor_note_upsert');
    if (action?.type !== 'doctor_note_upsert') continue;
    assert.equal(action.mode, 'append');
    assert.equal(action.noteId, 'emg-note');
    assert.equal(action.patch.body, 'Response - 2026-07-16\nAnswer / notes: ill do a follow up');
  }
});

test('builds category and photo actions without relying on a model', () => {
  const rename = buildDeterministicAgentFallback({
    question: 'Rename the category Lower Body to Ankle and Leg',
    today: '2026-07-15',
    categories: [{ id: 'lower', name: 'Lower Body' }],
  });
  const exercisePhoto = buildDeterministicAgentFallback({
    question: 'Attach a photo to Standing Calf Stretch today',
    today: '2026-07-15',
    exercises: [{ id: 'calf', name: 'Standing Calf Stretch' }],
  });
  const doctorPhoto = buildDeterministicAgentFallback({
    question: 'Add a photo to PT Questions',
    today: '2026-07-15',
    doctorNotes: [{ id: 'pt-questions', title: 'PT Questions' }],
  });

  assert.deepEqual(rename?.actions[0], {
    id: 'category-rename-1', type: 'category_upsert', categoryId: 'lower', name: 'Ankle and Leg', color: undefined, reason: 'You asked to rename Lower Body.',
  });
  assert.equal(exercisePhoto?.actions[0]?.type === 'photo_attach' ? exercisePhoto.actions[0].exerciseId : '', 'calf');
  assert.equal(doctorPhoto?.actions[0]?.type === 'photo_attach' ? doctorPhoto.actions[0].noteId : '', 'pt-questions');
});
