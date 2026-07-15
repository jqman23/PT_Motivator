import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Node's type-stripping test runner requires the explicit extension.
import { isDirectBackdropInteraction } from './modalInteraction.ts';

test('closes only for a direct backdrop interaction', () => {
  const backdrop = new EventTarget();
  const modalContent = new EventTarget();

  assert.equal(isDirectBackdropInteraction(backdrop, backdrop), true);
  assert.equal(isDirectBackdropInteraction(modalContent, backdrop), false);
  assert.equal(isDirectBackdropInteraction(null, backdrop), false);
});
