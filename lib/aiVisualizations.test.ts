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

test('accepts a one-category bar chart without pretending it is a trend', () => {
  const visuals = normalizeAiVisualizations([{
    type: 'bar',
    title: 'Only tracked exercise',
    labels: ['Bike'],
    series: [{ name: 'Recorded days', values: [4] }],
  }]);
  assert.equal(visuals[0].type, 'bar');
  assert.deepEqual(visuals[0].type === 'bar' ? visuals[0].labels : [], ['Bike']);
});

test('keeps model visuals compact by default and preserves explicitly bounded full-history visuals', () => {
  const labels = Array.from({ length: 47 }, (_, index) => `Day ${index + 1}`);
  const source = [{
    type: 'line',
    title: 'Complete history',
    labels,
    series: [{ name: 'Pain', values: labels.map((_, index) => index % 11) }],
  }];

  const compact = normalizeAiVisualizations(source);
  const complete = normalizeAiVisualizations(source, { maxPoints: labels.length });

  assert.equal(compact[0].type === 'line' ? compact[0].labels.length : 0, 31);
  assert.equal(complete[0].type === 'line' ? complete[0].labels.length : 0, 47);
  assert.equal(complete[0].type === 'line' ? complete[0].series[0].values.length : 0, 47);
});
