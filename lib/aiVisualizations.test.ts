import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Node's type-stripping test runner requires the explicit extension.
import { normalizeAiVisualizations } from './aiVisualizations.ts';

test('normalizes bounded table and chart visualizations', () => {
  const visuals = normalizeAiVisualizations([
    {
      id: 'five-days',
      type: 'table',
      title: 'Five-day overview',
      columns: ['Date', 'Exercises', 'Pain'],
      rows: [['7/10', 'Bike', 6], ['7/11', 'Calf raise', 5.5]],
    },
    {
      type: 'line',
      title: 'Pain and energy',
      labels: ['7/10', '7/11'],
      series: [
        { name: 'Pain', values: [6, 5.5], unit: '/10' },
        { name: 'Energy', values: [4.5, 4] },
      ],
    },
  ]);

  assert.equal(visuals.length, 2);
  assert.equal(visuals[0].type, 'table');
  assert.deepEqual(visuals[0].type === 'table' ? visuals[0].rows[0] : [], ['7/10', 'Bike', '6']);
  assert.equal(visuals[1].type, 'line');
});

test('rejects malformed or unbounded visual payloads', () => {
  const visuals = normalizeAiVisualizations([
    { type: 'table', title: 'Missing rows', columns: ['A', 'B'] },
    { type: 'line', title: 'Bad chart', labels: ['A'], series: [] },
    { type: 'pie', title: 'Unsupported', labels: ['A', 'B'] },
  ]);
  assert.deepEqual(visuals, []);
});
