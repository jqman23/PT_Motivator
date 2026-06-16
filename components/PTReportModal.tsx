'use client';

import { useMemo, useState } from 'react';
import { Exercise } from '@/lib/exercises';
import { CategoryConfig } from '@/lib/layout';

type LogMap = Record<string, Record<string, boolean>>;
type NotesMap = Record<string, string>;
type PTSession = { date: string; note?: string };

type HealthRow = {
  date: string;
  sleep_hours?: number | string | null;
  sleep_quality?: number | string | null;
  energy?: number | string | null;
  mood?: number | string | null;
  pain?: number | string | null;
  sleep_notes?: string | null;
  sleep_quality_notes?: string | null;
  energy_notes?: string | null;
  mood_notes?: string | null;
  pain_notes?: string | null;
  treatment_notes?: string | null;
  general_notes?: string | null;
};

interface Props {
  appTitle: string;
  today: string;
  selectedDate: string;
  layout: CategoryConfig[];
  exerciseMap: Record<string, Exercise>;
  log: LogMap;
  notes: NotesMap;
  ptSessions: PTSession[];
  onClose: () => void;
}

type ReportSection =
  | 'summary'
  | 'program'
  | 'completion'
  | 'health'
  | 'pain'
  | 'treatments'
  | 'ptSessions'
  | 'notes'
  | 'questions';

type ReportPrefs = Record<ReportSection, boolean>;

const DEFAULT_PREFS: ReportPrefs = {
  summary: true,
  program: true,
  completion: true,
  health: true,
  pain: true,
  treatments: true,
  ptSessions: true,
  notes: true,
  questions: true,
};

const SECTION_OPTIONS: { key: ReportSection; label: string; description: string }[] = [
  { key: 'summary', label: 'Snapshot summary', description: 'High-level recovery snapshot and date range.' },
  { key: 'program', label: 'Current program', description: 'Exercises, sets, cues, and instructions.' },
  { key: 'completion', label: 'Completion/adherence', description: 'Completed exercises and recent consistency.' },
  { key: 'health', label: 'Health metrics', description: 'Sleep, energy, mood, and general notes.' },
  { key: 'pain', label: 'Pain details', description: 'Pain levels and pain-specific notes.' },
  { key: 'treatments', label: 'Meds/treatments', description: 'Medication, icing, compression, and treatment logs.' },
  { key: 'ptSessions', label: 'PT session days', description: 'PT appointment dates and notes.' },
  { key: 'notes', label: 'Exercise notes', description: 'Current-day exercise-specific notes.' },
  { key: 'questions', label: 'Questions for PT', description: 'Blank space for follow-up items.' },
];

