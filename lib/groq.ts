export type GroqTask = 'ask' | 'publicAsk' | 'log' | 'edit' | 'enhance' | 'summary';

type Attempt = {
  model: string;
  status: number;
  statusText: string;
  detail: string;
};

type GroqErrorPayload = {
  error: string;
  detail: string;
  groqStatus?: number;
  groqStatusText?: string;
  model: string;
  attemptedModels: string[];
  attempts?: Attempt[];
  hint?: string;
};

export class GroqRouteError extends Error {
  attempts: Attempt[];
  status: number;
  statusText: string;
  detail: string;
  model: string;

  constructor(message: string, attempts: Attempt[]) {
    super(message);
    this.name = 'GroqRouteError';
    this.attempts = attempts;
    const last = attempts[attempts.length - 1];
    this.status = last?.status ?? 500;
    this.statusText = last?.statusText ?? '';
    this.detail = last?.detail ?? message;
    this.model = last?.model ?? '';
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
  // Personal history, symptoms, and day logs stay on standard hosted models. Compound can invoke
  // external tools, so it is reserved for clearly non-personal public/general questions.
  ask: PERSONAL_ASSISTANT_CHAIN,
  publicAsk: PUBLIC_ASSISTANT_CHAIN,

  // Smart Add needs good JSON and decent reasoning, but it runs more often than Enhance.
  log: ['openai/gpt-oss-20b', 'qwen/qwen3-32b', 'llama-3.1-8b-instant', 'llama-3.3-70b-versatile'],

  // Custom edit previews are small and structured.
  edit: ['openai/gpt-oss-20b', 'qwen/qwen3-32b', 'llama-3.1-8b-instant', 'llama-3.3-70b-versatile'],

  // Enhance is lower volume and benefits from richer output, but still has many fallbacks.
  enhance: ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile', 'qwen/qwen3-32b', 'meta-llama/llama-4-scout-17b-16e-instruct', 'openai/gpt-oss-20b', 'llama-3.1-8b-instant'],

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
    .filter(Boolean);
}

export function getGroqModelChain(task: GroqTask) {
  const upper = task.toUpperCase();
  const specificList = envList(`GROQ_MODELS_PTMOTIVATOR_${upper}`);
  const specificSingle = envList(`GROQ_MODEL_PTMOTIVATOR_${upper}`);
  const globalList = envList('GROQ_MODELS_PTMOTIVATOR');
  const legacySingle = envList('GROQ_MODEL_PTMOTIVATOR');

  // Specific env vars go first if present. The legacy single model remains only as a fallback
  // so one old env var does not force every task onto the same rate-limited model.
  return unique([
    ...specificList,
    ...specificSingle,
    ...DEFAULT_MODEL_CHAINS[task],
    ...globalList,
    ...legacySingle,
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

function shouldTryNext(status: number) {
  // 429 is the common quota case. 400/404 can be model-specific body or availability issues.
  // Auth and account billing failures should not be hidden by cycling every model.
  return ![401, 402, 403].includes(status);
}

function requestBodyForModel(body: Record<string, unknown>, model: string) {
  const next = { ...body, model };

  // Compound is a system rather than a normal hosted model. It does not need structured-output
  // enforcement; the route still validates and extracts the JSON response itself.
  if (model.startsWith('groq/compound')) {
    delete next.response_format;
  }

  return next;
}

export async function callGroqChat(apiKey: string, task: GroqTask, body: Record<string, unknown>) {
  const models = getGroqModelChain(task);
  const attempts: Attempt[] = [];

  for (const model of models) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), model.startsWith('groq/compound') ? 45000 : 30000);

    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBodyForModel(body, model)),
        signal: controller.signal,
      });

      if (res.ok) {
        const data = await res.json();
        return { data, model, attemptedModels: attempts.map(item => item.model) };
      }

      const detail = groqDetailFromText(await res.text());
      attempts.push({ model, status: res.status, statusText: res.statusText, detail });
      if (!shouldTryNext(res.status)) break;
    } catch (error) {
      const detail = error instanceof Error && error.name === 'AbortError'
        ? 'Request timed out'
        : error instanceof Error ? error.message : String(error ?? 'Network error');
      attempts.push({ model, status: 0, statusText: 'FETCH_ERROR', detail });
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new GroqRouteError('All Groq model attempts failed', attempts);
}

export function groqErrorPayload(error: unknown): GroqErrorPayload {
  if (error instanceof GroqRouteError) {
    return {
      error: 'Groq request failed',
      detail: cleanText(error.detail, 1200),
      groqStatus: error.status,
      groqStatusText: error.statusText,
      model: error.model,
      attemptedModels: error.attempts.map(item => item.model),
      attempts: error.attempts,
      hint: error.status === 401 ? 'Likely bad or missing Groq API key.'
        : error.status === 402 ? 'Groq account billing/quota issue.'
        : error.status === 429 ? 'Groq rate limit or quota issue. The app tried fallback models before failing.'
        : error.status === 400 ? 'Groq rejected the request body, model, or response format. The app tried fallback models before failing.'
        : error.status === 0 ? 'Groq timed out or could not be reached. The app tried fallback models before failing.'
        : 'Groq returned a non-OK response. The app tried fallback models before failing.',
    };
  }

  return {
    error: 'Groq request failed',
    detail: error instanceof Error ? error.message : String(error ?? 'Unknown error'),
    model: '',
    attemptedModels: [],
  };
}
