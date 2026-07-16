'use client';

import { useState } from 'react';
import type { AiChartVisualization, AiVisualization } from '@/lib/aiVisualizations';

const SERIES_COLORS = ['#52705C', '#C17B4F', '#5B7F9B', '#8B668E'];
const CHART_WIDTH = 440;
const CHART_HEIGHT = 245;
const PLOT = { left: 42, right: 14, top: 18, bottom: 44 };
const MIN_POINT_SPACING = 18;

type VisualSelection =
  | { kind: 'point'; label: string; series: string; value: number; unit?: string }
  | { kind: 'cell'; label: string; column: string; value: string }
  | { kind: 'column'; column: string; values: Array<{ label: string; value: string }> };

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '');
}

function safeFilename(value: string) {
  return `${value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'ai-visual'}.png`;
}

function chartScale(visual: AiChartVisualization) {
  const values = visual.series.flatMap(series => series.values).filter((value): value is number => value !== null);
  const rawMin = values.length ? Math.min(...values) : 0;
  const rawMax = values.length ? Math.max(...values) : 1;
  const min = rawMin >= 0 ? 0 : Math.floor(rawMin);
  const healthScale = min === 0 && rawMax <= 10;
  const max = healthScale ? 10 : Math.max(1, Math.ceil(rawMax * 1.12));
  return { min, max, span: Math.max(1, max - min) };
}

function renderedChartWidth(visual: AiChartVisualization) {
  const pointCount = visual.labels.length;
  const spacing = visual.type === 'bar' ? Math.max(20, visual.series.length * 11) : MIN_POINT_SPACING;
  const slots = visual.type === 'bar' ? pointCount : Math.max(1, pointCount - 1);
  return Math.max(CHART_WIDTH, PLOT.left + PLOT.right + slots * spacing);
}

function xPosition(index: number, count: number, chartWidth: number) {
  const width = chartWidth - PLOT.left - PLOT.right;
  return PLOT.left + (count <= 1 ? width / 2 : (index / (count - 1)) * width);
}

function yPosition(value: number, scale: ReturnType<typeof chartScale>) {
  const height = CHART_HEIGHT - PLOT.top - PLOT.bottom;
  return PLOT.top + ((scale.max - value) / scale.span) * height;
}

function labelIndexes(count: number, availableWidth = CHART_WIDTH - PLOT.left - PLOT.right) {
  const labelCount = Math.max(2, Math.min(count, Math.floor(availableWidth / 74)));
  if (count <= labelCount) return new Set(Array.from({ length: count }, (_, index) => index));
  return new Set(Array.from({ length: labelCount }, (_, index) => Math.round((index / (labelCount - 1)) * (count - 1))));
}

function lineSegments(values: Array<number | null>) {
  const segments: Array<Array<{ value: number; index: number }>> = [];
  let current: Array<{ value: number; index: number }> = [];
  values.forEach((value, index) => {
    if (value === null) {
      if (current.length) segments.push(current);
      current = [];
      return;
    }
    current.push({ value, index });
  });
  if (current.length) segments.push(current);
  return segments;
}

function wrapCanvasText(context: CanvasRenderingContext2D, value: string, maxWidth: number, maxLines = 2) {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = word;
    if (lines.length >= maxLines - 1) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length && words.join(' ') !== lines.join(' ')) {
    let last = lines.at(-1) ?? '';
    while (last && context.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    lines[lines.length - 1] = `${last.trim()}…`;
  }
  return lines;
}

