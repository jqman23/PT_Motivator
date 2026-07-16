export type GroqTask = 'agent' | 'ask' | 'publicAsk' | 'rerank' | 'log' | 'edit' | 'enhance' | 'standardize' | 'summary';

export type GroqApiKey = {
  name: string;
  value: string;
};

type Attempt = {
  provider: AiProvider;
  model: string;
  keyName: string;
  status: number;
  statusText: string;
  detail: string;
};

type GroqErrorPayload = {
  error: string;
  detail: string;
  provider?: AiProvider;
  groqStatus?: number;
  groqStatusText?: string;
  model: string;
  attemptedModels: string[];
  attempts?: Attempt[];
  hint?: string;
};

const ALLOWED_GROQ_MODELS = new Set([
  'canopylabs/orpheus-arabic-saudi',
  'canopylabs/orpheus-v1-english',
  'groq/compound',
  'groq/compound-mini',
  'llama-3.1-8b-instant',
  'llama-3.3-70b-versatile',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'meta-llama/llama-prompt-guard-2-22m',
  'meta-llama/llama-prompt-guard-2-86m',
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'openai/gpt-oss-safeguard-20b',
  'qwen/qwen3-32b',
  'qwen/qwen3.6-27b',
  'whisper-large-v3',
  'whisper-large-v3-turbo',
]);

type AiProvider = 'groq' | 'cerebras' | 'gemini' | 'openrouter';

type AiRoute = {
  provider: AiProvider;
  model: string;
  jsonMode: boolean;
};

const CEREBRAS_PRODUCTION_MODEL = 'gpt-oss-120b';
const CEREBRAS_PREVIEW_MODEL = 'gemma-4-31b';
const CEREBRAS_SHORT_CONTEXT_MODEL = 'zai-glm-4.7';

const GEMINI_PUBLIC_MODELS = [
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
  'gemma-4-31b-it',
  'gemma-4-26b-it',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
];

