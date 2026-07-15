import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Node's type-stripping test runner requires the explicit extension.
import { callGroqChat } from './groq.ts';

test('exhausts API keys for the preferred model before trying a fallback model', async () => {
  const originalFetch = globalThis.fetch;
  const attempts: Array<{ model: string; authorization: string }> = [];
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as { model?: string };
    const headers = init?.headers as Record<string, string>;
    attempts.push({ model: String(body.model ?? ''), authorization: headers.Authorization });
    if (attempts.length === 1) return new Response(JSON.stringify({ error: { message: 'rate limited' } }), { status: 429, statusText: 'Too Many Requests' });
    return new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }), { status: 200 });
  };

  try {
    const result = await callGroqChat([
      { name: 'key-1', value: 'first' },
      { name: 'key-2', value: 'second' },
    ], 'ask', { messages: [] });
    assert.equal(attempts.length, 2);
    assert.equal(attempts[0].model, attempts[1].model);
    assert.equal(attempts[0].authorization, 'Bearer first');
    assert.equal(attempts[1].authorization, 'Bearer second');
    assert.equal(result.model, attempts[0].model);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
