export type HistoryExerciseNote = {
  exerciseId: string;
  exercise: string;
  note: string;
};

export type HistorySession = {
  kind: string;
  note: string;
};

export type HistoryWorkoutEntry = {
  exerciseId: string;
  exercise: string;
  completed: boolean;
};

export type HistoryExerciseMetric = {
  exerciseId: string;
  exercise: string;
  sets: number | null;
  reps: number | null;
  durationSeconds: number | null;
  weight: number | null;
  weightUnit: string;
  scopeMultiplier: number;
};

export type HistoryDayRecord = {
  date: string;
  completed: string[];
  exerciseNotes: HistoryExerciseNote[];
  health: Record<string, unknown> | null;
  session: HistorySession | null;
  aiInstructions?: string[];
  workoutEntries?: HistoryWorkoutEntry[];
  exerciseMetrics?: HistoryExerciseMetric[];
  workoutTracked?: boolean;
  workoutEntryCount?: number;
};

export type RankedHistoryDay<T extends HistoryDayRecord = HistoryDayRecord> = T & {
  score: number;
  evidence: string[];
};

export type HistoryRankingOptions = {
  question: string;
  context?: string;
  explicitDates?: string[];
  selectedDate?: string | null;
  today: string;
  limit?: number;
};

type FieldKey = 'exerciseNotes' | 'exerciseMetrics' | 'session' | 'healthPrimary' | 'treatment' | 'healthOther' | 'completed' | 'metadata';

type SearchField = {
  key: FieldKey;
  label: string;
  normalized: string;
  tokens: string[];
};

type IndexedDay<T extends HistoryDayRecord> = {
  record: T;
  fields: SearchField[];
};

type QueryTerm = {
  token: string;
  weight: number;
  relatedTo?: string;
};

type QueryPlan = {
  normalizedQuestion: string;
  primaryTerms: string[];
  terms: QueryTerm[];
  phrases: string[];
  asksPt: boolean;
  asksTraining: boolean;
  asksTreatment: boolean;
  asksPain: boolean;
  asksExercise: boolean;
  metric: 'pain' | 'energy' | 'mood' | 'sleepHours' | 'sleepQuality' | null;
  order: 'earliest' | 'latest' | 'highest' | 'lowest' | null;
  temporalOffset: -1 | 1 | null;
  temporalAnchor: 'pt' | 'training' | 'treatment' | null;
};

const RRF_K = 24;

const STOP_WORDS = new Set([
  'a', 'about', 'after', 'again', 'all', 'also', 'am', 'an', 'and', 'any', 'are', 'as', 'at', 'be', 'before',
  'but', 'by', 'can', 'could', 'day', 'did', 'do', 'does', 'for', 'from', 'get', 'had', 'has', 'have', 'help',
  'how', 'i', 'if', 'in', 'is', 'it', 'just', 'me', 'my', 'of', 'on', 'or', 'remember', 'some', 'that', 'the',
  'then', 'there', 'this', 'to', 'trying', 'was', 'what', 'when', 'where', 'which', 'with', 'would', 'you',
  'first', 'earliest', 'latest', 'recent', 'most', 'last', 'time', 'highest', 'lowest', 'worst', 'best',
]);

const FIELD_WEIGHTS: Record<FieldKey, number> = {
  exerciseNotes: 3.5,
  exerciseMetrics: 2.4,
  session: 3.2,
  healthPrimary: 3,
  treatment: 2.9,
  healthOther: 2.1,
  completed: 1.5,
  metadata: 0.8,
};

const SYNONYM_GROUPS = [
  ['burning', 'burn', 'stinging', 'sting', 'hot', 'heat'],
  ['tingling', 'tingle', 'pins', 'needles', 'paresthesia'],
  ['numb', 'numbness', 'insensitive'],
  ['swelling', 'swollen', 'puffy', 'edema'],
  ['pain', 'painful', 'ache', 'aching', 'sore', 'soreness'],
  ['stiff', 'stiffness', 'tight', 'tightness'],
  ['foot', 'heel', 'plantar', 'sole', 'underside'],
  ['ankle', 'talocrural'],
  ['calf', 'gastrocnemius', 'soleus'],
  ['physical', 'therapy', 'pt', 'physio'],
  ['medicine', 'medication', 'medications', 'meds', 'meloxicam', 'advil', 'ibuprofen', 'nsaid'],
  ['sleep', 'sleeping', 'rest'],
  ['exercise', 'movement', 'drill', 'workout'],
];

