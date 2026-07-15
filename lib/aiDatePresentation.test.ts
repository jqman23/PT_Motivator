import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Node's type-stripping test runner requires the explicit extension.
import { aiAnswerDateSegments, formatAiDate, isIsoCalendarDate } from './aiDatePresentation.ts';

test('formats dates in the current year without a year', () => {
  assert.equal(formatAiDate('2026-06-21', '2026-07-14'), '6/21');
});

test('includes a short year when the date is from another year', () => {
  assert.equal(formatAiDate('2025-06-21', '2026-07-14'), '6/21/25');
});

test('finds valid ISO dates in answer text without consuming punctuation', () => {
  assert.deepEqual(aiAnswerDateSegments('Pain rose on 2026-06-21, then eased by 2026-06-23.'), [
    { text: 'Pain rose on ' },
    { text: '2026-06-21', date: '2026-06-21' },
    { text: ', then eased by ' },
    { text: '2026-06-23', date: '2026-06-23' },
    { text: '.' },
  ]);
});

test('does not make impossible dates interactive', () => {
  assert.equal(isIsoCalendarDate('2026-02-29'), false);
  assert.deepEqual(aiAnswerDateSegments('The model returned 2026-02-29.'), [
    { text: 'The model returned ' },
    { text: '2026-02-29' },
    { text: '.' },
  ]);
});