function pad(n: number) { return String(n).padStart(2, '0'); }
function offsetDate(base: string, days: number): string {
  const d = new Date(base + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function datesInRange(start: string, end: string): string[] {
  const out: string[] = [];
  let cur = start;
  while (cur <= end) { out.push(cur); cur = offsetDate(cur, 1); }
  return out;
}
function displayDate(ds: string) {
  return new Date(ds + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}
function num(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function avg(values: Array<number | null>) {
  const valid = values.filter((v): v is number => typeof v === 'number');
  if (!valid.length) return null;
  return (valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(1);
}
function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
function nl(value?: string | null) {
  return escapeHtml(value ?? '').replace(/\n/g, '<br/>');
}

export default function PTReportModal({ appTitle, today, selectedDate, layout, exerciseMap, log, notes, ptSessions, onClose }: Props) {
  const [prefs, setPrefs] = useState<ReportPrefs>(DEFAULT_PREFS);
  const [rangeDays, setRangeDays] = useState(14);
  const [healthRows, setHealthRows] = useState<HealthRow[]>([]);
  const [logRows, setLogRows] = useState<Array<{ date: string; exercise_id: string; completed: boolean }>>([]);
  const [loading, setLoading] = useState(false);

  const startDate = useMemo(() => offsetDate(today, -(rangeDays - 1)), [today, rangeDays]);
  const rangeDates = useMemo(() => datesInRange(startDate, today), [startDate, today]);

  const sections = useMemo(() => layout.map(cat => ({
    cat,
    exercises: cat.exerciseIds.map(id => exerciseMap[id]).filter(Boolean),
  })).filter(s => s.exercises.length > 0), [layout, exerciseMap]);

  const toggle = (key: ReportSection) => setPrefs(prev => ({ ...prev, [key]: !prev[key] }));

  const loadReportData = async () => {
    setLoading(true);
    try {
      const [healthRes, logRes] = await Promise.all([
        fetch(`/api/health?start=${startDate}&end=${today}`).then(r => r.json()).catch(() => ({ rows: [] })),
        fetch(`/api/log?start=${startDate}&end=${today}`).then(r => r.json()).catch(() => ({ rows: [] })),
      ]);
      setHealthRows((healthRes.rows ?? []).map((r: HealthRow) => ({ ...r, date: String(r.date).split('T')[0] })));
      setLogRows((logRes.rows ?? []).map((r: { date: string; exercise_id: string; completed: boolean }) => ({ ...r, date: String(r.date).split('T')[0] })));
    } finally {
      setLoading(false);
    }
  };

  const buildReportHtml = () => {
    const healthByDate = Object.fromEntries(healthRows.map(h => [h.date, h]));
    const historicalLog: LogMap = {};
    for (const row of logRows) {
      if (!historicalLog[row.date]) historicalLog[row.date] = {};
      historicalLog[row.date][row.exercise_id] = row.completed;
    }
    const allExercises = sections.flatMap(s => s.exercises);
    const completedTotal = rangeDates.reduce((sum, d) => sum + allExercises.filter(ex => historicalLog[d]?.[ex.id]).length, 0);
    const possibleTotal = rangeDates.length * allExercises.length;
    const completionRate = possibleTotal ? Math.round((completedTotal / possibleTotal) * 100) : 0;
    const healthInRange = rangeDates.map(d => healthByDate[d]).filter(Boolean);
    const painAvg = avg(healthInRange.map(h => num(h.pain)));
    const energyAvg = avg(healthInRange.map(h => num(h.energy)));
    const moodAvg = avg(healthInRange.map(h => num(h.mood)));
    const sleepAvg = avg(healthInRange.map(h => num(h.sleep_hours)));
    const ptInRange = ptSessions.filter(s => s.date >= startDate && s.date <= today);
    const currentNotes = Object.entries(notes).filter(([, note]) => note.trim());
    const currentDone = allExercises.filter(ex => log[selectedDate]?.[ex.id]).length;

    const rows = rangeDates.map(d => {
      const h = healthByDate[d];
      const done = allExercises.filter(ex => historicalLog[d]?.[ex.id]).length;
      return `<tr><td>${displayDate(d)}</td><td>${done}/${allExercises.length}</td><td>${num(h?.pain) ?? '—'}</td><td>${num(h?.energy) ?? '—'}</td><td>${num(h?.mood) ?? '—'}</td><td>${num(h?.sleep_hours) ?? '—'}</td></tr>`;
    }).join('');

    const programHtml = sections.map(section => `
      <h3>${escapeHtml(section.cat.name)}</h3>
      <table><thead><tr><th>Exercise</th><th>Sets</th><th>Cue / details</th><th>Tips</th></tr></thead><tbody>
        ${section.exercises.map(ex => `<tr><td><strong>${escapeHtml(ex.name)}</strong></td><td>${escapeHtml(ex.sets ?? '—')}</td><td>${escapeHtml(ex.cue ?? '')}</td><td>${(ex.tips ?? []).slice(0, 4).map(t => `• ${escapeHtml(t)}`).join('<br/>')}</td></tr>`).join('')}
      </tbody></table>
    `).join('');

    const treatmentHtml = rangeDates.map(d => {
      const h = healthByDate[d];
      if (!h?.treatment_notes?.trim()) return '';
      return `<li><strong>${displayDate(d)}:</strong> ${nl(h.treatment_notes)}</li>`;
    }).filter(Boolean).join('');

    const painHtml = rangeDates.map(d => {
      const h = healthByDate[d];
      if (num(h?.pain) === null && !h?.pain_notes?.trim()) return '';
      return `<li><strong>${displayDate(d)}:</strong> pain ${num(h?.pain) ?? '—'}/10${h?.pain_notes ? ` — ${nl(h.pain_notes)}` : ''}</li>`;
    }).filter(Boolean).join('');

    const healthNotesHtml = rangeDates.map(d => {
      const h = healthByDate[d];
      if (!h) return '';
      const bits = [
        h.sleep_notes ? `Sleep duration note: ${nl(h.sleep_notes)}` : '',
        h.sleep_quality_notes ? `Sleep quality note: ${nl(h.sleep_quality_notes)}` : '',
        h.energy_notes ? `Energy note: ${nl(h.energy_notes)}` : '',
        h.mood_notes ? `Mood note: ${nl(h.mood_notes)}` : '',
        h.general_notes ? `General: ${nl(h.general_notes)}` : '',
      ].filter(Boolean);
      if (!bits.length) return '';
      return `<li><strong>${displayDate(d)}:</strong><br/>${bits.join('<br/>')}</li>`;
    }).filter(Boolean).join('');

    const ptHtml = ptInRange.map(s => `<li><strong>${displayDate(s.date)}:</strong> ${nl(s.note || 'PT session logged')}</li>`).join('');
    const noteHtml = currentNotes.map(([id, note]) => `<li><strong>${escapeHtml(exerciseMap[id]?.name ?? id)}:</strong> ${nl(note)}</li>`).join('');

    const section = (title: string, body: string) => `<section><h2>${title}</h2>${body}</section>`;

    const body = [
      prefs.summary ? section('Snapshot', `<div class="cards"><div><strong>${displayDate(selectedDate)}</strong><span>selected day</span></div><div><strong>${rangeDays} days</strong><span>report range</span></div><div><strong>${currentDone}/${allExercises.length}</strong><span>today completion</span></div><div><strong>${completionRate}%</strong><span>range completion</span></div></div>`) : '',
      prefs.program ? section('Current Home Exercise Program', programHtml || '<p>No exercises currently scheduled.</p>') : '',
      prefs.completion ? section('Completion / Adherence', `<p>Across ${rangeDays} days, ${completedTotal} of ${possibleTotal} planned exercise check-offs were completed (${completionRate}%).</p><table><thead><tr><th>Date</th><th>Done</th><th>Pain</th><th>Energy</th><th>Mood</th><th>Sleep</th></tr></thead><tbody>${rows}</tbody></table>`) : '',
      prefs.health ? section('Health Metrics', `<div class="cards"><div><strong>${sleepAvg ?? '—'}</strong><span>avg sleep hrs</span></div><div><strong>${energyAvg ?? '—'}</strong><span>avg energy</span></div><div><strong>${moodAvg ?? '—'}</strong><span>avg mood</span></div></div>${healthNotesHtml ? `<ul>${healthNotesHtml}</ul>` : '<p>No health notes in this range.</p>'}`) : '',
      prefs.pain ? section('Pain Details', `<p>Average pain in range: <strong>${painAvg ?? '—'}/10</strong></p>${painHtml ? `<ul>${painHtml}</ul>` : '<p>No pain notes logged in this range.</p>'}`) : '',
      prefs.treatments ? section('Meds / Treatments', treatmentHtml ? `<ul>${treatmentHtml}</ul>` : '<p>No meds/treatment notes logged in this range.</p>') : '',
      prefs.ptSessions ? section('PT Sessions', ptHtml ? `<ul>${ptHtml}</ul>` : '<p>No PT sessions logged in this range.</p>') : '',
      prefs.notes ? section('Exercise Notes for Selected Day', noteHtml ? `<ul>${noteHtml}</ul>` : '<p>No exercise-specific notes on selected day.</p>') : '',
      prefs.questions ? section('Questions / Discussion Items for PT', '<ol><li>&nbsp;</li><li>&nbsp;</li><li>&nbsp;</li><li>&nbsp;</li></ol>') : '',
    ].filter(Boolean).join('');

    return `<!doctype html><html><head><title>${escapeHtml(appTitle)} PT Report</title><style>
      body{font-family:Arial,sans-serif;color:#292524;margin:28px;line-height:1.35} h1{font-size:26px;margin:0 0 4px} h2{font-size:17px;margin:22px 0 8px;border-bottom:1px solid #ddd;padding-bottom:5px} h3{font-size:14px;margin:14px 0 6px;color:#476653} p,li,td,th{font-size:12px} .meta{color:#78716c;font-size:12px;margin-bottom:18px}.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:8px 0}.cards div{border:1px solid #e7e5e4;border-radius:10px;padding:8px;background:#fafaf9}.cards strong{display:block;font-size:16px}.cards span{font-size:10px;color:#78716c;text-transform:uppercase;letter-spacing:.04em}table{width:100%;border-collapse:collapse;margin-top:8px}th,td{border:1px solid #e7e5e4;padding:6px;text-align:left;vertical-align:top}th{background:#f5f5f4;font-size:10px;text-transform:uppercase;letter-spacing:.04em}section{break-inside:avoid} @media print{body{margin:18mm}.no-print{display:none}.cards{grid-template-columns:repeat(4,1fr)}}
    </style></head><body><h1>${escapeHtml(appTitle)} — PT Report</h1><div class="meta">Generated ${displayDate(today)} · Range ${displayDate(startDate)} – ${displayDate(today)} · Selected day ${displayDate(selectedDate)}</div>${body}<script>window.onload=()=>setTimeout(()=>window.print(),250)</script></body></html>`;
  };

  const generatePdf = async () => {
    await loadReportData();
    setTimeout(() => {
      const html = buildReportHtml();
      const win = window.open('', '_blank');
      if (!win) return;
      win.document.open();
      win.document.write(html);
      win.document.close();
    }, 100);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm sm:px-4 sm:py-8" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div className="bg-[#F6F1E7] w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col" onClick={e => e.stopPropagation()} style={{ maxHeight: '92dvh' }}>
        <div className="px-4 py-3 border-b border-stone-200 flex items-center justify-between flex-shrink-0">
          <div><h2 className="font-serif text-lg font-semibold text-stone-800">PT PDF report</h2><p className="text-[11px] text-stone-400">Choose what your physical therapist sees.</p></div>
          <button onClick={e => { e.preventDefault(); e.stopPropagation(); onClose(); }} className="w-9 h-9 rounded-full hover:bg-stone-200 flex items-center justify-center text-stone-500 text-xl">×</button>
        </div>

        <div className="overflow-y-auto px-4 py-4 space-y-4">
          <div className="bg-white rounded-2xl border border-stone-100 p-3">
            <p className="text-sm font-bold text-stone-800 mb-2">Report range</p>
            <div className="grid grid-cols-4 gap-1.5">
              {[7, 14, 30, 90].map(days => <button key={days} onClick={e => { e.preventDefault(); e.stopPropagation(); setRangeDays(days); }} className="rounded-lg py-2 text-xs font-bold border" style={{ background: rangeDays === days ? '#E4ECE6' : '#fff', color: rangeDays === days ? '#476653' : '#78716c', borderColor: rangeDays === days ? '#cfded3' : '#e7e5e4' }}>{days}d</button>)}
            </div>
          </div>

          <div className="space-y-2">
            {SECTION_OPTIONS.map(opt => <button key={opt.key} onClick={e => { e.preventDefault(); e.stopPropagation(); toggle(opt.key); }} className="w-full bg-white rounded-xl border border-stone-100 px-3 py-3 flex items-center justify-between gap-3 text-left" style={{ touchAction: 'manipulation' }}>
              <div className="min-w-0"><p className="text-sm font-semibold text-stone-800">{opt.label}</p><p className="text-xs text-stone-400 mt-0.5">{opt.description}</p></div>
              <span className="w-11 h-6 rounded-full p-0.5 flex-shrink-0 transition-colors" style={{ background: prefs[opt.key] ? '#7E9B86' : '#e7e5e4' }}><span className="block w-5 h-5 rounded-full bg-white shadow-sm transition-transform" style={{ transform: prefs[opt.key] ? 'translateX(20px)' : 'translateX(0)' }} /></span>
            </button>)}
          </div>

          <button onClick={e => { e.preventDefault(); e.stopPropagation(); generatePdf(); }} disabled={loading} className="w-full py-3 rounded-2xl text-sm font-bold text-white disabled:opacity-50" style={{ background: '#7E9B86', touchAction: 'manipulation' }}>{loading ? 'Preparing…' : 'Generate PDF'}</button>
          <p className="text-[11px] text-stone-400 text-center leading-relaxed">This opens a print-ready report. Choose “Save as PDF” from the print dialog.</p>
        </div>
      </div>
    </div>
  );
}