function normalize(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function stem(token: string) {
  if (token.length <= 4) return token;
  let next = token;
  if (next.endsWith('ies') && next.length > 5) next = `${next.slice(0, -3)}y`;
  else if (next.endsWith('ing') && next.length > 6) next = next.slice(0, -3);
  else if (next.endsWith('ed') && next.length > 5) next = next.slice(0, -2);
  else if (next.endsWith('ness') && next.length > 7) next = next.slice(0, -4);
  else if (next.endsWith('s') && !next.endsWith('ss') && next.length > 5) next = next.slice(0, -1);
  if (next.length > 3 && next.at(-1) === next.at(-2) && /[bdgmnprt]/.test(next.at(-1) ?? '')) next = next.slice(0, -1);
  return next;
}

function words(value: string, removeStopWords = false) {
  const tokens = normalize(value).match(/[a-z0-9]+/g) ?? [];
  return tokens
    .filter(token => !removeStopWords || (token.length > 2 && !STOP_WORDS.has(token)))
    .map(stem);
}

export function historyQueryTerms(value: string) {
  return Array.from(new Set(words(value, true))).slice(0, 32);
}

function addTerm(terms: Map<string, QueryTerm>, token: string, weight: number, relatedTo?: string) {
  const canonical = stem(token);
  if (!canonical || canonical.length < 2) return;
  const existing = terms.get(canonical);
  if (!existing || weight > existing.weight) terms.set(canonical, { token: canonical, weight, relatedTo });
}

function containsAlias(value: string, alias: string) {
  return ` ${value} `.includes(` ${normalize(alias)} `);
}

function queryPhrases(question: string) {
  const normalized = normalize(question);
  const tokens = normalized.split(' ').filter(Boolean);
  const phrases = new Set<string>();
  for (const match of question.matchAll(/["“]([^"”]{3,80})["”]/g)) phrases.add(normalize(match[1]));
  for (let size = 4; size >= 2; size -= 1) {
    for (let index = 0; index <= tokens.length - size; index += 1) {
      const slice = tokens.slice(index, index + size);
      if (slice.filter(token => token.length > 2 && !STOP_WORDS.has(token)).length < 2) continue;
      phrases.add(slice.join(' '));
      if (phrases.size >= 14) return Array.from(phrases);
    }
  }
  return Array.from(phrases);
}

function buildQueryPlan(question: string, context = ''): QueryPlan {
  const normalizedQuestion = normalize(question);
  const primaryTerms = historyQueryTerms(question);
  const contextTerms = historyQueryTerms(context);
  const terms = new Map<string, QueryTerm>();
  primaryTerms.forEach(token => addTerm(terms, token, 1));
  contextTerms.forEach(token => addTerm(terms, token, 0.45));

  const combinedNormalized = `${normalizedQuestion} ${normalize(context)}`.trim();
  for (const group of SYNONYM_GROUPS) {
    const canonicalGroup = Array.from(new Set(group.map(stem)));
    const matched = group.find(alias => containsAlias(combinedNormalized, alias))
      ?? canonicalGroup.find(token => primaryTerms.includes(token) || contextTerms.includes(token));
    if (!matched) continue;
    canonicalGroup.forEach(token => addTerm(terms, token, 0.58, matched));
  }

  const asksPt = /\bpt\b|physical therap|physio/.test(normalizedQuestion);
  const asksTraining = /\btraining\b|trainer|gym session/.test(normalizedQuestion);
  const asksTreatment = /treatment|medication|medicine|\bmeds?\b|meloxicam|advil|ibuprofen|ice|compression/.test(normalizedQuestion);
  const asksPain = /pain|burn|sting|tingl|numb|swell|sore|ache|stiff|tight/.test(normalizedQuestion);
  const asksExercise = /exercise|movement|stretch|drill|workout|did i do|completed|reps|sets/.test(normalizedQuestion);
  const metric = /sleep quality/.test(normalizedQuestion) ? 'sleepQuality'
    : /sleep|hours slept/.test(normalizedQuestion) ? 'sleepHours'
      : /energy/.test(normalizedQuestion) ? 'energy'
        : /mood/.test(normalizedQuestion) ? 'mood'
          : /pain/.test(normalizedQuestion) ? 'pain'
            : null;
  const order = /\b(first|earliest)\b/.test(normalizedQuestion) ? 'earliest'
    : /most recent|latest|last time|when was my last/.test(normalizedQuestion) ? 'latest'
      : /highest|most pain|peak/.test(normalizedQuestion) ? 'highest'
        : /lowest|least pain/.test(normalizedQuestion) ? 'lowest'
          : /\bworst\b/.test(normalizedQuestion) ? (metric === 'pain' ? 'highest' : 'lowest')
            : /\bbest\b/.test(normalizedQuestion) ? (metric === 'pain' ? 'lowest' : 'highest')
              : null;
  const temporalOffset = /day after|following day|following morning|next day|after (?:my )?(?:pt|physical therapy|training|treatment|medication)/.test(normalizedQuestion) ? 1
    : /day before|previous day|before (?:my )?(?:pt|physical therapy|training|treatment|medication)/.test(normalizedQuestion) ? -1
      : null;
  const temporalAnchor = asksPt ? 'pt' : asksTraining ? 'training' : asksTreatment ? 'treatment' : null;

  return {
    normalizedQuestion,
    primaryTerms,
    terms: Array.from(terms.values()).slice(0, 64),
    phrases: queryPhrases(question),
    asksPt,
    asksTraining,
    asksTreatment,
    asksPain,
    asksExercise,
    metric,
    order,
    temporalOffset,
    temporalAnchor,
  };
}

function textValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function numericValue(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function makeField(key: FieldKey, label: string, value: string): SearchField {
  const normalized = normalize(value);
  return { key, label, normalized, tokens: words(normalized) };
}

function indexDay<T extends HistoryDayRecord>(record: T): IndexedDay<T> {
  const health = record.health ?? {};
  const weekday = new Date(`${record.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long' });
  return {
    record,
    fields: [
      makeField('exerciseNotes', 'exercise notes', record.exerciseNotes.map(note => `${note.exercise} ${note.note}`).join(' ')),
      makeField('exerciseMetrics', 'exercise metrics', (record.exerciseMetrics ?? []).map(metric => `${metric.exercise} ${metric.sets ?? ''} sets ${metric.reps ?? ''} reps ${metric.durationSeconds ?? ''} seconds ${metric.weight ?? ''} ${metric.weightUnit}`).join(' ')),
      makeField('session', 'PT or training notes', record.session ? `${record.session.kind} physical therapy ${record.session.note}` : ''),
      makeField('healthPrimary', 'pain or general health notes', [textValue(health.painNote), textValue(health.generalNote)].join(' ')),
      makeField('treatment', 'treatment notes', textValue(health.treatmentNote)),
      makeField('healthOther', 'sleep, energy, or mood notes', [
        textValue(health.sleepNote), textValue(health.energyNote), textValue(health.moodNote),
      ].join(' ')),
      makeField('completed', 'completed exercises', record.completed.join(' ')),
      makeField('metadata', 'date or weekday', `${record.date} ${weekday}`),
    ],
  };
}

function termFrequency(tokens: string[], term: string) {
  let count = 0;
  for (const token of tokens) if (token === term) count += 1;
  return count;
}

function addEvidence(evidence: Map<string, string[]>, date: string, value: string) {
  const current = evidence.get(date) ?? [];
  if (!current.includes(value) && current.length < 6) current.push(value);
  evidence.set(date, current);
}

function bm25Scores<T extends HistoryDayRecord>(indexed: IndexedDay<T>[], plan: QueryPlan, evidence: Map<string, string[]>) {
  const scores = new Map<string, number>();
  if (!indexed.length || !plan.terms.length) return scores;
  const averageLengths = new Map<FieldKey, number>();
  for (const key of Object.keys(FIELD_WEIGHTS) as FieldKey[]) {
    const total = indexed.reduce((sum, day) => sum + (day.fields.find(field => field.key === key)?.tokens.length ?? 0), 0);
    averageLengths.set(key, Math.max(1, total / indexed.length));
  }

  for (const term of plan.terms) {
    const documentFrequency = indexed.filter(day => day.fields.some(field => field.tokens.includes(term.token))).length;
    if (!documentFrequency) continue;
    const idf = Math.log(1 + (indexed.length - documentFrequency + 0.5) / (documentFrequency + 0.5));
    for (const day of indexed) {
      let termScore = 0;
      let bestField: SearchField | null = null;
      let bestFieldScore = 0;
      for (const field of day.fields) {
        const tf = termFrequency(field.tokens, term.token);
        if (!tf) continue;
        const averageLength = averageLengths.get(field.key) ?? 1;
        const lengthNorm = 1 - 0.72 + 0.72 * (field.tokens.length / averageLength);
        const fieldScore = FIELD_WEIGHTS[field.key] * ((tf * 1.45) / (tf + 1.45 * lengthNorm));
        termScore += fieldScore;
        if (fieldScore > bestFieldScore) {
          bestField = field;
          bestFieldScore = fieldScore;
        }
      }
      if (!termScore) continue;
      scores.set(day.record.date, (scores.get(day.record.date) ?? 0) + idf * term.weight * termScore);
      if (bestField && term.weight >= 0.58) {
        const description = term.relatedTo
          ? `Related term for "${term.relatedTo}" matched in ${bestField.label}`
          : `Matched "${term.token}" in ${bestField.label}`;
        addEvidence(evidence, day.record.date, description);
      }
    }
  }
  return scores;
}

function ngrams(value: string) {
  const padded = ` ${value} `;
  const out = new Set<string>();
  for (let index = 0; index < padded.length - 1; index += 1) out.add(padded.slice(index, index + 2));
  return out;
}

function similarity(left: string, right: string) {
  if (left === right) return 1;
  if (Math.abs(left.length - right.length) > 2) return 0;
  const leftNgrams = ngrams(left);
  const rightNgrams = ngrams(right);
  let overlap = 0;
  for (const gram of leftNgrams) if (rightNgrams.has(gram)) overlap += 1;
  return (2 * overlap) / Math.max(1, leftNgrams.size + rightNgrams.size);
}

function fuzzyScores<T extends HistoryDayRecord>(indexed: IndexedDay<T>[], plan: QueryPlan, evidence: Map<string, string[]>) {
  const scores = new Map<string, number>();
  for (const queryTerm of plan.primaryTerms.filter(term => term.length >= 5)) {
    for (const day of indexed) {
      let best: { score: number; token: string; field: SearchField } | null = null;
      for (const field of day.fields) {
        if (field.tokens.includes(queryTerm)) continue;
        for (const token of new Set(field.tokens)) {
          if (token[0] !== queryTerm[0]) continue;
          const match = similarity(queryTerm, token);
          const weighted = match * FIELD_WEIGHTS[field.key];
          if (match >= 0.64 && (!best || weighted > best.score)) best = { score: weighted, token, field };
        }
      }
      if (!best) continue;
      scores.set(day.record.date, (scores.get(day.record.date) ?? 0) + best.score);
      addEvidence(evidence, day.record.date, `Fuzzy match "${queryTerm}" to "${best.token}" in ${best.field.label}`);
    }
  }
  return scores;
}

function proximityScores<T extends HistoryDayRecord>(indexed: IndexedDay<T>[], plan: QueryPlan, evidence: Map<string, string[]>) {
  const scores = new Map<string, number>();
  for (const day of indexed) {
    let score = 0;
    for (const field of day.fields) {
      for (const phrase of plan.phrases) {
        if (!phrase || !field.normalized.includes(phrase)) continue;
        score += FIELD_WEIGHTS[field.key] * Math.min(3, phrase.split(' ').length) * 1.4;
        addEvidence(evidence, day.record.date, `Exact phrase matched in ${field.label}`);
      }

      const positions = plan.primaryTerms
        .map(term => field.tokens.indexOf(term))
        .filter(position => position >= 0)
        .sort((a, b) => a - b);
      if (positions.length < 2) continue;
      let closest = Number.POSITIVE_INFINITY;
      for (let index = 1; index < positions.length; index += 1) closest = Math.min(closest, positions[index] - positions[index - 1]);
      if (closest <= 6) {
        score += FIELD_WEIGHTS[field.key] * (7 - closest) * 0.35;
        addEvidence(evidence, day.record.date, `Related terms appear close together in ${field.label}`);
      }
    }
    if (score > 0) scores.set(day.record.date, score);
  }
  return scores;
}

function hasHealthText(record: HistoryDayRecord, keys: string[]) {
  return keys.some(key => Boolean(textValue(record.health?.[key])));
}

function structuredScores<T extends HistoryDayRecord>(records: T[], plan: QueryPlan, evidence: Map<string, string[]>) {
  const scores = new Map<string, number>();
  const add = (record: T, score: number, reason: string) => {
    scores.set(record.date, (scores.get(record.date) ?? 0) + score);
    addEvidence(evidence, record.date, reason);
  };

  for (const record of records) {
    if (plan.asksPt && record.session?.kind === 'pt') add(record, 9, 'PT session recorded on this day');
    if (plan.asksTraining && record.session?.kind === 'training') add(record, 9, 'Training session recorded on this day');
    if (plan.asksTreatment && hasHealthText(record, ['treatmentNote'])) add(record, 7, 'Treatment details recorded on this day');
    if (plan.asksPain && (numericValue(record.health?.pain) !== null || hasHealthText(record, ['painNote']))) {
      add(record, 4, 'Pain or symptom information recorded on this day');
    }
    if (plan.asksExercise && (record.completed.length || record.exerciseMetrics?.length)) {
      const count = new Set([
        ...record.completed,
        ...(record.exerciseMetrics ?? []).map(metric => metric.exercise),
      ]).size;
      add(record, 3, `${count} performed exercise${count === 1 ? '' : 's'} recorded`);
    }
  }
  return scores;
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function shiftDate(date: string, amount: number) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + amount);
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function temporalScores<T extends HistoryDayRecord>(records: T[], plan: QueryPlan, evidence: Map<string, string[]>) {
  const scores = new Map<string, number>();
  if (!plan.temporalOffset || !plan.temporalAnchor) return scores;
  const byDate = new Map(records.map(record => [record.date, record]));
  let anchors = records.filter(record => {
    if (plan.temporalAnchor === 'pt') return record.session?.kind === 'pt';
    if (plan.temporalAnchor === 'training') return record.session?.kind === 'training';
    return hasHealthText(record, ['treatmentNote']);
  });
  if (plan.order === 'latest' && anchors.length) anchors = [anchors.toSorted((a, b) => b.date.localeCompare(a.date))[0]];
  if (plan.order === 'earliest' && anchors.length) anchors = [anchors.toSorted((a, b) => a.date.localeCompare(b.date))[0]];

  for (const anchor of anchors) {
    const targetDate = shiftDate(anchor.date, plan.temporalOffset);
    if (!byDate.has(targetDate)) continue;
    scores.set(targetDate, (scores.get(targetDate) ?? 0) + 20);
    const direction = plan.temporalOffset === 1 ? 'after' : 'before';
    addEvidence(evidence, targetDate, `Day ${direction} ${plan.temporalAnchor === 'pt' ? 'PT' : plan.temporalAnchor} on ${anchor.date}`);
  }
  return scores;
}

function metricScores<T extends HistoryDayRecord>(records: T[], plan: QueryPlan, evidence: Map<string, string[]>) {
  const scores = new Map<string, number>();
  if (!plan.metric || (plan.order !== 'highest' && plan.order !== 'lowest')) return scores;
  const values = records
    .map(record => ({ record, value: numericValue(record.health?.[plan.metric!]) }))
    .filter((item): item is { record: T; value: number } => item.value !== null)
    .sort((a, b) => plan.order === 'highest' ? b.value - a.value : a.value - b.value);
  values.forEach((item, index) => {
    scores.set(item.record.date, Math.max(1, values.length - index));
    if (index < 5) addEvidence(evidence, item.record.date, `${plan.metric} was ${item.value}`);
  });
  return scores;
}

function addRankList(
  records: HistoryDayRecord[],
  component: Map<string, number>,
  weight: number,
  fused: Map<string, number>,
) {
  const ranked = records
    .filter(record => (component.get(record.date) ?? 0) > 0)
    .sort((left, right) => (component.get(right.date) ?? 0) - (component.get(left.date) ?? 0) || right.date.localeCompare(left.date));
  ranked.forEach((record, index) => fused.set(record.date, (fused.get(record.date) ?? 0) + weight / (RRF_K + index + 1)));
}

export function rankHistoryDays<T extends HistoryDayRecord>(records: T[], options: HistoryRankingOptions): RankedHistoryDay<T>[] {
  if (!records.length) return [];
  const plan = buildQueryPlan(options.question, options.context);
  const indexed = records.map(indexDay);
  const evidence = new Map<string, string[]>();
  const lexical = bm25Scores(indexed, plan, evidence);
  const fuzzy = fuzzyScores(indexed, plan, evidence);
  const proximity = proximityScores(indexed, plan, evidence);
  const structured = structuredScores(records, plan, evidence);
  const temporal = temporalScores(records, plan, evidence);
  const metric = metricScores(records, plan, evidence);
  const fused = new Map<string, number>();

  addRankList(records, lexical, 2.2, fused);
  addRankList(records, proximity, 1.8, fused);
  addRankList(records, fuzzy, 1.1, fused);
  addRankList(records, structured, 1.6, fused);
  addRankList(records, temporal, 3.2, fused);
  addRankList(records, metric, 2.8, fused);

  for (const date of temporal.keys()) fused.set(date, (fused.get(date) ?? 0) + 2);
  Array.from(metric.entries())
    .sort((left, right) => right[1] - left[1])
    .forEach(([date], index) => fused.set(date, (fused.get(date) ?? 0) + 2 / (index + 1)));

  const explicitDates = new Set(options.explicitDates ?? []);
  for (const record of records) {
    if (explicitDates.has(record.date)) {
      fused.set(record.date, (fused.get(record.date) ?? 0) + 10);
      addEvidence(evidence, record.date, 'Explicitly referenced date');
    }
    if (options.selectedDate === record.date && /selected day|this day|that day/.test(plan.normalizedQuestion)) {
      fused.set(record.date, (fused.get(record.date) ?? 0) + 9);
      addEvidence(evidence, record.date, 'Currently selected day');
    }
  }

  let candidates = records.filter(record => (fused.get(record.date) ?? 0) > 0);
  if (plan.order === 'earliest' || plan.order === 'latest') {
    const ordered = candidates.toSorted((left, right) => plan.order === 'earliest'
      ? left.date.localeCompare(right.date)
      : right.date.localeCompare(left.date));
    ordered.forEach((record, index) => fused.set(record.date, (fused.get(record.date) ?? 0) + 6 / (RRF_K + index + 1)));
  }

  candidates = candidates.sort((left, right) => {
    const scoreDifference = (fused.get(right.date) ?? 0) - (fused.get(left.date) ?? 0);
    return Math.abs(scoreDifference) > Number.EPSILON ? scoreDifference : right.date.localeCompare(left.date);
  });

  return candidates.slice(0, Math.max(1, Math.min(30, options.limit ?? 8))).map(record => ({
    ...record,
    score: Number((fused.get(record.date) ?? 0).toFixed(6)),
    evidence: (evidence.get(record.date) ?? []).slice(0, 3),
  }));
}