function drawDownloadCanvas(visual: AiVisualization) {
  const width = visual.type === 'table'
    ? 1600
    : Math.min(12_000, Math.max(1600, 300 + visual.labels.length * 22));
  const rowHeight = visual.type === 'table' ? 78 : 0;
  const height = visual.type === 'table' ? Math.max(760, 300 + visual.rows.length * rowHeight) : 1000;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return null;

  context.fillStyle = '#F6F1E7';
  context.fillRect(0, 0, width, height);
  context.fillStyle = '#FFFFFF';
  context.beginPath();
  context.roundRect(70, 60, width - 140, height - 120, 38);
  context.fill();
  context.strokeStyle = '#E4DED2';
  context.lineWidth = 2;
  context.stroke();

  context.fillStyle = '#7E9B86';
  context.font = '700 24px Montserrat, Arial, sans-serif';
  context.fillText('PT MOTIVATOR · AI VISUAL', 120, 125);
  context.fillStyle = '#292C29';
  context.font = '700 48px Montserrat, Arial, sans-serif';
  context.fillText(visual.title, 120, 190);
  if (visual.subtitle) {
    context.fillStyle = '#78716C';
    context.font = '500 25px Montserrat, Arial, sans-serif';
    context.fillText(visual.subtitle, 120, 232);
  }

  if (visual.type === 'table') {
    const left = 120;
    const top = 280;
    const tableWidth = width - 240;
    const columnWidth = tableWidth / visual.columns.length;
    context.fillStyle = '#1F2F46';
    context.beginPath();
    context.roundRect(left, top, tableWidth, 64, 16);
    context.fill();
    context.font = '700 21px Montserrat, Arial, sans-serif';
    context.fillStyle = '#FFFFFF';
    visual.columns.forEach((column, index) => context.fillText(column, left + index * columnWidth + 18, top + 41));
    visual.rows.forEach((row, rowIndex) => {
      const y = top + 64 + rowIndex * rowHeight;
      context.fillStyle = rowIndex % 2 ? '#F8F6F1' : '#FFFFFF';
      context.fillRect(left, y, tableWidth, rowHeight);
      context.strokeStyle = '#E8E3DA';
      context.beginPath();
      context.moveTo(left, y + rowHeight);
      context.lineTo(left + tableWidth, y + rowHeight);
      context.stroke();
      row.forEach((cell, columnIndex) => {
        context.fillStyle = columnIndex === 0 ? '#292C29' : '#57534E';
        context.font = `${columnIndex === 0 ? '700' : '500'} 19px Montserrat, Arial, sans-serif`;
        wrapCanvasText(context, cell || '—', columnWidth - 32).forEach((line, lineIndex) => {
          context.fillText(line, left + columnIndex * columnWidth + 18, y + 30 + lineIndex * 24);
        });
      });
    });
  } else {
    const left = 150;
    const top = 310;
    const plotWidth = width - 300;
    const plotHeight = 500;
    const scale = chartScale(visual);
    context.font = '500 19px Montserrat, Arial, sans-serif';
    for (let tick = 0; tick <= 4; tick += 1) {
      const ratio = tick / 4;
      const y = top + ratio * plotHeight;
      const value = scale.max - ratio * scale.span;
      context.strokeStyle = '#E8E3DA';
      context.beginPath();
      context.moveTo(left, y);
      context.lineTo(left + plotWidth, y);
      context.stroke();
      context.fillStyle = '#78716C';
      context.textAlign = 'right';
      context.fillText(formatNumber(value), left - 18, y + 6);
    }
    context.textAlign = 'center';
    const indexes = labelIndexes(visual.labels.length, plotWidth);
    visual.labels.forEach((label, index) => {
      if (!indexes.has(index)) return;
      const x = left + (visual.labels.length <= 1 ? plotWidth / 2 : (index / (visual.labels.length - 1)) * plotWidth);
      context.fillStyle = '#78716C';
      context.fillText(label, x, top + plotHeight + 42);
    });

    if (visual.type === 'line') {
      visual.series.forEach((series, seriesIndex) => {
        context.strokeStyle = SERIES_COLORS[seriesIndex];
        context.fillStyle = SERIES_COLORS[seriesIndex];
        context.lineWidth = 6;
        lineSegments(series.values).forEach(segment => {
          context.beginPath();
          segment.forEach((point, pointIndex) => {
            const x = left + (point.index / Math.max(1, visual.labels.length - 1)) * plotWidth;
            const y = top + ((scale.max - point.value) / scale.span) * plotHeight;
            if (pointIndex === 0) context.moveTo(x, y);
            else context.lineTo(x, y);
          });
          context.stroke();
        });
        series.values.forEach((value, index) => {
          if (value === null) return;
          const x = left + (index / Math.max(1, visual.labels.length - 1)) * plotWidth;
          const y = top + ((scale.max - value) / scale.span) * plotHeight;
          context.beginPath();
          context.arc(x, y, 7, 0, Math.PI * 2);
          context.fill();
        });
      });
    } else {
      const groupWidth = plotWidth / visual.labels.length;
      const barWidth = Math.min(64, (groupWidth * 0.72) / visual.series.length);
      visual.series.forEach((series, seriesIndex) => {
        context.fillStyle = SERIES_COLORS[seriesIndex];
        series.values.forEach((value, index) => {
          if (value === null) return;
          const barHeight = ((value - scale.min) / scale.span) * plotHeight;
          const groupLeft = left + index * groupWidth;
          const x = groupLeft + (groupWidth - barWidth * visual.series.length) / 2 + seriesIndex * barWidth;
          context.fillRect(x, top + plotHeight - barHeight, Math.max(4, barWidth - 4), barHeight);
        });
      });
    }

    context.textAlign = 'left';
    visual.series.forEach((series, index) => {
      const x = left + index * 270;
      context.fillStyle = SERIES_COLORS[index];
      context.beginPath();
      context.arc(x, top + plotHeight + 95, 8, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#44403C';
      context.font = '600 21px Montserrat, Arial, sans-serif';
      context.fillText(`${series.name}${series.unit ? ` (${series.unit})` : ''}`, x + 18, top + plotHeight + 102);
    });
  }

  if (visual.footnote) {
    context.fillStyle = '#78716C';
    context.font = '500 19px Montserrat, Arial, sans-serif';
    context.textAlign = 'left';
    context.fillText(visual.footnote, 120, height - 92);
  }
  return canvas;
}

function downloadPng(visual: AiVisualization) {
  const canvas = drawDownloadCanvas(visual);
  if (!canvas) return;
  canvas.toBlob(blob => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = safeFilename(visual.title);
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 500);
  }, 'image/png');
}

