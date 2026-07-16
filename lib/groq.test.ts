import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Node's type-stripping test runner requires the explicit extension.
import { callGroqChat, getAiRoutePlan, GroqRouteError } from './groq.ts';

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
      { name: 'GROQ_KEY_PTMOTIVATOR', value: 'first' },
      { name: 'GROQ_KEY2_PTMOTIVATOR', value: 'second' },
    ], 'ask', { messages: [] });
    assert.equal(attempts.length, 2);
    assert.equal(attempts[0].model, attempts[1].model);
    assert.equal(attempts[0].authorization, 'Bearer first');
    assert.equal(attempts[1].authorization, 'Bearer second');
    assert.equal(result.model, attempts[0].model);
    assert.equal(result.providerKey, 'Groq 2');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('uses task-specific Gemini capacity and leads direct action planning with the strongest structured model', () => {
  assert.equal(getAiRoutePlan('ask').some(route => route.provider === 'gemini'), true);
  assert.deepEqual(getAiRoutePlan('agent').slice(0, 2).map(route => `${route.provider}/${route.model}`), [
    'gemini/gemini-3.5-flash',
    'groq/openai/gpt-oss-120b',
  ]);
  const publicRoutes = getAiRoutePlan('publicAsk');
  assert.deepEqual(publicRoutes.slice(0, 2).map(route => `${route.provider}/${route.model}`), [
    'gemini/gemini-3.5-flash',
    'gemini/gemini-3.1-flash-lite',
  ]);
  assert.equal(getAiRoutePlan('agent').at(-1)?.model, 'gemma-4-31b');
  assert.equal(getAiRoutePlan('log')[0]?.model, 'gemini-3.1-flash-lite');
  assert.deepEqual(new Set(getAiRoutePlan('ask').map(route => route.provider)), new Set(['groq', 'cerebras', 'gemini', 'openrouter']));
  assert.equal(getAiRoutePlan('semantic').find(route => route.provider === 'groq')?.model, 'meta-llama/llama-4-scout-17b-16e-instruct');
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
    assert.equal(result.providerKey, 'Cerebras');
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv();
  }
});

test('uses only explicit free OpenRouter models and no credit-spending alias', async () => {
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
      assert.notEqual(route.model, 'openrouter/free');
    }
    assert.equal(getAiRoutePlan('publicAsk').some(route => route.model === 'openrouter/free'), false);
    const result = await callGroqChat([], 'ask', {
      messages: [],
      max_completion_tokens: 900,
      response_format: { type: 'json_object' },
    });
    assert.match(String(requestBody.model), /:free$/);
    assert.equal(requestBody.max_tokens, 900);
    assert.equal(requestBody.max_completion_tokens, undefined);
    assert.deepEqual(requestBody.provider, { allow_fallbacks: true });
    assert.match(result.model, /^openrouter\/.+:free$/);
    assert.equal(result.providerKey, 'OpenRouter');
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
    assert.equal(result.providerKey, 'Gemini');
    assert.equal(result.data.choices[0].message.content, '{"answer":"Gemini public answer"}');
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv();
  }
});

test('rejects JSON that only claims success without an action draft and continues to another provider', async () => {
  const originalFetch = globalThis.fetch;
  const restoreEnv = isolateProviderEnv({ CEREBRAS_KEY_PTMOTIVATOR: 'cerebras-secret' });
  const attempts: string[] = [];
  globalThis.fetch = async (input) => {
    attempts.push(String(input));
    if (String(input).includes('api.groq.com')) {
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"answer":"I drafted the change for you."}' } }] }), { status: 200 });
    }
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"agentPlan":{"actions":[{"type":"widget_set"}]}}' } }] }), { status: 200 });
  };

  try {
    const result = await callGroqChat([
      { name: 'GROQ_KEY_PTMOTIVATOR', value: 'groq-secret-1' },
      { name: 'GROQ_KEY2_PTMOTIVATOR', value: 'groq-secret-2' },
    ], 'ask', {
      messages: [], response_format: { type: 'json_object' },
    }, { requireAgentDraft: true });
    assert.equal(attempts.length, 2);
    assert.equal(result.model, 'cerebras/gpt-oss-120b');
    assert.deepEqual(result.attemptedModels, ['openai/gpt-oss-120b']);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv();
  }
});