// Every OpenRouter entry is deliberately free. Do not add a paid model or an unqualified
// alias here: the account credit unlocks the higher free-model request allowance, but the
// application must not consume that balance. Strong JSON-capable models lead the list.
const OPENROUTER_FREE_MODELS: Array<{ model: string; jsonMode: boolean }> = [
  { model: 'qwen/qwen3-next-80b-a3b-instruct:free', jsonMode: true },
  { model: 'nvidia/nemotron-3-super-120b-a12b:free', jsonMode: true },
  { model: 'google/gemma-4-31b-it:free', jsonMode: true },
  { model: 'nvidia/nemotron-3-ultra-550b-a55b:free', jsonMode: false },
  { model: 'nousresearch/hermes-3-llama-3.1-405b:free', jsonMode: false },
  { model: 'meta-llama/llama-3.3-70b-instruct:free', jsonMode: false },
  { model: 'google/gemma-4-26b-a4b-it:free', jsonMode: true },
  { model: 'openai/gpt-oss-20b:free', jsonMode: true },
  { model: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', jsonMode: false },
  { model: 'tencent/hy3:free', jsonMode: false },
  { model: 'poolside/laguna-m.1:free', jsonMode: false },
  { model: 'cohere/north-mini-code:free', jsonMode: false },
  { model: 'poolside/laguna-xs-2.1:free', jsonMode: false },
  { model: 'nvidia/nemotron-3-nano-30b-a3b:free', jsonMode: false },
  { model: 'nvidia/nemotron-nano-12b-v2-vl:free', jsonMode: false },
  { model: 'nvidia/nemotron-nano-9b-v2:free', jsonMode: false },
  { model: 'meta-llama/llama-3.2-3b-instruct:free', jsonMode: false },
];
const disabledKeys = new Set<string>();
const cooldowns = new Map<string, number>();

export class GroqRouteError extends Error {
  attempts: Attempt[];
  status: number;
  statusText: string;
  detail: string;
  model: string;
  provider: AiProvider;

  constructor(message: string, attempts: Attempt[]) {
    super(message);
    this.name = 'GroqRouteError';
    this.attempts = attempts;
    const last = attempts[attempts.length - 1];
    this.status = last?.status ?? 500;
    this.statusText = last?.statusText ?? '';
    this.detail = last?.detail ?? message;
    this.model = last?.model ?? '';
    this.provider = last?.provider ?? 'groq';
  }
}

const PERSONAL_ASSISTANT_CHAIN = [
  'openai/gpt-oss-120b',
  'llama-3.3-70b-versatile',
  'qwen/qwen3-32b',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'openai/gpt-oss-20b',
  'qwen/qwen3.6-27b',
  'llama-3.1-8b-instant',
];

const PUBLIC_ASSISTANT_CHAIN = [
  'groq/compound-mini',
  'groq/compound',
  ...PERSONAL_ASSISTANT_CHAIN,
];

const DEFAULT_MODEL_CHAINS: Record<GroqTask, string[]> = {
  // Direct commands get their own route so structured planners can lead without consuming the
  // scarce strongest-model quota for every conversational history question.
  agent: PERSONAL_ASSISTANT_CHAIN,

  // Personal history, symptoms, and day logs stay on standard hosted models. Compound can invoke
  // external tools, so it is reserved for clearly non-personal public/general questions.
  ask: PERSONAL_ASSISTANT_CHAIN,
  publicAsk: PUBLIC_ASSISTANT_CHAIN,

  // Scout receives only compact, preselected history candidates and returns date IDs.
  rerank: ['meta-llama/llama-4-scout-17b-16e-instruct', 'openai/gpt-oss-20b', 'qwen/qwen3-32b', 'llama-3.3-70b-versatile'],

  // Smart Add needs good JSON and decent reasoning, but it runs more often than Enhance.
  log: ['openai/gpt-oss-20b', 'qwen/qwen3-32b', 'llama-3.1-8b-instant', 'llama-3.3-70b-versatile'],

  // Custom edit previews are small and structured.
  edit: ['openai/gpt-oss-20b', 'qwen/qwen3-32b', 'llama-3.1-8b-instant', 'llama-3.3-70b-versatile'],

  // Enhance is lower volume and benefits from richer output, but still has many fallbacks.
  enhance: ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile', 'qwen/qwen3-32b', 'meta-llama/llama-4-scout-17b-16e-instruct', 'openai/gpt-oss-20b', 'llama-3.1-8b-instant'],

  // Note cleanup historically preferred 70b. Preserve that behavior before broader fallbacks.
  standardize: ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'qwen/qwen3-32b', 'meta-llama/llama-4-scout-17b-16e-instruct', 'openai/gpt-oss-20b', 'llama-3.1-8b-instant'],

  // Tiny daily recap: keep it cheap and avoid competing with heavier routes.
  summary: ['llama-3.1-8b-instant', 'openai/gpt-oss-20b', 'qwen/qwen3-32b', 'llama-3.3-70b-versatile'],
};

function cleanText(value: unknown, limit = 900) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function unique(values: string[]) {
  const seen = new Set<string>();
  return values.filter(value => {
    const clean = value.trim();
    if (!clean || seen.has(clean)) return false;
    seen.add(clean);
    return true;
  });
}

function envList(name: string) {
  return (process.env[name] ?? '')
    .split(',')
    .map(item => item.trim())
    .filter(item => ALLOWED_GROQ_MODELS.has(item))
    .filter(Boolean);
}

export function getGroqModelChain(task: GroqTask) {
  const upper = task.toUpperCase();
  const specificList = envList(`GROQ_MODELS_PTMOTIVATOR_${upper}`);
  const specificSingle = envList(`GROQ_MODEL_PTMOTIVATOR_${upper}`);
  const globalList = envList('GROQ_MODELS_PTMOTIVATOR');
  const legacySingle = envList('GROQ_MODEL_PTMOTIVATOR');

  // Specific env vars go first if present. The legacy single model remains only as a fallback
  // so one old env var does not force every task onto the same rate-limited model. Standardize
  // is the exception because its former standalone route used that variable as its primary model.
  return unique([
    ...specificList,
    ...specificSingle,
    ...(task === 'standardize' ? legacySingle : []),
    ...DEFAULT_MODEL_CHAINS[task],
    ...globalList,
    ...(task === 'standardize' ? [] : legacySingle),
  ]);
}