function LineChart({ visual, selected, onSelect }: { visual: AiChartVisualization; selected: VisualSelection | null; onSelect: (selection: VisualSelection) => void }) {
  const scale = chartScale(visual);
  const chartWidth = renderedChartWidth(visual);
  const indexes = labelIndexes(visual.labels.length, chartWidth - PLOT.left - PLOT.right);
  return (
    <svg viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT}`} role="img" aria-label={`${visual.title}. ${visual.series.map(series => series.name).join(', ')} over ${visual.labels.length} points.`} className="block h-auto max-w-none overflow-visible" style={{ width: `${chartWidth}px` }}>
      <title>{visual.title}</title>
      <desc>{visual.subtitle || `${visual.series.map(series => series.name).join(', ')} trend across ${visual.labels.join(', ')}.`}</desc>
      {Array.from({ length: 5 }, (_, tick) => {
        const y = PLOT.top + (tick / 4) * (CHART_HEIGHT - PLOT.top - PLOT.bottom);
        const value = scale.max - (tick / 4) * scale.span;
        return <g key={tick}><line x1={PLOT.left} x2={chartWidth - PLOT.right} y1={y} y2={y} stroke="#E7E1D8" strokeWidth="1" /><text x={PLOT.left - 7} y={y + 3.5} textAnchor="end" fontSize="10" fill="#A8A29E">{formatNumber(value)}</text></g>;
      })}
      {visual.labels.map((label, index) => indexes.has(index) ? <text key={`${label}-${index}`} x={xPosition(index, visual.labels.length, chartWidth)} y={CHART_HEIGHT - 15} textAnchor="middle" fontSize="10" fill="#A8A29E">{label}</text> : null)}
      {visual.series.map((series, seriesIndex) => (
        <g key={series.name}>
          {lineSegments(series.values).map((segment, segmentIndex) => <polyline key={segmentIndex} points={segment.map(point => `${xPosition(point.index, visual.labels.length, chartWidth)},${yPosition(point.value, scale)}`).join(' ')} fill="none" stroke={SERIES_COLORS[seriesIndex]} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />)}
          {series.values.map((value, index) => {
            if (value === null) return null;
            const isSelected = selected?.kind === 'point' && selected.label === visual.labels[index] && selected.series === series.name;
            const selection: VisualSelection = { kind: 'point', label: visual.labels[index], series: series.name, value, unit: series.unit };
            const ariaLabel = `${visual.labels[index]}, ${series.name}: ${formatNumber(value)}${series.unit ? ` ${series.unit}` : ''}`;
            const x = xPosition(index, visual.labels.length, chartWidth);
            const y = yPosition(value, scale);
            return <g key={index} role="button" tabIndex={0} aria-label={ariaLabel} className="cursor-pointer outline-none" onClick={() => onSelect(selection)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(selection); } }}><circle cx={x} cy={y} r="8" fill="transparent" /><circle cx={x} cy={y} r={isSelected ? 6.2 : 4.2} fill={isSelected ? SERIES_COLORS[seriesIndex] : 'white'} stroke={SERIES_COLORS[seriesIndex]} strokeWidth="2.4" pointerEvents="none" /><title>{ariaLabel}</title></g>;
          })}
        </g>
      ))}
    </svg>
  );
}

function BarChart({ visual, selected, onSelect }: { visual: AiChartVisualization; selected: VisualSelection | null; onSelect: (selection: VisualSelection) => void }) {
  const scale = chartScale(visual);
  const chartWidth = renderedChartWidth(visual);
  const plotWidth = chartWidth - PLOT.left - PLOT.right;
  const groupWidth = plotWidth / visual.labels.length;
  const barWidth = Math.min(28, (groupWidth * 0.72) / visual.series.length);
  const indexes = labelIndexes(visual.labels.length, plotWidth);
  return (
    <svg viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT}`} role="img" aria-label={`${visual.title}. Bar chart with ${visual.labels.length} groups.`} className="block h-auto max-w-none overflow-visible" style={{ width: `${chartWidth}px` }}>
      <title>{visual.title}</title>
      <desc>{visual.subtitle || `${visual.series.map(series => series.name).join(', ')} compared across ${visual.labels.join(', ')}.`}</desc>
      {Array.from({ length: 5 }, (_, tick) => {
        const y = PLOT.top + (tick / 4) * (CHART_HEIGHT - PLOT.top - PLOT.bottom);
        const value = scale.max - (tick / 4) * scale.span;
        return <g key={tick}><line x1={PLOT.left} x2={chartWidth - PLOT.right} y1={y} y2={y} stroke="#E7E1D8" strokeWidth="1" /><text x={PLOT.left - 7} y={y + 3.5} textAnchor="end" fontSize="10" fill="#A8A29E">{formatNumber(value)}</text></g>;
      })}
      {visual.labels.map((label, index) => indexes.has(index) ? <text key={`${label}-${index}`} x={PLOT.left + groupWidth * (index + 0.5)} y={CHART_HEIGHT - 15} textAnchor="middle" fontSize="10" fill="#A8A29E">{label}</text> : null)}
      {visual.series.flatMap((series, seriesIndex) => series.values.map((value, index) => {
        if (value === null) return null;
        const height = ((value - scale.min) / scale.span) * (CHART_HEIGHT - PLOT.top - PLOT.bottom);
        const x = PLOT.left + index * groupWidth + (groupWidth - barWidth * visual.series.length) / 2 + seriesIndex * barWidth;
        const isSelected = selected?.kind === 'point' && selected.label === visual.labels[index] && selected.series === series.name;
        const selection: VisualSelection = { kind: 'point', label: visual.labels[index], series: series.name, value, unit: series.unit };
        const ariaLabel = `${visual.labels[index]}, ${series.name}: ${formatNumber(value)}${series.unit ? ` ${series.unit}` : ''}`;
        return <rect key={`${series.name}-${index}`} role="button" tabIndex={0} aria-label={ariaLabel} className="cursor-pointer outline-none" onClick={() => onSelect(selection)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(selection); } }} x={x} y={CHART_HEIGHT - PLOT.bottom - height} width={Math.max(3, barWidth - 2)} height={height} rx="3" fill={SERIES_COLORS[seriesIndex]} stroke={isSelected ? '#1F2F46' : 'none'} strokeWidth={isSelected ? 2 : 0}><title>{ariaLabel}</title></rect>;
      }))}
    </svg>
  );
}

