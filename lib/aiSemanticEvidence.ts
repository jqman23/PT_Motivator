import type { HistoryDayRecord } from './historyRanking.ts';
// @ts-expect-error Node's type-stripping test runner requires the explicit extension.
import { normalizeAiVisualizations, type AiVisualization, type AiVisualDrilldown, type AiVisualEvidenceItem } from './aiVisualizations.ts';

export type SemanticNoteSource = {
  id: string;
  date: string;
  source: string;
  text: string;
};

export type SemanticCategoryPlan = {
  title: string;
  categories: Array<{ label: string; aliases: string[] }>;
};

function semanticPlanObject(value: unknown, depth = 0): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value) || depth > 3) return null;
  const raw = value as Record<string, unknown>;
  if (Array.isArray(raw.categories ?? raw.groups)) return raw;
  for (const key of ['semanticPlan', 'semantic_plan', 'plan', 'result', 'output', 'data', 'analysis', 'response', 'reply']) {
    const nested = semanticPlanObject(raw[key], depth + 1);
    if (nested) return nested;
  }
  return null;
}

function compact(value: unknown, limit = 2400) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function sourceId(date: string, source: string, index = 0) {
  return `${date}:${source.toLowerCase().replace(/[^a-z0-9]+/g, '-')}:${index}`;
}

export function buildSemanticNoteSources(records: HistoryDayRecord[]) {
  const sources: SemanticNoteSource[] = [];
  const add = (date: string, source: string, value: unknown, index = 0, limit = 2400) => {
    const text = compact(value, limit);
    if (text) sources.push({ id: sourceId(date, source, index), date, source, text });
  };

  for (const record of records) {
    const health = record.health ?? {};
    add(record.date, 'Pain note', health.painNote, 0, 1200);
    add(record.date, 'General note', health.generalNote, 0, 1800);
    add(record.date, 'Treatment note', health.treatmentNote, 0, 1200);
    add(record.date, 'Sleep note', health.sleepNote, 0, 900);
    add(record.date, 'Energy note', health.energyNote, 0, 900);
    add(record.date, 'Mood note', health.moodNote, 0, 900);
    if (record.session?.note) add(record.date, `${record.session.kind === 'training' ? 'Training' : 'PT'} session note`, record.session.note, 0, 800);
    record.exerciseNotes.forEach((note, index) => add(record.date, `Exercise note · ${note.exercise}`, note.note, index, 1200));
    const photoNotes = Array.isArray(health.generalNotePhotoNotes) ? health.generalNotePhotoNotes : [];
    photoNotes.forEach((note, index) => add(record.date, 'Photo note', note, index, 500));
  }
  return sources;
}

export function filterSemanticNoteSourcesForQuestion(sources: SemanticNoteSource[], question: string) {
  const text = compact(question, 6000).toLowerCase();
  const requested: Array<(source: SemanticNoteSource) => boolean> = [];
  if (/\bpain notes?\b|\bpain(?:\s*,|\s+and)\s+(?:general|treatment|sleep|energy|mood|exercise|workout|session|photo|image)\s+notes?\b/.test(text)) requested.push(source => source.source === 'Pain note');
  if (/\bgeneral (?:health )?notes?\b/.test(text)) requested.push(source => source.source === 'General note');
  if (/\btreatment notes?\b|\bmedication notes?\b/.test(text)) requested.push(source => source.source === 'Treatment note');
  if (/\bsleep notes?\b/.test(text)) requested.push(source => source.source === 'Sleep note');
  if (/\benergy notes?\b/.test(text)) requested.push(source => source.source === 'Energy note');
  if (/\bmood notes?\b/.test(text)) requested.push(source => source.source === 'Mood note');
  if (/\bexercise notes?\b|\bworkout notes?\b/.test(text)) requested.push(source => source.source.startsWith('Exercise note'));
  if (/\b(?:pt|physical therapy|training|session) notes?\b/.test(text)) requested.push(source => source.source.endsWith('session note'));
  if (/\b(?:photo|image) notes?\b|\bcaptions?\b/.test(text)) requested.push(source => source.source === 'Photo note');
  if (!requested.length) return sources;
  return sources.filter(source => requested.some(matches => matches(source)));
}

