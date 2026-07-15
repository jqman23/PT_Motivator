export type AiTableVisualization = {
  id: string;
  type: 'table';
  title: string;
  subtitle?: string;
  columns: string[];
  rows: string[][];
  footnote?: string;
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
};

export type AiVisualization = AiTableVisualization | AiChartVisualization;

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

export function normalizeAiVisualizations(value: unknown): AiVisualization[] {
  if (!Array.isArray(value)) return [];
  const visuals: AiVisualization[] = [];

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
    };

    if (type === 'table') {
      const columns = Array.isArray(raw.columns)
        ? raw.columns.map(column => cleanText(column, 80)).filter(Boolean).slice(0, 8)
        : [];
      if (columns.length < 2 || !Array.isArray(raw.rows)) continue;
      const rows = raw.rows.flatMap(row => Array.isArray(row)
        ? [columns.map((_, columnIndex) => cleanText(row[columnIndex], 260))]
        : []).slice(0, 31);
      if (!rows.length) continue;
      visuals.push({ ...base, type, columns, rows });
      continue;
    }

    const labels = Array.isArray(raw.labels)
      ? raw.labels.map(label => cleanText(label, 60)).filter(Boolean).slice(0, 31)
      : [];
    if (labels.length < 2 || !Array.isArray(raw.series)) continue;
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