export default function AiVisualizationCard({ visual }: { visual: AiVisualization }) {
  const [selected, setSelected] = useState<VisualSelection | null>(null);
  const selectColumn = (columnIndex: number) => {
    if (visual.type !== 'table') return;
    setSelected({
      kind: 'column',
      column: visual.columns[columnIndex],
      values: visual.rows.map(row => ({ label: row[0] || 'Row', value: row[columnIndex] || '—' })),
    });
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-[#D7DDD7] bg-white shadow-[0_10px_28px_rgba(71,59,43,0.08)]" aria-label={visual.title}>
      <div className="flex items-start justify-between gap-3 border-b border-stone-100 bg-gradient-to-br from-white to-[#F3F6F3] px-4 py-3.5">
        <div className="min-w-0">
          <p className="text-[9px] font-extrabold uppercase tracking-[0.16em] text-[#7E9B86]">AI visual</p>
          <h3 className="mt-0.5 text-sm font-bold leading-snug text-stone-800">{visual.title}</h3>
          {visual.subtitle && <p className="mt-1 text-[10px] leading-snug text-stone-500">{visual.subtitle}</p>}
        </div>
        <button type="button" onClick={() => downloadPng(visual)} className="flex min-h-8 shrink-0 items-center gap-1 rounded-lg border border-stone-200 bg-white px-2 text-[9px] font-extrabold uppercase tracking-wide text-stone-500 shadow-sm transition hover:border-stone-300 hover:text-stone-700" aria-label={`Download ${visual.title} as PNG`} title="Download PNG">
          <span aria-hidden="true">↓</span> PNG
        </button>
      </div>

      {visual.type === 'table' ? (
        <div className="max-w-full overflow-x-auto">
          <table className="w-full min-w-[430px] border-collapse text-left">
            <thead><tr className="bg-[#1F2F46] text-white">{visual.columns.map((column, columnIndex) => <th key={column} scope="col" className="px-2 py-1.5 text-left"><button type="button" onClick={() => selectColumn(columnIndex)} className="w-full rounded px-1 py-1 text-left text-[10px] font-bold uppercase tracking-wide hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70" aria-label={`Inspect ${column} column`}>{column}</button></th>)}</tr></thead>
            <tbody>{visual.rows.map((row, rowIndex) => <tr key={rowIndex} className={rowIndex % 2 ? 'bg-[#FAF8F3]' : 'bg-white'}>{row.map((cell, columnIndex) => <td key={columnIndex} className={`border-b border-stone-100 p-1.5 align-top text-[11px] leading-snug ${columnIndex === 0 ? 'font-bold text-stone-800' : 'text-stone-600'}`}><button type="button" onClick={() => setSelected({ kind: 'cell', label: row[0] || `Row ${rowIndex + 1}`, column: visual.columns[columnIndex], value: cell || '—' })} className="w-full rounded px-1.5 py-1 text-left hover:bg-[#EAF1EC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7E9B86]/50">{cell || '—'}</button></td>)}</tr>)}</tbody>
          </table>
        </div>
      ) : (
        <div className="max-w-full overflow-x-auto overscroll-x-contain px-3 pb-2 pt-3">
          {visual.labels.length > 24 && <p className="sticky left-0 mb-1 w-fit rounded-full bg-[#F0F5F1] px-2 py-1 text-[9px] font-bold text-[#52705C]">All {visual.labels.length} points · scroll to explore</p>}
          {visual.type === 'line' ? <LineChart visual={visual} selected={selected} onSelect={setSelected} /> : <BarChart visual={visual} selected={selected} onSelect={setSelected} />}
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 px-2 pb-2">
            {visual.series.map((series, index) => <span key={series.name} className="flex items-center gap-1.5 text-[10px] font-semibold text-stone-600"><span className="h-2 w-2 rounded-full" style={{ background: SERIES_COLORS[index] }} aria-hidden="true" />{series.name}{series.unit ? ` (${series.unit})` : ''}</span>)}
          </div>
        </div>
      )}
      {selected && (
        <div className="border-t border-[#DDE5DF] bg-[#F0F5F1] px-4 py-2.5" aria-live="polite">
          {selected.kind === 'point' && <p className="text-xs font-bold text-stone-800"><span className="text-[#52705C]">{selected.label}</span> · {selected.series}: {formatNumber(selected.value)}{selected.unit ? ` ${selected.unit}` : ''}</p>}
          {selected.kind === 'cell' && <p className="text-xs font-bold text-stone-800"><span className="text-[#52705C]">{selected.label}</span> · {selected.column}: {selected.value}</p>}
          {selected.kind === 'column' && <div><p className="text-[10px] font-extrabold uppercase tracking-wide text-[#52705C]">{selected.column}</p><div className="mt-1.5 flex flex-wrap gap-1.5">{selected.values.map((item, index) => <span key={`${item.label}-${index}`} className="rounded-full border border-[#CDD9D0] bg-white px-2 py-1 text-[10px] font-semibold text-stone-600">{item.label}: <span className="text-stone-800">{item.value}</span></span>)}</div></div>}
        </div>
      )}
      {visual.footnote && <p className="border-t border-stone-100 bg-[#FAF8F3] px-4 py-2.5 text-[10px] leading-snug text-stone-500">{visual.footnote}</p>}
    </section>
  );
}
