import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Node's type-stripping test runner requires the explicit extension.
import { sectionJumpMode } from './sectionJump.ts';

test('keeps one toolbar slot and swaps its destination only after mobile scrolling', () => {
  assert.equal(sectionJumpMode(false, 2_000, 800), 'health');
  assert.equal(sectionJumpMode(true, 719, 800), 'health');
  assert.equal(sectionJumpMode(true, 720, 800), 'top');
  assert.equal(sectionJumpMode(true, 900, 0), 'top');
});
