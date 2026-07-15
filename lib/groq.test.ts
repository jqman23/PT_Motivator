import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Node's type-stripping test runner requires the explicit extension.
import { callGroqChat, getAiRoutePlan } from './groq.ts';

const providerEnvNames = [
  'CEREBRAS_KEY_PTMOTIVATOR',
  'GEMINI_KEY_PTMOTIVATOR',
  'OPENROUTER_KEY_PTMOTIVATOR',
] as const;

function isolateProviderEnv(values: Partial<Record<(typeof providerEnvNames)[number], string>>) {
  const previous = Object.fromEntries(providerEnvNames.map(name => [name, process.env[name]]));
  for (const name of providerEnvNames) {
    const value = values[name];
    if (value) process.env[name] = value;
    else delete process.env[name];
  }
  return () => {
    for (const name of providerEnvNames) {
      const value = previous[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  };
}

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

test('keeps Gemini out of personal tasks and uses its strongest stable models for public work', () => {
  assert.equal(getAiRoutePlan('ask').some(route => route.provider === 'gemini'), false);
  const publicRoutes = getAiRoutePlan('publicAsk');
  assert.deepEqual(publicRoutes.slice(0, 2).map(route => `${route.provider}/${route.model}`), [
    'gemini/gemini-3.5-flash',
    'gemini/gemini-3.1-flash-lite',
  ]);
});

test('falls from the same flagship model on all Groq keys to Cerebras flagship', async () => {
  const originalFetch = globalThis.fetch;
  const restoreEnv = isolateProviderEnv({ CEREBRAS_KEY_PTMOTIVATOR: 'cerebras-secret' });
  const attempts: Array<{ url: string; model: string; authorization: string }> = [];
  globalThis.fetch = async (input, init) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as { model?: string };
    const headers = init?.headers as Record<string, string>;
    attempts.push({ url: String(input), model: String(body.model ?? ''), authorization: headers.Authorization });
    if (String(input).includes('api.groq.com')) return new Response(JSON.stringify({ error: { message: 'quota' } }), { status: 429 });
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"answer":"ok"}' } }] }), { status: 200 });
  };

  try {
    const result = await callGroqChat([
      { name: 'groq-a', value: 'groq-first' },
      { name: 'groq-b', value: 'groq-second' },
    ], 'ask', { messages: [], response_format: { type: 'json_object' } });
    assert.equal(attempts.length, 3);
    assert.equal(attempts[0].model, 'openai/gpt-oss-120b');
    assert.equal(attempts[1].model, 'openai/gpt-oss-120b');
    assert.match(attempts[2].url, /api\.cerebras\.ai/);
    assert.equal(attempts[2].model, 'gpt-oss-120b');
    assert.equal(attempts[2].authorization, 'Bearer cerebras-secret');
    assert.equal(result.model, 'cerebras/gpt-oss-120b');
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv();
  }
});

test('uses only explicit free OpenRouter models with ZDR and no credit-spending alias', async () => {
  const originalFetch = globalThis.fetch;
  const restoreEnv = isolateProviderEnv({ OPENROUTER_KEY_PTMOTIVATOR: 'openrouter-secret' });
  let requestBody: Record<string, unknown> = {};
  globalThis.fetch = async (input, init) => {
    assert.match(String(input), /openrouter\.ai/);
    requestBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    return new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }), { status: 200 });
  };

  try {
    for (const route of getAiRoutePlan('ask').filter(route => route.provider === 'openrouter')) {
      assert.match(route.model, /:free$/);
    }
    const result = await callGroqChat([], 'ask', {
      messages: [],
      max_completion_tokens: 900,
      response_format: { type: 'json_object' },
    });
    assert.match(String(requestBody.model), /:free$/);
    assert.equal(requestBody.max_tokens, 900);
    assert.equal(requestBody.max_completion_tokens, undefined);
    assert.deepEqual(requestBody.provider, { zdr: true, data_collection: 'deny', allow_fallbacks: true });
    assert.match(result.model, /^openrouter\/.+:free$/);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv();
  }
});

test('normalizes Gemini responses into the existing chat-completion shape', async () => {
  const originalFetch = globalThis.fetch;
  const restoreEnv = isolateProviderEnv({ GEMINI_KEY_PTMOTIVATOR: 'gemini-secret' });
  globalThis.fetch = async (input, init) => {
    assert.match(String(input), /generativelanguage\.googleapis\.com/);
    const headers = init?.headers as Record<string, string>;
    assert.equal(headers['x-goog-api-key'], 'gemini-secret');
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: '{"answer":"Gemini public answer"}' }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 8, totalTokenCount: 20 },
    }), { status: 200 });
  };

  try {
    const result = await callGroqChat([], 'publicAsk', {
      messages: [{ role: 'system', content: 'JSON only' }, { role: 'user', content: 'Public question' }],
      max_completion_tokens: 100,
      response_format: { type: 'json_object' },
    });
    assert.equal(result.model, 'gemini/gemini-3.5-flash');
    assert.equal(result.data.choices[0].message.content, '{"answer":"Gemini public answer"}');
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv();
  }
});
