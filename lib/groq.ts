export type GroqTask = 'ask' | 'log' | 'edit' | 'enhance';

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

const DEFAULT_MODEL_CHAINS: Record<GroqTask, string[]> = {
  // High-volume, conversational disambiguation: keep this cheap/fast first.
  ask: ['llama-3.1-8b-instant', 'openai/gpt-oss-20b', 'llama-3.3-70b-versatile'],

  // Smart Add needs good JSON and decent reasoning, but it runs more often than Enhance.
  log: ['openai/gpt-oss-20b', 'llama-3.1-8b-instant', 'llama-3.3-70b-versatile'],

  // Custom edit previews are small and structured.
  edit: ['openai/gpt-oss-20b', 'llama-3.1-8b-instant', 'llama-3.3-70b-versatile'],

  // Enhance is lower volume and benefits from richer output, but still has fallbacks.
  enhance: ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile', 'openai/gpt-oss-20b', 'llama-3.1-8b-instant'],
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
  // 429 is the big one. 400 is included because a model may reject response_format or a model id.
  // Auth/billing errors should not be hidden by cycling models.
  return ![401, 402, 403].includes(status);
}

export async function callGroqChat(apiKey: string, task: GroqTask, body: Record<string, unknown>) {
  const models = getGroqModelChain(task);
  const attempts: Attempt[] = [];

  for (const model of models) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...body, model }),
    });

    if (res.ok) {
      const data = await res.json();
      return { data, model, attemptedModels: attempts.map(item => item.model) };
    }

    const detail = groqDetailFromText(await res.text());
    attempts.push({ model, status: res.status, statusText: res.statusText, detail });

    if (!shouldTryNext(res.status)) break;
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
        : error.status === 400 ? 'Groq rejected the request body, model, or response_format. The app tried fallback models before failing.'
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
