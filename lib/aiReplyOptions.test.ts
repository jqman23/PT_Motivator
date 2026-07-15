import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Node's type-stripping test runner requires the explicit extension.
import { normalizeAiReplyOptions } from './aiReplyOptions.ts';

test('keeps user reply choices and removes assistant questions', () => {
  assert.deepEqual(normalizeAiReplyOptions([
    'Where does it hurt?',
    'It happens while walking',
    'Mostly afterward',
    'Describe how it feels',
    'Rate your pain from zero to ten',
    'I am not sure yet',
  ]), ['It happens while walking', 'Mostly afterward', 'I am not sure yet']);
});

test('normalizes, deduplicates, and bounds reply choices', () => {
  assert.deepEqual(normalizeAiReplyOptions([
    '  Mostly in the morning  ',
    'mostly in the morning',
    'After exercise',
    'At rest',
    'During PT',
    'One extra',
  ]), ['Mostly in the morning', 'After exercise', 'At rest', 'During PT']);
});