test('rejects an empty semantic visual response and continues to another provider', async () => {
  const originalFetch = globalThis.fetch;
  const restoreEnv = isolateProviderEnv({ CEREBRAS_KEY_PTMOTIVATOR: 'visual-cerebras-secret' });
  const attempts: string[] = [];
  globalThis.fetch = async (input) => {
    attempts.push(String(input));
    if (String(input).includes('api.groq.com')) {
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"answer":"Here are the counts.","visualizations":[]}' } }] }), { status: 200 });
    }
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"visualizations":[{"type":"table","title":"Mention counts","columns":["Item","Mentions"],"rows":[["Primary symptom","3"]]}]}' } }] }), { status: 200 });
  };

  try {
    const result = await callGroqChat([
      { name: 'visual-groq-1', value: 'visual-groq-secret-1' },
      { name: 'visual-groq-2', value: 'visual-groq-secret-2' },
    ], 'ask', {
      messages: [], response_format: { type: 'json_object' },
    }, { requireVisualizationDraft: true });
    assert.equal(attempts.length, 2);
    assert.equal(result.model, 'cerebras/gpt-oss-120b');
    assert.deepEqual(result.attemptedModels, ['openai/gpt-oss-120b']);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv();
  }
});

test('rejects a generic daily visual when a semantic aggregate visual is required', async () => {
  const originalFetch = globalThis.fetch;
  const restoreEnv = isolateProviderEnv({ CEREBRAS_KEY_PTMOTIVATOR: 'semantic-cerebras-secret' });
  const attempts: string[] = [];
  globalThis.fetch = async (input) => {
    attempts.push(String(input));
    if (String(input).includes('api.groq.com')) {
      return new Response(JSON.stringify({
        choices: [{
          message: {
            content: '{"visualizations":[{"type":"table","title":"47-day pattern overview","columns":["Date","Recorded activity","Pain","Sleep"],"rows":[["2026-07-15","Bike","5","7"]]}]}',
          },
        }],
      }), { status: 200 });
    }
    return new Response(JSON.stringify({
      choices: [{
        message: {
          content: '{"visualizations":[{"type":"table","title":"Mention counts","columns":["Category","Mentions"],"rows":[["Left region",3],["Right region",0]]}]}',
        },
      }],
    }), { status: 200 });
  };

  try {
    const result = await callGroqChat([
      { name: 'semantic-groq-1', value: 'semantic-groq-secret-1' },
      { name: 'semantic-groq-2', value: 'semantic-groq-secret-2' },
    ], 'ask', {
      messages: [], response_format: { type: 'json_object' },
    }, { requireSemanticAggregateDraft: true });
    assert.equal(attempts.length, 2);
    assert.equal(result.model, 'cerebras/gpt-oss-120b');
    assert.deepEqual(result.attemptedModels, ['openai/gpt-oss-120b']);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv();
  }
});

