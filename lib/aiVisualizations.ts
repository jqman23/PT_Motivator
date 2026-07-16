export type AiTableVisualization = {
  id: string;
  type: 'table';
  title: string;
  subtitle?: string;
  columns: string[];
  rows: string[][];
  footnote?: string;
  drilldowns?: AiVisualDrilldown[];
};

export type AiVisualEvidenceItem = {
  sourceId?: string;
  date?: string;
  source?: string;
  excerpt: string;
  match?: string;
  count?: number;
};

export type AiVisualDrilldown = {
  label: string;
  items: AiVisualEvidenceItem[];
};

export type AiChartSeries = {
  name: string;
  values: Array<number | null>;
  unit?: string;
};

export type AiChartVisualization = {
  id: string;
  type: 'line' | 'bar';
  title: string;
  subtitle?: string;
  labels: string[];
  series: AiChartSeries[];
  yLabel?: string;
  footnote?: string;
  drilldowns?: AiVisualDrilldown[];
};

export type AiVisualization = AiTableVisualization | AiChartVisualization;

const DEFAULT_VISUAL_POINT_LIMIT = 31;
export const MAX_VISUAL_POINT_LIMIT = 730;

type NormalizeAiVisualizationOptions = {
  maxPoints?: number;
};

function cleanText(value: unknown, limit: number) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function cleanNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || Math.abs(number) > 1_000_000) return null;
  return Math.round(number * 100) / 100;
}

function cleanId(value: unknown, index: number) {
  return cleanText(value, 80).replace(/[^a-zA-Z0-9_-]/g, '-') || `visual-${index + 1}`;
}

function normalizeDrilldowns(value: unknown): AiVisualDrilldown[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set<string>();
  const drilldowns = value.flatMap(rawItem => {
    if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) return [];
    const item = rawItem as Record<string, unknown>;
    const label = cleanText(item.label ?? item.category ?? item.name, 120);
    const key = label.toLowerCase();
    if (!label || seen.has(key) || !Array.isArray(item.items ?? item.evidence)) return [];
    seen.add(key);
    const rawEvidence = (item.items ?? item.evidence) as unknown[];
    const evidenceSeen = new Set<string>();
    const items = rawEvidence.flatMap(rawEvidenceItem => {
      if (!rawEvidenceItem || typeof rawEvidenceItem !== 'object' || Array.isArray(rawEvidenceItem)) return [];
      const evidence = rawEvidenceItem as Record<string, unknown>;
      const excerpt = cleanText(evidence.excerpt ?? evidence.context ?? evidence.text, 500);
      if (!excerpt) return [];
      const normalized = {
        sourceId: cleanText(evidence.sourceId ?? evidence.source_id, 180) || undefined,
        date: /^\d{4}-\d{2}-\d{2}$/.test(String(evidence.date ?? '')) ? String(evidence.date) : undefined,
        source: cleanText(evidence.source ?? evidence.field, 100) || undefined,
        excerpt,
        match: cleanText(evidence.match ?? evidence.matchedText ?? evidence.matched_text, 120) || undefined,
        count: cleanNumber(evidence.count) ?? undefined,
      };
      const evidenceKey = `${normalized.sourceId ?? ''}|${normalized.excerpt.toLowerCase()}|${normalized.match?.toLowerCase() ?? ''}`;
      if (evidenceSeen.has(evidenceKey)) return [];
      evidenceSeen.add(evidenceKey);
      return [normalized];
    }).slice(0, 120);
    return [{ label, items }];
  }).slice(0, 80);
  return drilldowns.length ? drilldowns : undefined;
}

export function normalizeAiVisualizations(value: unknown, options: NormalizeAiVisualizationOptions = {}): AiVisualization[] {
  if (!Array.isArray(value)) return [];
  const visuals: AiVisualization[] = [];
  const maxPoints = Math.max(2, Math.min(
    MAX_VISUAL_POINT_LIMIT,
    Math.floor(Number(options.maxPoints) || DEFAULT_VISUAL_POINT_LIMIT),
  ));

  for (let index = 0; index < value.length && visuals.length < 3; index += 1) {
    const item = value[index];
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const raw = item as Record<string, unknown>;
    const type = raw.type === 'line' || raw.type === 'bar' || raw.type === 'table' ? raw.type : '';
    const title = cleanText(raw.title, 120);
    if (!type || !title) continue;
    const base = {
      id: cleanId(raw.id, index),
      title,
      subtitle: cleanText(raw.subtitle, 220) || undefined,
      footnote: cleanText(raw.footnote, 260) || undefined,
      drilldowns: normalizeDrilldowns(raw.drilldowns ?? raw.details ?? raw.evidence),
    };

    if (type === 'table') {
      const columns = Array.isArray(raw.columns)
        ? raw.columns.map(column => cleanText(column, 80)).filter(Boolean).slice(0, 8)
        : [];
      if (columns.length < 2 || !Array.isArray(raw.rows)) continue;
      const rows = raw.rows.flatMap(row => Array.isArray(row)
        ? [columns.map((_, columnIndex) => cleanText(row[columnIndex], 260))]
        : []).slice(0, maxPoints);
      if (!rows.length) continue;
      visuals.push({ ...base, type, columns, rows });
      continue;
    }

    const labels = Array.isArray(raw.labels)
      ? raw.labels.map(label => cleanText(label, 60)).filter(Boolean).slice(0, maxPoints)
      : [];
    if (!labels.length || (type === 'line' && labels.length < 2) || !Array.isArray(raw.series)) continue;
    const series = raw.series.flatMap(itemSeries => {
      if (!itemSeries || typeof itemSeries !== 'object' || Array.isArray(itemSeries)) return [];
      const rawSeries = itemSeries as Record<string, unknown>;
      const name = cleanText(rawSeries.name, 80);
      const rawValues = rawSeries.values;
      if (!name || !Array.isArray(rawValues)) return [];
      const values = labels.map((_, valueIndex) => cleanNumber(rawValues[valueIndex]));
      if (!values.some(number => number !== null)) return [];
      return [{ name, values, unit: cleanText(rawSeries.unit, 30) || undefined }];
    }).slice(0, 4);
    if (!series.length) continue;
    visuals.push({
      ...base,
      type,
      labels,
      series,
      yLabel: cleanText(raw.yLabel, 80) || undefined,
    });
  }

  return visuals;
}
