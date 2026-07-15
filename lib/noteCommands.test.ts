import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Node's type-stripping test runner requires the explicit extension.
import { applyNoteSlashCommand, NOTE_SLASH_COMMANDS } from './noteCommands.ts';

test('converts /secret without requiring a trailing space', () => {
  const result = applyNoteSlashCommand([{ type: 'text', text: '/secret' }]);

  assert.equal(result.changed, true);
  assert.equal(result.commandName, 'secret');
  assert.equal(result.insertedBlockIndex, 0);
  assert.deepEqual(result.blocks, [{ type: 'secret', locked: false, text: '' }]);
});

test('preserves exactly one existing line break before a command', () => {
  const result = applyNoteSlashCommand([{ type: 'text', text: 'before\n/secret' }]);

  assert.deepEqual(result.blocks, [
    { type: 'text', text: 'before\n' },
    { type: 'secret', locked: false, text: '' },
  ]);
});

test('accepts pasted command content as the initial secret text', () => {
  const result = applyNoteSlashCommand([{ type: 'text', text: '/secret private detail' }]);

  assert.deepEqual(result.blocks, [{ type: 'secret', locked: false, text: 'private detail' }]);
});

test('converts commands after sentence whitespace but leaves slash text inside words alone', () => {
  const middle = applyNoteSlashCommand([{ type: 'text' as const, text: 'before /secret' }]);
  const insideWord = [{ type: 'text' as const, text: 'before/secret' }];
  const unknown = [{ type: 'text' as const, text: '/future-command' }];

  assert.deepEqual(middle.blocks, [
    { type: 'text', text: 'before ' },
    { type: 'secret', locked: false, text: '' },
  ]);
  assert.deepEqual(applyNoteSlashCommand(insideWord), { blocks: insideWord, changed: false });
  assert.deepEqual(applyNoteSlashCommand(unknown), { blocks: unknown, changed: false });
});

test('keeps existing block object identity for future command metadata', () => {
  const existing = { type: 'secret' as const, locked: true, text: 'saved', id: 'internal-id' };
  const result = applyNoteSlashCommand([existing, { type: 'text', text: '/secret' }]);

  assert.equal(result.blocks[0], existing);
  assert.equal(NOTE_SLASH_COMMANDS.some(command => command.name === 'secret'), true);
});

test('turns /ai guidance in the middle of a sentence into an editable instruction block', () => {
  const result = applyNoteSlashCommand([{ type: 'text', text: 'Describe my pain the past 7 days /ai look at pain and general notes' }]);

  assert.equal(result.changed, true);
  assert.equal(result.commandName, 'ai');
  assert.deepEqual(result.blocks, [
    { type: 'text', text: 'Describe my pain the past 7 days ' },
    { type: 'ai', text: 'look at pain and general notes' },
  ]);
});

test('converts /ai on any line of a longer draft and preserves later lines', () => {
  const result = applyNoteSlashCommand([{ type: 'text', text: 'A long first line\nPain summary /ai focus on pain notes\nKeep this final line' }]);

  assert.deepEqual(result.blocks, [
    { type: 'text', text: 'A long first line\nPain summary ' },
    { type: 'ai', text: 'focus on pain notes' },
    { type: 'text', text: '\nKeep this final line' },
  ]);
});

test('recognizes a command after punctuation but not inside a word', () => {
  const punctuation = applyNoteSlashCommand([{ type: 'text', text: 'Pain was worse./ai review general notes' }]);
  const insideWord = [{ type: 'text' as const, text: 'plain/ai text' }];

  assert.deepEqual(punctuation.blocks, [
    { type: 'text', text: 'Pain was worse.' },
    { type: 'ai', text: 'review general notes' },
  ]);
  assert.deepEqual(applyNoteSlashCommand(insideWord), { blocks: insideWord, changed: false });
});
