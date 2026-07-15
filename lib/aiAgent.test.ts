import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Node's type-stripping test runner requires the explicit extension.
import { MAX_AGENT_ACTIONS, normalizeAgentActions, normalizeAgentPlan } from './aiAgent.ts';

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
  ]);

  assert.deepEqual(actions.map(action => action.type), ['doctor_note_upsert', 'navigate']);
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