test('accepts a semantic count table with a domain-specific label column', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{
      message: {
        content: '{"visualizations":[{"type":"table","title":"Symptom mention counts","columns":["Symptom","Mentions"],"rows":[["Morning stiffness",3],["Evening ache",0]]}]}',
      },
    }],
  }), { status: 200 });

  try {
    const result = await callGroqChat([
      { name: 'semantic-groq-1', value: 'semantic-groq-secret-1' },
    ], 'ask', {
      messages: [], response_format: { type: 'json_object' },
    }, { requireSemanticAggregateDraft: true });
    assert.equal(result.model, 'openai/gpt-oss-120b');
    assert.deepEqual(result.attemptedModels, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('requires source-linked drilldowns when evidence-backed aggregation is requested', async () => {
  const originalFetch = globalThis.fetch;
  const restoreEnv = isolateProviderEnv({ CEREBRAS_KEY_PTMOTIVATOR: 'evidence-cerebras-secret' });
  const attempts: string[] = [];
  globalThis.fetch = async input => {
    attempts.push(String(input));
    const content = String(input).includes('api.groq.com')
      ? '{"visualizations":[{"type":"table","title":"Counts","columns":["Category","Mentions"],"rows":[["Area A",2]]}]}'
      : '{"visualizations":[{"type":"table","title":"Counts","columns":["Category","Mentions"],"rows":[["Area A",2]],"drilldowns":[{"label":"Area A","items":[{"sourceId":"day:field:0","excerpt":"Area A twice","match":"Area A"}]}]}]}';
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
  };

  try {
    const result = await callGroqChat([{ name: 'evidence-groq', value: 'evidence-groq-secret' }], 'ask', {
      messages: [], response_format: { type: 'json_object' },
    }, { requireEvidenceBackedSemanticAggregateDraft: true });
    assert.equal(attempts.length, 2);
    assert.equal(result.model, 'cerebras/gpt-oss-120b');
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv();
  }
});

test('a timed-out model moves to another model instead of burning alternate keys', async () => {
  const originalFetch = globalThis.fetch;
  const attempts: Array<{ model: string; authorization: string }> = [];
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as { model?: string };
    const headers = init?.headers as Record<string, string>;
    attempts.push({ model: String(body.model ?? ''), authorization: headers.Authorization });
    if (attempts.length === 1) {
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Timed out', 'AbortError')), { once: true });
      });
    }
    return new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }), { status: 200 });
  };

  try {
    const result = await callGroqChat([
      { name: 'timeout-key-1', value: 'timeout-first' },
      { name: 'timeout-key-2', value: 'timeout-second' },
    ], 'rerank', { messages: [] }, { attemptTimeoutMs: 1_000, totalTimeoutMs: 4_000, maxAttempts: 2 });
    assert.equal(attempts.length, 2);
    assert.notEqual(attempts[0].model, attempts[1].model);
    assert.equal(attempts[0].authorization, 'Bearer timeout-first');
    assert.equal(attempts[1].authorization, 'Bearer timeout-first');
    assert.equal(result.attemptedModels.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('the provider cascade obeys a request-wide maximum attempt count', async () => {
  const originalFetch = globalThis.fetch;
  let attempts = 0;
  globalThis.fetch = async () => {
    attempts += 1;
    return new Response(JSON.stringify({ error: { message: 'quota' } }), { status: 429, statusText: 'Too Many Requests' });
  };

  try {
    await assert.rejects(() => callGroqChat([
      { name: 'budget-key-1', value: 'budget-first' },
      { name: 'budget-key-2', value: 'budget-second' },
      { name: 'budget-key-3', value: 'budget-third' },
    ], 'rerank', { messages: [] }, { maxAttempts: 2, totalTimeoutMs: 5_000 }), GroqRouteError);
    assert.equal(attempts, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('a diversity-first budget reaches Cerebras before retrying duplicate Groq keys', async () => {
  const originalFetch = globalThis.fetch;
  const restoreEnv = isolateProviderEnv({ CEREBRAS_KEY_PTMOTIVATOR: 'diversity-cerebras-secret' });
  const attempts: Array<{ url: string; model: string }> = [];
  globalThis.fetch = async (input, init) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as { model?: string };
    attempts.push({ url: String(input), model: String(body.model ?? '') });
    if (String(input).includes('api.groq.com')) {
      return new Response(JSON.stringify({ error: { message: 'quota' } }), { status: 429, statusText: 'Too Many Requests' });
    }
    return new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }), { status: 200 });
  };

  try {
    const result = await callGroqChat([
      { name: 'diversity-groq-1', value: 'diversity-first' },
      { name: 'diversity-groq-2', value: 'diversity-second' },
      { name: 'diversity-groq-3', value: 'diversity-third' },
      { name: 'diversity-groq-4', value: 'diversity-fourth' },
    ], 'ask', { messages: [], response_format: { type: 'json_object' } }, {
      maxAttempts: 4,
      maxAttemptsPerRoute: 2,
      preserveProviderDiversity: true,
      totalTimeoutMs: 5_000,
    });
    assert.equal(attempts.length, 2);
    assert.match(attempts[0].url, /groq/i);
    assert.match(attempts[1].url, /cerebras/i);
    assert.equal(result.model, 'cerebras/gpt-oss-120b');
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv();
  }
});

test('four rate-limited Groq keys cannot prevent a configured Gemini route from succeeding', async () => {
  const originalFetch = globalThis.fetch;
  const restoreEnv = isolateProviderEnv({ GEMINI_KEY_PTMOTIVATOR: 'diversity-gemini-secret' });
  const attemptedUrls: string[] = [];
  globalThis.fetch = async input => {
    attemptedUrls.push(String(input));
    if (String(input).includes('api.groq.com')) {
      return new Response(JSON.stringify({ error: { message: 'quota' } }), { status: 429, statusText: 'Too Many Requests' });
    }
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: '{"answer":"Gemini answered"}' }] }, finishReason: 'STOP' }],
    }), { status: 200 });
  };

  try {
    const result = await callGroqChat([
      { name: 'gemini-failover-groq-1', value: 'groq-1' },
      { name: 'gemini-failover-groq-2', value: 'groq-2' },
      { name: 'gemini-failover-groq-3', value: 'groq-3' },
      { name: 'gemini-failover-groq-4', value: 'groq-4' },
    ], 'ask', { messages: [], response_format: { type: 'json_object' } }, {
      maxAttempts: 4,
      maxAttemptsPerRoute: 2,
      preserveProviderDiversity: true,
      totalTimeoutMs: 5_000,
    });
    assert.equal(attemptedUrls.length, 2);
    assert.match(attemptedUrls[0], /groq/i);
    assert.match(attemptedUrls[1], /googleapis/i);
    assert.equal(result.model, 'gemini/gemini-3.5-flash');
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv();
  }
});