export function getGroqApiKeys(): GroqApiKey[] {
  const configured = [
    { name: 'GROQ_KEY_PTMOTIVATOR', value: process.env.GROQ_KEY_PTMOTIVATOR },
    { name: 'GROQ_KEY2_PTMOTIVATOR', value: process.env.GROQ_KEY2_PTMOTIVATOR },
    { name: 'GROQ_KEY3_PTMOTIVATOR', value: process.env.GROQ_KEY3_PTMOTIVATOR },
    { name: 'GROQ_KEY4_PTMOTIVATOR', value: process.env.GROQ_KEY4_PTMOTIVATOR },
  ];
  const seen = new Set<string>();

  return configured.flatMap(({ name, value }) => {
    const clean = value?.trim();
    if (!clean || seen.has(clean)) return [];
    seen.add(clean);
    return [{ name, value: clean }];
  });
}

function providerKeys(provider: AiProvider, groqKeys: GroqApiKey[]) {
  if (provider === 'groq') return groqKeys;
  const prefix = provider === 'cerebras' ? 'CEREBRAS' : provider === 'gemini' ? 'GEMINI' : 'OPENROUTER';
  const configured = [
    `${prefix}_KEY_PTMOTIVATOR`,
    `${prefix}_KEY2_PTMOTIVATOR`,
    `${prefix}_KEY3_PTMOTIVATOR`,
    `${prefix}_KEY4_PTMOTIVATOR`,
  ].map(name => ({ name, value: process.env[name] }));
  const seen = new Set<string>();
  return configured.flatMap(({ name, value }) => {
    const clean = value?.trim();
    if (!clean || seen.has(clean)) return [];
    seen.add(clean);
    return [{ name, value: clean }];
  });
}

export function hasAnyAiApiKey(groqKeys = getGroqApiKeys()) {
  return (['groq', 'cerebras', 'gemini', 'openrouter'] as const)
    .some(provider => providerKeys(provider, groqKeys).length > 0);
}

export function hasAiApiKeyForTask(task: GroqTask, groqKeys = getGroqApiKeys()) {
  return getAiRoutePlan(task).some(route => providerKeys(route.provider, groqKeys).length > 0);
}

function groqRoute(model: string): AiRoute {
  return { provider: 'groq', model, jsonMode: !model.startsWith('groq/compound') };
}

