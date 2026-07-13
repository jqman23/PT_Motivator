'use client';

import { useMemo, useState } from 'react';
import { Exercise } from '@/lib/exercises';
import { CategoryConfig } from '@/lib/layout';
import { stripSecretNotes } from '@/lib/secretNotes';

type LogMap = Record<string, Record<string, boolean>>;
type NotesMap = Record<string, string>;
type PTSession = { date: string; kind?: 'pt' | 'training'; note?: string };

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

type HistoricalNoteRow = { date: string; exercise_id: string; note: string };
type ReportData = {
  healthRows: HealthRow[];
  logRows: Array<{ date: string; exercise_id: string; completed: boolean }>;
  noteRows: HistoricalNoteRow[];
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
  const [reportStartDate, setReportStartDate] = useState(() => offsetDate(today, -13));
  const [reportEndDate, setReportEndDate] = useState(today);
  const [healthRows, setHealthRows] = useState<HealthRow[]>([]);
  const [logRows, setLogRows] = useState<Array<{ date: string; exercise_id: string; completed: boolean }>>([]);
  const [loading, setLoading] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');

  const startDate = reportStartDate;
  const endDate = reportEndDate;
  const rangeDates = useMemo(() => datesInRange(startDate, endDate), [endDate, startDate]);
  const rangeDays = rangeDates.length;

  const sections = useMemo(() => layout.map(cat => ({
    cat,
    exercises: cat.exerciseIds.map(id => exerciseMap[id]).filter(Boolean),
  })).filter(s => s.exercises.length > 0), [layout, exerciseMap]);

  const toggle = (key: ReportSection) => setPrefs(prev => ({ ...prev, [key]: !prev[key] }));

  const loadReportData = async (): Promise<ReportData> => {
    setLoading(true);
    try {
      const [healthRes, logRes, noteRes] = await Promise.all([
        fetch(`/api/health?start=${startDate}&end=${endDate}`).then(r => r.json()).catch(() => ({ rows: [] })),
        fetch(`/api/log?start=${startDate}&end=${endDate}`).then(r => r.json()).catch(() => ({ rows: [] })),
        fetch(`/api/notes?start=${startDate}&end=${endDate}&includePhotos=false`).then(r => r.json()).catch(() => ({ rows: [] })),
      ]);
      const next: ReportData = {
        healthRows: (healthRes.rows ?? []).map((r: HealthRow) => ({ ...r, date: String(r.date).split('T')[0] })),
        logRows: (logRes.rows ?? []).map((r: { date: string; exercise_id: string; completed: boolean }) => ({ ...r, date: String(r.date).split('T')[0] })),
        noteRows: (noteRes.rows ?? []).map((r: HistoricalNoteRow) => ({ ...r, date: String(r.date).split('T')[0] })),
      };
      setHealthRows(next.healthRows);
      setLogRows(next.logRows);
      return next;
    } finally {
      setLoading(false);
    }
  };

  const buildReportHtml = (data: Pick<ReportData, 'healthRows' | 'logRows'> = { healthRows, logRows }) => {
    const healthByDate = Object.fromEntries(data.healthRows.map(h => [h.date, h]));
    const historicalLog: LogMap = {};
    for (const row of data.logRows) {
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
    const ptInRange = ptSessions.filter(s => s.date >= startDate && s.date <= endDate);
    const currentNotes = Object.entries(notes)
      .map(([id, note]) => [id, stripSecretNotes(note)] as const)
      .filter(([, note]) => note.trim());
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
      const treatmentNotes = stripSecretNotes(h?.treatment_notes);
      if (!treatmentNotes.trim()) return '';
      return `<li><strong>${displayDate(d)}:</strong> ${nl(treatmentNotes)}</li>`;
    }).filter(Boolean).join('');

    const painHtml = rangeDates.map(d => {
      const h = healthByDate[d];
      const painNotes = stripSecretNotes(h?.pain_notes);
      if (num(h?.pain) === null && !painNotes.trim()) return '';
      return `<li><strong>${displayDate(d)}:</strong> pain ${num(h?.pain) ?? '—'}/10${painNotes ? ` — ${nl(painNotes)}` : ''}</li>`;
    }).filter(Boolean).join('');

    const healthNotesHtml = rangeDates.map(d => {
      const h = healthByDate[d];
      if (!h) return '';
      const bits = [
        stripSecretNotes(h.sleep_notes) ? `Sleep duration note: ${nl(stripSecretNotes(h.sleep_notes))}` : '',
        stripSecretNotes(h.sleep_quality_notes) ? `Sleep quality note: ${nl(stripSecretNotes(h.sleep_quality_notes))}` : '',
        stripSecretNotes(h.energy_notes) ? `Energy note: ${nl(stripSecretNotes(h.energy_notes))}` : '',
        stripSecretNotes(h.mood_notes) ? `Mood note: ${nl(stripSecretNotes(h.mood_notes))}` : '',
        stripSecretNotes(h.general_notes) ? `General: ${nl(stripSecretNotes(h.general_notes))}` : '',
      ].filter(Boolean);
      if (!bits.length) return '';
      return `<li><strong>${displayDate(d)}:</strong><br/>${bits.join('<br/>')}</li>`;
    }).filter(Boolean).join('');

    const ptHtml = ptInRange.map(s => {
      const sessionNote = stripSecretNotes(s.note);
      return `<li><strong>${displayDate(s.date)}:</strong> ${escapeHtml(s.kind === 'training' ? 'Training session' : 'PT session')}${sessionNote.trim() ? ` — ${nl(sessionNote)}` : ''}</li>`;
    }).join('');
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
    </style></head><body><h1>${escapeHtml(appTitle)} — PT Report</h1><div class="meta">Generated ${displayDate(today)} · Range ${displayDate(startDate)} – ${displayDate(endDate)} · Selected day ${displayDate(selectedDate)}</div>${body}<script>window.onload=()=>setTimeout(()=>window.print(),250)</script></body></html>`;
  };

  const generatePdf = async () => {
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write('<p style="font-family:Arial,sans-serif;padding:24px">Preparing report…</p>');
    try {
      const data = await loadReportData();
      const html = buildReportHtml(data);
      win.document.open();
      win.document.write(html);
      win.document.close();
    } catch {
      win.document.open();
      win.document.write('<p style="font-family:Arial,sans-serif;padding:24px">Could not prepare the report. Please close this window and try again.</p>');
      win.document.close();
    }
  };

  const prepareJson = async () => {
    const data = await loadReportData();
    const healthByDate = Object.fromEntries(data.healthRows.map(row => [row.date, row]));
    const notesByDate = new Map<string, HistoricalNoteRow[]>();
    for (const row of data.noteRows) {
      notesByDate.set(row.date, [...(notesByDate.get(row.date) ?? []), row]);
    }
    const logsByDate = new Map<string, ReportData['logRows']>();
    for (const row of data.logRows) {
      logsByDate.set(row.date, [...(logsByDate.get(row.date) ?? []), row]);
    }

    const payload = {
      exportVersion: 1,
      generatedAt: new Date().toISOString(),
      appTitle,
      range: { startDate, endDate, days: rangeDays },
      dates: rangeDates.map(date => {
        const health = healthByDate[date];
        return {
          date,
          completedExercises: (logsByDate.get(date) ?? [])
            .filter(row => row.completed)
            .map(row => ({
              id: row.exercise_id,
              name: exerciseMap[row.exercise_id]?.name ?? row.exercise_id,
              type: exerciseMap[row.exercise_id]?.cat ?? null,
            })),
          healthMetrics: health ? {
            sleepHours: num(health.sleep_hours),
            sleepQuality: num(health.sleep_quality),
            energy: num(health.energy),
            mood: num(health.mood),
            pain: num(health.pain),
          } : null,
          healthNotes: health ? {
            sleep: stripSecretNotes(health.sleep_notes),
            sleepQuality: stripSecretNotes(health.sleep_quality_notes),
            energy: stripSecretNotes(health.energy_notes),
            mood: stripSecretNotes(health.mood_notes),
            pain: stripSecretNotes(health.pain_notes),
          } : null,
          medicationsAndTreatments: stripSecretNotes(health?.treatment_notes),
          generalNotes: stripSecretNotes(health?.general_notes),
          exerciseNotes: (notesByDate.get(date) ?? []).map(row => ({
            exerciseId: row.exercise_id,
            exerciseName: exerciseMap[row.exercise_id]?.name ?? row.exercise_id,
            note: stripSecretNotes(row.note),
          })).filter(row => row.note.trim()),
          sessions: ptSessions
            .filter(session => session.date === date)
            .map(session => ({ kind: session.kind === 'training' ? 'training' : 'pt', note: stripSecretNotes(session.note) })),
        };
      }),
    };

    return JSON.stringify(payload, null, 2);
  };

  const exportJson = async () => {
    const json = await prepareJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const slug = appTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'pt-data';
    anchor.href = url;
    anchor.download = `${slug}-${startDate}-to-${endDate}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const copyJson = async () => {
    setCopyStatus('');
    try {
      const json = await prepareJson();
      try {
        await navigator.clipboard.writeText(json);
      } catch {
        const textarea = document.createElement('textarea');
        textarea.value = json;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.append(textarea);
        textarea.focus();
        textarea.select();
        const copied = document.execCommand('copy');
        textarea.remove();
        if (!copied) throw new Error('Clipboard unavailable');
      }
      setCopyStatus('JSON copied');
    } catch {
      setCopyStatus('Could not copy JSON');
    }
    window.setTimeout(() => setCopyStatus(''), 1800);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm sm:px-4 sm:py-8" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div className="bg-[#F6F1E7] w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col" onClick={e => e.stopPropagation()} style={{ maxHeight: '92dvh' }}>
        <div className="px-4 py-3 border-b border-stone-200 flex items-center justify-between flex-shrink-0">
          <div><h2 className="font-serif text-lg font-semibold text-stone-800">Reports &amp; exports</h2><p className="text-[11px] text-stone-400">Create a PT PDF or export your data as JSON.</p></div>
          <button onClick={e => { e.preventDefault(); e.stopPropagation(); onClose(); }} className="w-9 h-9 rounded-full hover:bg-stone-200 flex items-center justify-center text-stone-500 text-xl">×</button>
        </div>

        <div className="overflow-y-auto px-4 py-4 space-y-4">
          <div className="bg-white rounded-2xl border border-stone-100 p-3">
            <p className="text-sm font-bold text-stone-800 mb-2">Date range</p>
            <div className="grid grid-cols-4 gap-1.5">
              {[7, 14, 30, 90].map(days => {
                const presetStart = offsetDate(today, -(days - 1));
                const active = startDate === presetStart && endDate === today;
                return <button key={days} onClick={e => { e.preventDefault(); e.stopPropagation(); setReportStartDate(presetStart); setReportEndDate(today); }} className="rounded-lg py-2 text-xs font-bold border" style={{ background: active ? '#E4ECE6' : '#fff', color: active ? '#476653' : '#78716c', borderColor: active ? '#cfded3' : '#e7e5e4' }}>{days}d</button>;
              })}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="text-[10px] font-bold uppercase tracking-wider text-stone-400">From<input type="date" value={startDate} min={offsetDate(endDate, -399)} max={endDate} onChange={e => { if (e.target.value) setReportStartDate(e.target.value); }} className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-2 py-2 text-sm font-normal normal-case tracking-normal text-stone-700" style={{ fontSize: 16 }} /></label>
              <label className="text-[10px] font-bold uppercase tracking-wider text-stone-400">To<input type="date" value={endDate} min={startDate} max={today} onChange={e => { if (e.target.value) setReportEndDate(e.target.value); }} className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-2 py-2 text-sm font-normal normal-case tracking-normal text-stone-700" style={{ fontSize: 16 }} /></label>
            </div>
          </div>

          <div className="space-y-2">
            <p className="px-1 text-[10px] font-bold uppercase tracking-wider text-stone-400">PDF sections</p>
            {SECTION_OPTIONS.map(opt => <button key={opt.key} onClick={e => { e.preventDefault(); e.stopPropagation(); toggle(opt.key); }} className="w-full bg-white rounded-xl border border-stone-100 px-3 py-3 flex items-center justify-between gap-3 text-left" style={{ touchAction: 'manipulation' }}>
              <div className="min-w-0"><p className="text-sm font-semibold text-stone-800">{opt.label}</p><p className="text-xs text-stone-400 mt-0.5">{opt.description}</p></div>
              <span className="w-11 h-6 rounded-full p-0.5 flex-shrink-0 transition-colors" style={{ background: prefs[opt.key] ? '#7E9B86' : '#e7e5e4' }}><span className="block w-5 h-5 rounded-full bg-white shadow-sm transition-transform" style={{ transform: prefs[opt.key] ? 'translateX(20px)' : 'translateX(0)' }} /></span>
            </button>)}
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <button onClick={e => { e.preventDefault(); e.stopPropagation(); void generatePdf(); }} disabled={loading} className="w-full py-3 rounded-2xl text-sm font-bold text-white disabled:opacity-50" style={{ background: '#7E9B86', touchAction: 'manipulation' }}>{loading ? 'Preparing…' : 'Generate PDF'}</button>
            <button onClick={e => { e.preventDefault(); e.stopPropagation(); void exportJson(); }} disabled={loading} className="w-full rounded-2xl border border-[#cfded3] bg-white py-3 text-sm font-bold text-[#476653] disabled:opacity-50" style={{ touchAction: 'manipulation' }}>{loading ? 'Preparing…' : 'Export JSON'}</button>
            <button onClick={e => { e.preventDefault(); e.stopPropagation(); void copyJson(); }} disabled={loading} className="w-full rounded-2xl border border-stone-200 bg-stone-100 py-3 text-sm font-bold text-stone-600 disabled:opacity-50" style={{ touchAction: 'manipulation' }}>{loading ? 'Preparing…' : 'Copy JSON'}</button>
          </div>
          {copyStatus && <p className="text-center text-xs font-semibold text-[#476653]">{copyStatus}</p>}
          <p className="text-[11px] text-stone-400 text-center leading-relaxed">PDF opens a print-ready report. JSON downloads complete structured data for the selected range.</p>
        </div>
      </div>
    </div>
  );
}