export function chunkSemanticNoteSources(sources: SemanticNoteSource[], maxCharacters = 48_000) {
  const chunks: SemanticNoteSource[][] = [];
  let current: SemanticNoteSource[] = [];
  let size = 0;
  for (const source of sources) {
    const nextSize = source.text.length + source.source.length + source.id.length + 80;
    if (current.length && size + nextSize > maxCharacters) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(source);
    size += nextSize;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

function occurrences(haystack: string, needle: string) {
  const positions: Array<{ start: number; end: number }> = [];
  if (!needle) return positions;
  let cursor = 0;
  while (cursor <= haystack.length - needle.length) {
    const position = haystack.indexOf(needle, cursor);
    if (position < 0) break;
    positions.push({ start: position, end: position + needle.length });
    cursor = position + Math.max(1, needle.length);
  }
  return positions;
}

function boundedOccurrences(haystack: string, needle: string) {
  return occurrences(haystack, needle).filter(position => {
    const first = needle[0] ?? '';
    const last = needle.at(-1) ?? '';
    const before = position.start > 0 ? haystack[position.start - 1] : '';
    const after = position.end < haystack.length ? haystack[position.end] : '';
    const startsWord = /[a-z0-9]/i.test(first);
    const endsWord = /[a-z0-9]/i.test(last);
    return (!startsWord || !/[a-z0-9]/i.test(before)) && (!endsWord || !/[a-z0-9]/i.test(after));
  });
}

export function normalizeSemanticCategoryPlan(value: unknown, sources: SemanticNoteSource[], expectedCategoryCount?: number): SemanticCategoryPlan | null {
  const planRaw = semanticPlanObject(value) ?? {};
  const categoriesRaw = Array.isArray(planRaw.categories ?? planRaw.groups) ? (planRaw.categories ?? planRaw.groups) as unknown[] : [];
  if (!categoriesRaw.length || (expectedCategoryCount && categoriesRaw.length !== expectedCategoryCount)) return null;
  const sourceText = sources.map(source => source.text.toLowerCase());
  const labels = new Set<string>();
  const aliasesAcrossCategories = new Set<string>();
  const categories: SemanticCategoryPlan['categories'] = [];

  for (const item of categoriesRaw) {
    if (!item || (typeof item !== 'object' && typeof item !== 'string') || Array.isArray(item)) return null;
    const category = typeof item === 'string' ? { label: item } : item as Record<string, unknown>;
    const label = compact(category.label ?? category.name ?? category.category ?? category.item, 100);
    const labelKey = label.toLowerCase();
    if (!label || labels.has(labelKey)) return null;
    labels.add(labelKey);
    const aliasValue = category.aliases ?? category.matches ?? category.terms ?? category.variants ?? category.phrases ?? category.wordings ?? category.references;
    const aliases = Array.isArray(aliasValue)
      ? aliasValue as unknown[]
      : [];
    const acceptedAliases: string[] = [];
    for (const rawAlias of aliases) {
      const aliasRecord = rawAlias && typeof rawAlias === 'object' && !Array.isArray(rawAlias) ? rawAlias as Record<string, unknown> : null;
      const alias = compact(aliasRecord ? aliasRecord.alias ?? aliasRecord.term ?? aliasRecord.match ?? aliasRecord.text ?? aliasRecord.value : rawAlias, 120);
      const aliasKey = alias.toLowerCase();
      if (!alias || aliasesAcrossCategories.has(aliasKey)) continue;
      if (!sourceText.some(text => boundedOccurrences(text, aliasKey).length > 0)) continue;
      aliasesAcrossCategories.add(aliasKey);
      acceptedAliases.push(alias);
    }
    categories.push({ label, aliases: acceptedAliases });
  }

  return { title: compact(planRaw.title, 160) || 'Mention frequency', categories };
}

/**
 * When the user supplies the ontology explicitly, the server can still produce
 * an exact-wording artifact if terminology expansion providers fail. This does
 * not guess synonyms; it preserves every requested category, including zeros.
 */
export function explicitSemanticCategoryPlan(question: string, sources: SemanticNoteSource[], expectedCategoryCount?: number) {
  const match = question.match(/\b(?:each\s+of\s+(?:these|the\s+following)|(?:these|the\s+following)\s+(?:terms|words|phrases|symptoms|items|categories))\s*:\s*([^?]+?)(?:\.(?:\s|$)|$)/i);
  if (!match?.[1]) return null;
  const labels = match[1]
    .split(/\s*,\s*|\s+and\s+/i)
    .map(label => compact(label, 100).replace(/^(?:and\s+)?["“'‘]+|["”'’]+$/gi, '').replace(/^and\s+/i, '').trim())
    .filter(Boolean);
  if (labels.length < 2 || labels.length > 30) return null;
  if (expectedCategoryCount && labels.length !== expectedCategoryCount) return null;
  return normalizeSemanticCategoryPlan({ semanticPlan: {
    title: 'Exact requested mention frequency',
    categories: labels.map(label => ({ label, aliases: [label] })),
  } }, sources, labels.length);
}

export function mergeSemanticCategoryPlans(plans: SemanticCategoryPlan[]) {
  const first = plans[0];
  if (!first) return null;
  const expectedLabels = first.categories.map(category => category.label.toLowerCase());
  if (plans.some(plan => plan.categories.map(category => category.label.toLowerCase()).some((label, index) => label !== expectedLabels[index]))) return null;
  const categories = first.categories.map((category, index) => ({
    label: category.label,
    aliases: Array.from(new Map(plans.flatMap(plan => plan.categories[index]?.aliases ?? []).map(alias => [alias.toLowerCase(), alias])).values()),
  }));
  const owners = new Map<string, Set<string>>();
  for (const category of categories) {
    for (const alias of category.aliases) {
      const ownerSet = owners.get(alias.toLowerCase()) ?? new Set<string>();
      ownerSet.add(category.label.toLowerCase());
      owners.set(alias.toLowerCase(), ownerSet);
    }
  }
  return {
    title: first.title,
    categories: categories.map(category => ({
      ...category,
      aliases: category.aliases.filter(alias => owners.get(alias.toLowerCase())?.size === 1),
    })),
  } satisfies SemanticCategoryPlan;
}

export function visualizationFromSemanticCategoryPlan(plan: SemanticCategoryPlan, sources: SemanticNoteSource[]) {
  const claimedRanges = new Map<string, Array<{ start: number; end: number }>>();
  const itemsByLabel = new Map(plan.categories.map(category => [category.label, [] as AiVisualEvidenceItem[]]));
  const aliases = plan.categories.flatMap(category => category.aliases.map(alias => ({ label: category.label, alias })))
    .sort((left, right) => right.alias.length - left.alias.length || left.label.localeCompare(right.label));

  for (const source of sources) {
    const sourceText = source.text.toLowerCase();
    const occupied = claimedRanges.get(source.id) ?? [];
    for (const entry of aliases) {
      for (const position of boundedOccurrences(sourceText, entry.alias.toLowerCase())) {
        if (occupied.some(range => position.start < range.end && position.end > range.start)) continue;
        occupied.push(position);
        const contextStart = Math.max(0, position.start - 90);
        const contextEnd = Math.min(source.text.length, position.end + 90);
        itemsByLabel.get(entry.label)?.push({
          sourceId: source.id,
          date: source.date,
          source: source.source,
          excerpt: source.text.slice(contextStart, contextEnd).trim(),
          match: source.text.slice(position.start, position.end),
          count: 1,
        });
      }
    }
    claimedRanges.set(source.id, occupied);
  }

  const drilldowns = plan.categories.map(category => {
    const grouped = new Map<string, AiVisualEvidenceItem>();
    for (const item of itemsByLabel.get(category.label) ?? []) {
      const key = `${item.sourceId ?? ''}|${item.match?.toLowerCase() ?? ''}`;
      const previous = grouped.get(key);
      grouped.set(key, previous ? { ...previous, count: (previous.count ?? 1) + (item.count ?? 1) } : item);
    }
    return { label: category.label, items: Array.from(grouped.values()) };
  });
  return normalizeAiVisualizations([{
    id: 'semantic-counts',
    type: 'table',
    title: plan.title,
    subtitle: `${sources.length} saved note field${sources.length === 1 ? '' : 's'} checked`,
    columns: ['Category', 'Mentions'],
    rows: drilldowns.map(drilldown => [drilldown.label, String(drilldown.items.reduce((sum, item) => sum + (item.count ?? 1), 0))]),
    drilldowns,
    footnote: 'Counts are exact matched-text occurrences from saved note fields. Tap a count to inspect the dates, source fields, excerpts, and wording included.',
  }], { maxPoints: 100 });
}

function countColumnIndex(columns: string[]) {
  const index = columns.findIndex(column => /\b(?:mention|count|frequency|occurrence|times|total)\b/i.test(column));
  return index >= 0 ? index : 1;
}

type EvidenceClaim = {
  label: string;
  labelKey: string;
  source: SemanticNoteSource;
  excerpt: string;
  match: string;
  positions: Array<{ start: number; end: number }>;
};

function evidenceClaims(visual: AiVisualization, sources: SemanticNoteSource[]) {
  const sourceMap = new Map(sources.map(source => [source.id, source]));
  const labels = visual.type === 'table' ? visual.rows.map(row => row[0]) : visual.labels;
  const labelKeys = new Set(labels.map(label => label.toLowerCase()));
  const rawDrilldowns = visual.drilldowns ?? [];
  const claims: EvidenceClaim[] = [];
  const seen = new Set<string>();

  for (const drilldown of rawDrilldowns) {
    const labelKey = drilldown.label.toLowerCase();
    if (!labelKeys.has(labelKey)) continue;
    for (const item of drilldown.items) {
      const source = item.sourceId ? sourceMap.get(item.sourceId) : undefined;
      const excerpt = compact(item.excerpt, 500);
      const match = compact(item.match, 120);
      if (!source || !excerpt || !match) continue;
      const sourceText = source.text.toLowerCase();
      if (!sourceText.includes(excerpt.toLowerCase()) || !excerpt.toLowerCase().includes(match.toLowerCase())) continue;
      const key = `${labelKey}|${source.id}|${match.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const positions = occurrences(sourceText, match.toLowerCase());
      if (positions.length) claims.push({ label: drilldown.label, labelKey, source, excerpt, match, positions });
    }
  }
  return claims;
}

function verifiedDrilldowns(visual: AiVisualization, sources: SemanticNoteSource[]) {
  const claims = evidenceClaims(visual, sources).sort((left, right) => right.match.length - left.match.length);
  const claimedRanges = new Map<string, Array<{ start: number; end: number }>>();
  const itemsByLabel = new Map<string, AiVisualEvidenceItem[]>();
  const labelByKey = new Map<string, string>();

  for (const claim of claims) {
    const occupied = claimedRanges.get(claim.source.id) ?? [];
    const accepted = claim.positions.filter(position => !occupied.some(range => position.start < range.end && position.end > range.start));
    if (!accepted.length) continue;
    occupied.push(...accepted);
    claimedRanges.set(claim.source.id, occupied);
    labelByKey.set(claim.labelKey, claim.label);
    const items = itemsByLabel.get(claim.labelKey) ?? [];
    for (const position of accepted) {
      const contextStart = Math.max(0, position.start - 90);
      const contextEnd = Math.min(claim.source.text.length, position.end + 90);
      items.push({
        sourceId: claim.source.id,
        date: claim.source.date,
        source: claim.source.source,
        excerpt: claim.source.text.slice(contextStart, contextEnd).trim(),
        match: claim.source.text.slice(position.start, position.end),
        count: 1,
      });
    }
    itemsByLabel.set(claim.labelKey, items);
  }

  const visualLabels = visual.type === 'table' ? visual.rows.map(row => row[0]) : visual.labels;
  return visualLabels.map(label => ({
    label,
    items: itemsByLabel.get(label.toLowerCase()) ?? [],
  })) satisfies AiVisualDrilldown[];
}

function drilldownCount(drilldown: AiVisualDrilldown) {
  return drilldown.items.reduce((total, item) => total + Math.max(0, Math.floor(Number(item.count) || 0)), 0);
}

export function normalizeEvidenceBackedSemanticVisualizations(
  value: unknown,
  sources: SemanticNoteSource[],
  options: { expectedCategoryCount?: number } = {},
): AiVisualization[] {
  const normalized = normalizeAiVisualizations(value, { maxPoints: 100 });
  const verifiedVisualizations: AiVisualization[] = [];
  for (const visual of normalized) {
    if (visual.type === 'line' || !visual.drilldowns?.length) continue;
    const labels = visual.type === 'table' ? visual.rows.map(row => row[0]) : visual.labels;
    if (options.expectedCategoryCount && labels.length !== options.expectedCategoryCount) continue;
    if (new Set(labels.map(label => label.toLowerCase())).size !== labels.length) continue;
    const drilldowns = verifiedDrilldowns(visual, sources);
    if (drilldowns.length !== labels.length) continue;
    const counts = new Map(drilldowns.map(drilldown => [drilldown.label.toLowerCase(), drilldownCount(drilldown)]));
    const footnote = 'Counts are exact matched-text occurrences from saved note fields. Tap a count to inspect the dates, source fields, excerpts, and wording included.';
    if (visual.type === 'table') {
      const countIndex = countColumnIndex(visual.columns);
      if (visual.rows.some(row => Number(row[countIndex]) > 0 && (counts.get(row[0].toLowerCase()) ?? 0) === 0)) continue;
      const rows = visual.rows.map(row => row.map((cell, index) => index === countIndex ? String(counts.get(row[0].toLowerCase()) ?? 0) : cell));
      verifiedVisualizations.push({ ...visual, rows, drilldowns, footnote });
      continue;
    }
    const firstSeries = visual.series[0];
    if (!firstSeries) continue;
    if (visual.labels.some((label, index) => Number(firstSeries.values[index]) > 0 && (counts.get(label.toLowerCase()) ?? 0) === 0)) continue;
    verifiedVisualizations.push({
      ...visual,
      series: [{ ...firstSeries, name: firstSeries.name || 'Mentions', unit: firstSeries.unit || 'mentions', values: visual.labels.map(label => counts.get(label.toLowerCase()) ?? 0) }],
      drilldowns,
      footnote,
    });
  }
  return verifiedVisualizations.slice(0, 1);
}

export function mergeEvidenceBackedSemanticVisualizations(visualizations: AiVisualization[]) {
  const compatible = visualizations.filter((visual): visual is AiVisualization => visual.type !== 'line');
  if (!compatible.length) return [];
  const first = compatible[0];
  const labelOrder = first.type === 'table' ? first.rows.map(row => row[0]) : first.labels;
  const drilldowns = labelOrder.map(label => ({
    label,
    items: compatible.flatMap(visual => visual.drilldowns?.find(item => item.label.toLowerCase() === label.toLowerCase())?.items ?? []),
  }));
  const counts = new Map(drilldowns.map(item => [item.label.toLowerCase(), drilldownCount(item)]));
  if (first.type === 'table') {
    const countIndex = countColumnIndex(first.columns);
    return [{ ...first, rows: first.rows.map(row => row.map((cell, index) => index === countIndex ? String(counts.get(row[0].toLowerCase()) ?? 0) : cell)), drilldowns }];
  }
  return [{ ...first, series: first.series.slice(0, 1).map(series => ({ ...series, values: first.labels.map(label => counts.get(label.toLowerCase()) ?? 0) })), drilldowns }];
}