test('a timed-out first provider preserves time and attempts for another provider', async () => {
  const originalFetch = globalThis.fetch;
  const restoreEnv = isolateProviderEnv({ CEREBRAS_KEY_PTMOTIVATOR: 'timeout-cerebras-secret' });
  const attemptedUrls: string[] = [];
  globalThis.fetch = async (input, init) => {
    attemptedUrls.push(String(input));
    if (String(input).includes('api.groq.com')) {
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Timed out', 'AbortError')), { once: true });
      });
    }
    return new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }), { status: 200 });
  };

  try {
    const result = await callGroqChat([{ name: 'timeout-diversity-groq', value: 'timeout-groq' }], 'ask', { messages: [], response_format: { type: 'json_object' } }, {
      attemptTimeoutMs: 1_000,
      totalTimeoutMs: 4_000,
      maxAttempts: 3,
      preserveProviderDiversity: true,
    });
    assert.equal(attemptedUrls.length, 2);
    assert.match(attemptedUrls[1], /cerebras/i);
    assert.equal(result.model, 'cerebras/gpt-oss-120b');
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv();
  }
});

test('genuine first-pass failure records distinct providers and honors a smaller global limit', async () => {
  const originalFetch = globalThis.fetch;
  const restoreEnv = isolateProviderEnv({
    CEREBRAS_KEY_PTMOTIVATOR: 'all-fail-cerebras',
    GEMINI_KEY_PTMOTIVATOR: 'all-fail-gemini',
    OPENROUTER_KEY_PTMOTIVATOR: 'all-fail-openrouter',
  });
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: 'unavailable' } }), { status: 503, statusText: 'Service Unavailable' });

  try {
    let fullError: GroqRouteError | null = null;
    try {
      await callGroqChat([{ name: 'all-fail-groq', value: 'all-fail-groq-secret' }], 'ask', { messages: [] }, {
        maxAttempts: 4,
        preserveProviderDiversity: true,
        totalTimeoutMs: 5_000,
      });
    } catch (error) {
      if (error instanceof GroqRouteError) fullError = error;
    }
    assert.ok(fullError);
    assert.deepEqual(new Set(fullError.attempts.map(attempt => attempt.provider)), new Set(['groq', 'cerebras', 'gemini', 'openrouter']));

    let smallError: GroqRouteError | null = null;
    try {
      await callGroqChat([{ name: 'small-budget-groq', value: 'small-budget-groq-secret' }], 'ask', { messages: [] }, {
        maxAttempts: 2,
        preserveProviderDiversity: true,
        totalTimeoutMs: 5_000,
      });
    } catch (error) {
      if (error instanceof GroqRouteError) smallError = error;
    }
    assert.ok(smallError);
    assert.equal(smallError.attempts.length, 2);
    assert.equal(new Set(smallError.attempts.map(attempt => attempt.provider)).size, 2);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv();
  }
});
