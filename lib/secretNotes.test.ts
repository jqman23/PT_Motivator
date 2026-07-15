import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Node's type-stripping test runner requires the explicit extension.
import { extractAiInstructions, parseSecretNote, serializeSecretNote, stripSecretNotes } from './secretNotes.ts';

test('round trips visible text, secret text, and AI instructions in order', () => {
  const blocks = [
    { type: 'text' as const, text: 'Describe my week ' },
    { type: 'ai' as const, text: 'focus on pain and general notes' },
    { type: 'text' as const, text: ' please' },
    { type: 'secret' as const, locked: true, text: 'private detail' },
  ];
  const serialized = serializeSecretNote(blocks);

  assert.deepEqual(parseSecretNote(serialized), blocks);
});

test('extracts normalized AI guidance while visible text excludes every command payload', () => {
  const value = 'Question \u27e6ai\u27e7  look at pain\n and general notes  \u27e6/ai\u27e7 tail \u27e6secret:locked\u27e7private\u27e6/secret\u27e7';

  assert.deepEqual(extractAiInstructions(value), ['look at pain and general notes']);
  assert.equal(stripSecretNotes(value), 'Question  tail');
});

test('does not expose malformed or unterminated command text as an instruction', () => {
  const value = 'Question \u27e6ai\u27e7unfinished';

  assert.deepEqual(extractAiInstructions(value), []);
  assert.equal(stripSecretNotes(value), value);
});
