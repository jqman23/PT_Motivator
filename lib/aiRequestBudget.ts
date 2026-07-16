export const AI_CLIENT_REQUEST_TIMEOUT_MS = 45_000;
export const AI_SERVER_REQUEST_BUDGET_MS = 38_000;

export class AiRequestBudgetError extends Error {
  constructor(message = 'The AI request exhausted its processing budget.') {
    super(message);
    this.name = 'AiRequestBudgetError';
  }
}

export type AiProviderBudget = {
  attemptTimeoutMs: number;
  totalTimeoutMs: number;
  maxAttempts: number;
  maxAttemptsPerRoute: number;
  preserveProviderDiversity: true;
};

export function createAiRequestDeadline(now = Date.now()) {
  return now + AI_SERVER_REQUEST_BUDGET_MS;
}

export function remainingAiRequestMs(deadline: number, reserveMs = 0, now = Date.now()) {
  return Math.max(0, deadline - now - Math.max(0, reserveMs));
}

export function aiProviderBudget(
  deadline: number,
  options: {
    maxTotalMs: number;
    attemptTimeoutMs: number;
    maxAttempts: number;
    maxAttemptsPerRoute?: number;
    reserveMs?: number;
    now?: number;
  },
): AiProviderBudget {
  const remainingMs = remainingAiRequestMs(deadline, options.reserveMs ?? 1_500, options.now ?? Date.now());
  if (remainingMs < 1_000) throw new AiRequestBudgetError();
  const totalTimeoutMs = Math.max(1_000, Math.min(options.maxTotalMs, remainingMs));
  return {
    attemptTimeoutMs: Math.max(1_000, Math.min(options.attemptTimeoutMs, totalTimeoutMs)),
    totalTimeoutMs,
    maxAttempts: Math.max(1, Math.min(8, Math.floor(options.maxAttempts))),
    // Preserve provider/model diversity inside a small total attempt budget. Without
    // this cap, four rate-limited keys for the first model can consume all four
    // attempts and falsely report that every configured provider was unavailable.
    maxAttemptsPerRoute: Math.max(1, Math.min(4, Math.floor(options.maxAttemptsPerRoute ?? 2))),
    preserveProviderDiversity: true,
  };
}