function uniqueRoutes(routes: AiRoute[]) {
  const seen = new Set<string>();
  return routes.filter(route => {
    const key = `${route.provider}:${route.model}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function getAiRoutePlan(task: GroqTask): AiRoute[] {
  const groqModels = getGroqModelChain(task);
  const openRouter = OPENROUTER_FREE_MODELS.map(route => ({ provider: 'openrouter' as const, ...route }));
  if (task === 'rerank') return groqModels.map(groqRoute);

  if (task === 'agent') return uniqueRoutes([
    { provider: 'gemini', model: 'gemini-3.5-flash', jsonMode: true },
    ...groqModels.slice(0, 1).map(groqRoute),
    { provider: 'cerebras', model: CEREBRAS_PRODUCTION_MODEL, jsonMode: true },
    { provider: 'gemini', model: 'gemini-3.1-flash-lite', jsonMode: true },
    ...groqModels.slice(1, 3).map(groqRoute),
    ...openRouter,
    ...groqModels.slice(3).map(groqRoute),
    { provider: 'cerebras', model: CEREBRAS_PREVIEW_MODEL, jsonMode: true },
  ]);

  if (task === 'publicAsk') return uniqueRoutes([
    ...GEMINI_PUBLIC_MODELS.map(model => ({ provider: 'gemini' as const, model, jsonMode: true })),
    ...groqModels.slice(0, 2).map(groqRoute),
    { provider: 'cerebras', model: CEREBRAS_PRODUCTION_MODEL, jsonMode: true },
    ...openRouter,
    ...groqModels.slice(2).map(groqRoute),
  ]);

  const premiumGroqCount = task === 'ask' || task === 'enhance' || task === 'standardize' ? 3 : 2;
  const premiumGroq = groqModels.slice(0, premiumGroqCount).map(groqRoute);
  const remainingGroq = groqModels.slice(premiumGroqCount).map(groqRoute);
  const cerebrasRoutes: AiRoute[] = [
    { provider: 'cerebras', model: CEREBRAS_PRODUCTION_MODEL, jsonMode: true },
    { provider: 'cerebras', model: CEREBRAS_PREVIEW_MODEL, jsonMode: true },
  ];
  const shortTaskCerebras: AiRoute[] = task === 'log' || task === 'edit' || task === 'standardize' || task === 'summary'
    ? [{ provider: 'cerebras', model: CEREBRAS_SHORT_CONTEXT_MODEL, jsonMode: true }]
    : [];
  const geminiRoutes: AiRoute[] = task === 'log' || task === 'edit' || task === 'summary'
    ? [{ provider: 'gemini', model: 'gemini-3.1-flash-lite', jsonMode: true }]
    : [
        { provider: 'gemini', model: 'gemini-3.5-flash', jsonMode: true },
        { provider: 'gemini', model: 'gemini-3.1-flash-lite', jsonMode: true },
      ];

  return uniqueRoutes([
    ...geminiRoutes.slice(0, task === 'log' || task === 'edit' || task === 'summary' ? 1 : 0),
    ...premiumGroq.slice(0, 1),
    cerebrasRoutes[0],
    ...geminiRoutes.slice(task === 'log' || task === 'edit' || task === 'summary' ? 1 : 0, 1),
    ...premiumGroq.slice(1),
    ...shortTaskCerebras,
    ...geminiRoutes.slice(1),
    ...openRouter,
    ...remainingGroq,
    cerebrasRoutes[1],
  ]);
}

function groqDetailFromText(text: string) {
  const fallback = cleanText(text, 600);
  try {
    const parsed = JSON.parse(text);
    const message = parsed?.error?.message || parsed?.message || parsed?.detail || fallback;
    const type = parsed?.error?.type || parsed?.type;
    const code = parsed?.error?.code || parsed?.code;
    return [message, type ? `type: ${type}` : '', code ? `code: ${code}` : ''].filter(Boolean).join(' | ') || fallback;
  } catch {
    return fallback;
  }
}

function requestBodyForModel(body: Record<string, unknown>, route: AiRoute) {
  const { model, provider, jsonMode } = route;
  const next: Record<string, unknown> = { ...body, model };

  if (!jsonMode || model.startsWith('groq/compound')) {
    delete next.response_format;
  }

  if (provider === 'openrouter') {
    if (next.max_completion_tokens !== undefined) {
      next.max_tokens = next.max_completion_tokens;
      delete next.max_completion_tokens;
    }
    next.provider = {
      allow_fallbacks: true,
    };
  }

  return next;
}

function geminiRequestBody(body: Record<string, unknown>, model: string) {
  const messages = Array.isArray(body.messages) ? body.messages.flatMap(message => {
    if (!message || typeof message !== 'object' || Array.isArray(message)) return [];
    const row = message as Record<string, unknown>;
    const role = row.role === 'assistant' ? 'model' : row.role === 'system' ? 'system' : 'user';
    const text = String(row.content ?? '').trim();
    return text ? [{ role, text }] : [];
  }) : [];
  const systemText = messages.filter(message => message.role === 'system').map(message => message.text).join('\n\n');
  const conversation = messages.filter(message => message.role !== 'system');
  const contents = model.startsWith('gemma-')
    ? [{ role: 'user', parts: [{ text: [systemText, ...conversation.map(message => `${message.role}: ${message.text}`)].filter(Boolean).join('\n\n') }] }]
    : conversation.map(message => ({ role: message.role, parts: [{ text: message.text }] }));
  const generationConfig: Record<string, unknown> = {};
  if (typeof body.temperature === 'number') generationConfig.temperature = body.temperature;
  const maxOutputTokens = Number(body.max_completion_tokens ?? body.max_tokens);
  if (Number.isFinite(maxOutputTokens) && maxOutputTokens > 0) generationConfig.maxOutputTokens = Math.min(65_536, Math.floor(maxOutputTokens));
  if (body.response_format && typeof body.response_format === 'object') generationConfig.responseMimeType = 'application/json';
  return {
    ...(systemText && !model.startsWith('gemma-') ? { systemInstruction: { parts: [{ text: systemText }] } } : {}),
    contents: contents.length ? contents : [{ role: 'user', parts: [{ text: 'Respond to the request.' }] }],
    generationConfig,
  };
}

function normalizeGeminiResponse(value: unknown) {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const candidates = Array.isArray(raw.candidates) ? raw.candidates : [];
  const first = candidates[0] && typeof candidates[0] === 'object' && !Array.isArray(candidates[0])
    ? candidates[0] as Record<string, unknown>
    : {};
  const content = first.content && typeof first.content === 'object' && !Array.isArray(first.content)
    ? first.content as Record<string, unknown>
    : {};
  const parts = Array.isArray(content.parts) ? content.parts : [];
  const text = parts.flatMap(part => part && typeof part === 'object' && !Array.isArray(part)
    ? [String((part as Record<string, unknown>).text ?? '')]
    : []).join('').trim();
  const usage = raw.usageMetadata && typeof raw.usageMetadata === 'object' && !Array.isArray(raw.usageMetadata)
    ? raw.usageMetadata as Record<string, unknown>
    : {};
  return {
    choices: text ? [{ message: { role: 'assistant', content: text }, finish_reason: first.finishReason ?? null }] : [],
    usage: {
      prompt_tokens: Number(usage.promptTokenCount ?? 0),
      completion_tokens: Number(usage.candidatesTokenCount ?? 0),
      total_tokens: Number(usage.totalTokenCount ?? 0),
    },
  };
}

function providerRequest(route: AiRoute, apiKey: GroqApiKey, body: Record<string, unknown>, signal: AbortSignal) {
  if (route.provider === 'gemini') {
    return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(route.model)}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey.value, 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiRequestBody(body, route.model)),
      signal,
    });
  }
  const endpoint = route.provider === 'groq'
    ? 'https://api.groq.com/openai/v1/chat/completions'
    : route.provider === 'cerebras'
      ? 'https://api.cerebras.ai/v1/chat/completions'
      : 'https://openrouter.ai/api/v1/chat/completions';
  return fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey.value}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBodyForModel(body, route)),
    signal,
  });
}

function modelLabel(route: AiRoute) {
  return route.provider === 'groq' ? route.model : `${route.provider}/${route.model}`;
}

function providerKeyLabel(provider: AiProvider, keyName: string) {
  if (provider === 'groq') {
    const number = keyName.match(/^GROQ_KEY(\d*)_PTMOTIVATOR$/)?.[1] || '1';
    return `Groq ${number}`;
  }
  if (provider === 'cerebras') return 'Cerebras';
  if (provider === 'gemini') return 'Gemini';
  return 'OpenRouter';
}

function retryDelayMs(response: Response) {
  const seconds = Number(response.headers.get('retry-after'));
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(300_000, seconds * 1000) : 30_000;
}

function parsedJsonObject(value: unknown): Record<string, unknown> | null {
  const content = String(value ?? '').trim();
  if (!content) return null;
  const candidates = [
    content,
    content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, ''),
    content.slice(content.indexOf('{'), content.lastIndexOf('}') + 1),
  ];
  for (const candidate of candidates) {
    if (!candidate.startsWith('{') || !candidate.endsWith('}')) continue;
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      // Try the next extraction shape.
    }
  }
  return null;
}

function containsAgentDraft(value: Record<string, unknown>) {
  const plan = value.agentPlan && typeof value.agentPlan === 'object' && !Array.isArray(value.agentPlan)
    ? value.agentPlan as Record<string, unknown>
    : value.agent_plan && typeof value.agent_plan === 'object' && !Array.isArray(value.agent_plan)
      ? value.agent_plan as Record<string, unknown>
      : value.plan && typeof value.plan === 'object' && !Array.isArray(value.plan)
        ? value.plan as Record<string, unknown>
        : value;
  const actions = Array.isArray(plan.actions) ? plan.actions
    : Array.isArray(plan.proposedActions) ? plan.proposedActions
      : Array.isArray(plan.proposed_actions) ? plan.proposed_actions
        : [];
  const clarification = String(value.clarification ?? plan.clarification ?? '').trim();
  const answer = String(value.answer ?? '').trim();
  return actions.length > 0 || clarification.length > 0 || answer.endsWith('?');
}

function visualizationItems(value: Record<string, unknown>) {
  const reply = value.reply && typeof value.reply === 'object' && !Array.isArray(value.reply)
    ? value.reply as Record<string, unknown>
    : value;
  return Array.isArray(reply.visualizations) ? reply.visualizations : [];
}

function containsVisualizationDraft(value: Record<string, unknown>) {
  return visualizationItems(value).some(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
    const visual = item as Record<string, unknown>;
    if (visual.type === 'table') return Array.isArray(visual.columns) && visual.columns.length >= 2 && Array.isArray(visual.rows) && visual.rows.length > 0;
    if (visual.type === 'line' || visual.type === 'bar') return Array.isArray(visual.labels) && visual.labels.length > 0 && Array.isArray(visual.series) && visual.series.length > 0;
    return false;
  });
}

function normalizedTokenText(value: unknown) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function containsSemanticAggregateDraft(value: Record<string, unknown>) {
  return visualizationItems(value).some(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
    const visual = item as Record<string, unknown>;
    const titleText = normalizedTokenText([visual.id, visual.title, visual.subtitle, visual.footnote].join(' '));
    const genericDailyTitle = /\b(?:daily|day by day|pattern overview|recorded exercise activity|activity overview|health metrics|recovery metrics)\b/.test(titleText);

    if (visual.type === 'table') {
      const columns = Array.isArray(visual.columns) ? visual.columns.map(normalizedTokenText) : [];
      const rows = Array.isArray(visual.rows) ? visual.rows : [];
      const columnText = columns.join(' ');
      const genericDailyColumns = columns.some(column => /\bdate\b/.test(column))
        && /\b(?:pain|energy|mood|sleep|activity|session|exercise note|recorded)\b/.test(columnText);
      if (genericDailyTitle || genericDailyColumns) return false;
      const hasCategoryColumn = columns.some(column => /\b(?:category|item|term|label|name|phrase|source|body part|symptom|exercise|note)\b/.test(column));
      const hasCountColumn = columns.some(column => /\b(?:mention|mentions|count|counts|frequency|frequencies|occurrence|occurrences|times|total|days)\b/.test(column));
      const firstColumnIsLabel = columns.length > 0 && !/\bdate\b/.test(columns[0]);
      return columns.length >= 2 && rows.length > 0 && hasCountColumn && (hasCategoryColumn || firstColumnIsLabel);
    }

    if (visual.type === 'bar') {
      if (genericDailyTitle) return false;
      const labels = Array.isArray(visual.labels) ? visual.labels : [];
      const series = Array.isArray(visual.series) ? visual.series : [];
      const seriesText = normalizedTokenText(series.map(entry => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return '';
        const row = entry as Record<string, unknown>;
        return [row.name, row.unit].join(' ');
      }).join(' '));
      const hasCountSeries = /\b(?:mention|mentions|count|counts|frequency|frequencies|occurrence|occurrences|times|total|days)\b/.test(seriesText || titleText);
      return labels.length > 0 && series.length > 0 && hasCountSeries;
    }

    return false;
  });
}

function containsEvidenceBackedSemanticAggregateDraft(value: Record<string, unknown>) {
  if (!containsSemanticAggregateDraft(value)) return false;
  return visualizationItems(value).some(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
    const visual = item as Record<string, unknown>;
    const labels = visual.type === 'table' && Array.isArray(visual.rows)
      ? visual.rows.flatMap(row => Array.isArray(row) && String(row[0] ?? '').trim() ? [normalizedTokenText(row[0])] : [])
      : visual.type === 'bar' && Array.isArray(visual.labels)
        ? visual.labels.map(normalizedTokenText).filter(Boolean)
        : [];
    const drilldowns = Array.isArray(visual.drilldowns) ? visual.drilldowns : [];
    if (!labels.length || drilldowns.length < labels.length) return false;
    const detailsByLabel = new Map(drilldowns.flatMap(raw => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
      const detail = raw as Record<string, unknown>;
      const label = normalizedTokenText(detail.label ?? detail.category ?? detail.name);
      const items = Array.isArray(detail.items ?? detail.evidence) ? (detail.items ?? detail.evidence) as unknown[] : null;
      return label && items ? [[label, items] as const] : [];
    }));
    return labels.every(label => {
      const evidence = detailsByLabel.get(label);
      return Boolean(evidence && evidence.every(raw => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
        const row = raw as Record<string, unknown>;
        return Boolean(String(row.sourceId ?? row.source_id ?? '').trim()
          && String(row.excerpt ?? row.context ?? row.text ?? '').trim()
          && String(row.match ?? row.matchedText ?? row.matched_text ?? '').trim());
      }));
    });
  });
}

export async function callGroqChat(
  apiKeys: GroqApiKey[],
  task: GroqTask,
  body: Record<string, unknown>,
  options: {
    requireAgentDraft?: boolean;
    requireVisualizationDraft?: boolean;
    requireSemanticAggregateDraft?: boolean;
    requireEvidenceBackedSemanticAggregateDraft?: boolean;
    acceptJson?: (value: Record<string, unknown>) => boolean;
  } = {},
) {
  const attempts: Attempt[] = [];
  const expectsJsonObject = Boolean(body.response_format && typeof body.response_format === 'object');

  // This legacy-named entry point is now the provider router. Each Groq model still exhausts
  // keys 1-4 before the route advances, while Cerebras, Gemini, and free OpenRouter capacity
  // provide independent failover pools selected by task and sensitivity.
  for (const route of getAiRoutePlan(task)) {
    const keys = providerKeys(route.provider, apiKeys);
    if (!keys.length) continue;
    for (const apiKey of keys) {
      const keyId = `${route.provider}:${apiKey.name}`;
      const cooldownId = `${keyId}:${route.model}`;
      if (disabledKeys.has(keyId) || (cooldowns.get(cooldownId) ?? 0) > Date.now()) continue;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), route.model.startsWith('groq/compound') ? 45_000 : 30_000);
      const label = modelLabel(route);

      try {
        const res = await providerRequest(route, apiKey, body, controller.signal);

        if (res.ok) {
          const rawData = await res.json();
          const data = route.provider === 'gemini' ? normalizeGeminiResponse(rawData) : rawData;
          const candidate = data && typeof data === 'object' && !Array.isArray(data)
            ? (data as { choices?: Array<{ message?: { content?: unknown } }> }).choices?.[0]?.message?.content
            : '';
          if (String(candidate ?? '').trim()) {
            const parsedCandidate = expectsJsonObject || options.requireAgentDraft || options.requireVisualizationDraft || options.requireSemanticAggregateDraft || options.requireEvidenceBackedSemanticAggregateDraft ? parsedJsonObject(candidate) : null;
            if (expectsJsonObject && !parsedCandidate) {
              attempts.push({ provider: route.provider, model: label, keyName: apiKey.name, status: 502, statusText: 'INVALID_JSON_RESPONSE', detail: 'Provider returned text instead of the required JSON object.' });
              break;
            }
            if (options.requireAgentDraft && (!parsedCandidate || !containsAgentDraft(parsedCandidate))) {
              attempts.push({ provider: route.provider, model: label, keyName: apiKey.name, status: 502, statusText: 'MISSING_AGENT_DRAFT', detail: 'Provider returned JSON without a proposed action or a concrete clarification.' });
              break;
            }
            if (options.requireVisualizationDraft && (!parsedCandidate || !containsVisualizationDraft(parsedCandidate))) {
              attempts.push({ provider: route.provider, model: label, keyName: apiKey.name, status: 502, statusText: 'MISSING_VISUALIZATION_DRAFT', detail: 'Provider returned JSON without the required non-empty visualization.' });
              break;
            }
            if (options.requireSemanticAggregateDraft && (!parsedCandidate || !containsSemanticAggregateDraft(parsedCandidate))) {
              attempts.push({ provider: route.provider, model: label, keyName: apiKey.name, status: 502, statusText: 'MISSING_SEMANTIC_AGGREGATE_DRAFT', detail: 'Provider returned JSON without a usable category/count visualization.' });
              break;
            }
            if (options.requireEvidenceBackedSemanticAggregateDraft && (!parsedCandidate || !containsEvidenceBackedSemanticAggregateDraft(parsedCandidate))) {
              attempts.push({ provider: route.provider, model: label, keyName: apiKey.name, status: 502, statusText: 'MISSING_EVIDENCE_BACKED_AGGREGATE', detail: 'Provider returned a category/count visualization without complete source-linked evidence.' });
              break;
            }
            if (options.acceptJson && (!parsedCandidate || !options.acceptJson(parsedCandidate))) {
              attempts.push({ provider: route.provider, model: label, keyName: apiKey.name, status: 502, statusText: 'JSON_CONTRACT_REJECTED', detail: 'Provider JSON did not satisfy the request-specific result contract.' });
              break;
            }
            return {
              data,
              model: label,
              providerKey: providerKeyLabel(route.provider, apiKey.name),
              attemptedModels: attempts.map(item => item.model),
            };
          }
          attempts.push({ provider: route.provider, model: label, keyName: apiKey.name, status: 502, statusText: 'EMPTY_RESPONSE', detail: 'Provider returned no assistant content.' });
          continue;
        }

        const detail = groqDetailFromText(await res.text());
        attempts.push({ provider: route.provider, model: label, keyName: apiKey.name, status: res.status, statusText: res.statusText, detail });
        if (res.status === 401 || res.status === 403) disabledKeys.add(keyId);
        if (res.status === 429) cooldowns.set(cooldownId, Date.now() + retryDelayMs(res));
        // A request/model validation failure will be identical across keys. Move to another
        // model/provider instead of wasting every key on the same rejected payload.
        if (res.status === 400 || res.status === 404 || res.status === 422) break;
      } catch (error) {
        const detail = error instanceof Error && error.name === 'AbortError'
          ? 'Request timed out'
          : error instanceof Error ? error.message : String(error ?? 'Network error');
        attempts.push({ provider: route.provider, model: label, keyName: apiKey.name, status: 0, statusText: 'FETCH_ERROR', detail });
      } finally {
        clearTimeout(timeout);
      }
    }
  }

  throw new GroqRouteError('All configured AI provider attempts failed', attempts);
}

export function groqErrorPayload(error: unknown): GroqErrorPayload {
  if (error instanceof GroqRouteError) {
    return {
      error: 'AI request failed',
      detail: cleanText(error.detail, 1200),
      provider: error.provider,
      groqStatus: error.status,
      groqStatusText: error.statusText,
      model: error.model,
      attemptedModels: error.attempts.map(item => item.model),
      attempts: error.attempts,
      hint: error.status === 401 ? 'A configured provider key was rejected.'
        : error.status === 402 ? 'A provider reported a billing or quota issue.'
        : error.status === 429 ? 'All eligible provider and model quota pools were exhausted.'
        : error.status === 400 ? 'A provider rejected the request shape; the router tried compatible fallbacks.'
        : error.status === 0 ? 'Providers timed out or could not be reached.'
        : 'All eligible AI provider fallbacks returned errors.',
    };
  }

  return {
    error: 'AI request failed',
    detail: error instanceof Error ? error.message : String(error ?? 'Unknown error'),
    model: '',
    attemptedModels: [],
  };
}
