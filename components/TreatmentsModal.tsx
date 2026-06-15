'use client';

import { useEffect, useMemo, useState } from 'react';

interface Props {
  today: string;
  selectedDate: string;
  onClose: () => void;
}

type TreatmentRow = { date: string; treatment_notes?: string | null };

function pad(n: number) { return String(n).padStart(2, '0'); }
function offsetDate(base: string, days: number): string {
  const d = new Date(base + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function displayDate(ds: string) {
  const d = new Date(ds + 'T12:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function TreatmentsModal({ today, selectedDate, onClose }: Props) {
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => offsetDate(today, i - 13)), [today]);
  const [rows, setRows] = useState<Record<string, string>>({});
  const [activeDate, setActiveDate] = useState(selectedDate);
  const [note, setNote] = useState('');
  const [bulkNote, setBulkNote] = useState('');
  const [bulkDates, setBulkDates] = useState<string[]>([selectedDate]);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetch(`/api/treatments?start=${days[0]}&end=${days[days.length - 1]}`)
      .then(r => r.json())
      .then(({ rows: data }) => {
        const next: Record<string, string> = {};
        (data ?? []).forEach((row: TreatmentRow) => {
          const ds = row.date.split('T')[0];
          next[ds] = row.treatment_notes ?? '';
        });
        setRows(next);
        setNote(next[activeDate] ?? '');
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(load, [days[0], days[days.length - 1]]);

  const chooseDate = (ds: string) => {
    setActiveDate(ds);
    setNote(rows[ds] ?? '');
    if (!bulkDates.includes(ds)) setBulkDates([ds]);
  };

  const saveOne = async () => {
    await fetch('/api/treatments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: activeDate, treatment_notes: note }),
    });
    setRows(prev => ({ ...prev, [activeDate]: note }));
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };

  const applyBulk = async () => {
    if (!bulkDates.length) return;
    await fetch('/api/treatments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dates: bulkDates, treatment_notes: bulkNote }),
    });
    setRows(prev => {
      const next = { ...prev };
      bulkDates.forEach(ds => { next[ds] = bulkNote; });
      return next;
    });
    if (bulkDates.includes(activeDate)) setNote(bulkNote);
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };

  const toggleBulkDate = (ds: string) => {
    setBulkDates(prev => prev.includes(ds) ? prev.filter(d => d !== ds) : [...prev, ds]);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm sm:px-4 sm:py-8"
      onPointerDown={onClose}
    >
      <div
        className="bg-[#F6F1E7] w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col"
        onPointerDown={e => e.stopPropagation()}
        style={{ maxHeight: '92dvh' }}
      >
        <div className="px-4 py-3 border-b border-stone-200 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="font-serif text-lg font-semibold text-stone-800">Meds / treatments</h2>
            <p className="text-[11px] text-stone-400">Assign notes to one day or bulk apply</p>
          </div>
          <button onPointerDown={e => { e.stopPropagation(); onClose(); }} className="w-9 h-9 rounded-full hover:bg-stone-200 flex items-center justify-center text-stone-500 text-xl">×</button>
        </div>

        <div className="overflow-y-auto px-4 py-4 space-y-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2">Single day</p>
            <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
              {days.map(ds => {
                const has = !!rows[ds]?.trim();
                const active = ds === activeDate;
                return (
                  <button
                    key={ds}
                    onPointerDown={e => { e.stopPropagation(); chooseDate(ds); }}
                    className="flex-shrink-0 rounded-xl px-2.5 py-2 text-xs font-semibold border"
                    style={{
                      background: active ? '#E4ECE6' : has ? '#FBF5E8' : 'white',
                      color: active ? '#476653' : has ? '#B8883A' : '#78716c',
                      borderColor: active ? '#cfded3' : has ? '#E7D4A3' : '#e7e5e4',
                    }}
                  >
                    {displayDate(ds)}
                  </button>
                );
              })}
            </div>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Meloxicam AM, Advil PM, ice, compression…"
              rows={3}
              className="mt-2 w-full text-sm resize-none rounded-xl border border-stone-200 px-3 py-2.5 focus:outline-none bg-white"
              style={{ fontSize: 16, colorScheme: 'light' }}
            />
            <button
              onPointerDown={e => { e.stopPropagation(); saveOne(); }}
              className="mt-2 w-full py-2.5 rounded-xl text-sm font-bold text-white"
              style={{ background: '#7E9B86' }}
            >
              Save {displayDate(activeDate)}
            </button>
          </div>

          <div className="pt-4 border-t border-stone-200">
            <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2">Bulk apply</p>
            <div className="grid grid-cols-2 gap-1.5 mb-2">
              {days.map(ds => {
                const active = bulkDates.includes(ds);
                return (
                  <button
                    key={ds}
                    onPointerDown={e => { e.stopPropagation(); toggleBulkDate(ds); }}
                    className="rounded-lg px-2 py-2 text-xs font-semibold border text-left"
                    style={{
                      background: active ? '#E4ECE6' : 'white',
                      color: active ? '#476653' : '#78716c',
                      borderColor: active ? '#cfded3' : '#e7e5e4',
                    }}
                  >
                    {active ? '✓ ' : ''}{displayDate(ds)}
                  </button>
                );
              })}
            </div>
            <textarea
              value={bulkNote}
              onChange={e => setBulkNote(e.target.value)}
              placeholder="Apply this note to selected days…"
              rows={2}
              className="w-full text-sm resize-none rounded-xl border border-stone-200 px-3 py-2.5 focus:outline-none bg-white"
              style={{ fontSize: 16, colorScheme: 'light' }}
            />
            <button
              onPointerDown={e => { e.stopPropagation(); applyBulk(); }}
              disabled={!bulkDates.length}
              className="mt-2 w-full py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40"
              style={{ background: '#5B9BD5' }}
            >
              Apply to {bulkDates.length} day{bulkDates.length === 1 ? '' : 's'}
            </button>
          </div>

          {saved && <p className="text-center text-xs font-semibold text-[#7E9B86]">Saved ✓</p>}
          {loading && <p className="text-center text-xs text-stone-400">Loading…</p>}
        </div>
      </div>
    </div>
  );
}
