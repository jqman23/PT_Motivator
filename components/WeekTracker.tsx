'use client';

import { useEffect, useMemo, useState } from 'react';
import { Exercise } from '@/lib/exercises';
import { CategoryConfig, COLOR_PALETTE } from '@/lib/layout';

type LogMap = Record<string, Record<string, boolean>>;
type WeekMode = 'type' | 'category';
type PTSession = { date: string; kind?: 'pt' | 'training'; note?: string };
type ToolbarPrefs = {
  library?: boolean;
  aiCoach?: boolean;
  manage?: boolean;
  doctorNotes?: boolean;
  dailySummary?: boolean;
};

interface Props {
  log: LogMap;
  today: string;
  selectedDate: string;
  ptSessions?: PTSession[];
  exercises: Exercise[];
  layout: CategoryConfig[];
  onSelectDate: (date: string) => void;
}

type WeekGroup = {
  id: string;
  name: string;
  color: string;
  exercises: Exercise[];
};

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const TYPE_COLORS = ['#7E9B86', '#C17B4F', '#5B9BD5', '#7C3AED', '#0D9488', '#E11D48', '#D97706', '#475569'];
const PREF_KEY = 'weekTrackerPrefs';
const LEGACY_PREF_KEY = 'pt-week-tracker-prefs';

function todayStr(d: Date): string {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function lastNDays(n: number): Date[] {
  const out: Date[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(d);
  }
  return out;
}

function displayDay(ds: string) {
  return new Date(ds + 'T12:00:00').toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

function normalizeType(value?: string) {
  return (value || 'untyped').trim() || 'untyped';
}

function sessionLabel(kind?: PTSession['kind']) {
  return kind === 'training' ? 'Training session' : 'PT session';
}

type WeekPrefs = { mode: WeekMode; hidden: Record<WeekMode, string[]>; goals: Record<WeekMode, Record<string, number>> };

function defaultPrefs(): WeekPrefs {
  return { mode: 'type', hidden: { type: [], category: [] }, goals: { type: {}, category: {} } };
}

function readLocalPrefs(): WeekPrefs {
  if (typeof window === 'undefined') return defaultPrefs();
  try {
    const parsed = JSON.parse(localStorage.getItem(LEGACY_PREF_KEY) || '{}') as Partial<WeekPrefs>;
    return {
      mode: parsed.mode === 'category' ? 'category' : 'type',
      hidden: {
        type: Array.isArray(parsed.hidden?.type) ? parsed.hidden.type : [],
        category: Array.isArray(parsed.hidden?.category) ? parsed.hidden.category : [],
      },
      goals: {
        type: parsed.goals?.type && typeof parsed.goals.type === 'object' ? parsed.goals.type : {},
        category: parsed.goals?.category && typeof parsed.goals.category === 'object' ? parsed.goals.category : {},
      },
    };
  } catch {
    return defaultPrefs();
  }
}

export default function WeekTracker({ log, today, selectedDate, ptSessions, exercises, layout, onSelectDate }: Props) {
  const days = lastNDays(7);
  const [hoveredDay, setHoveredDay] = useState<string | null>(null);
  const [mode, setMode] = useState<WeekMode>('type');
  const [hidden, setHidden] = useState<Record<WeekMode, string[]>>({ type: [], category: [] });
  const [goals, setGoals] = useState<Record<WeekMode, Record<string, number>>>({ type: {}, category: {} });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [toolbarPrefs, setToolbarPrefs] = useState<ToolbarPrefs>({});

  useEffect(() => {
    let cancelled = false;
    const applyPrefs = (prefs: WeekPrefs) => {
      if (cancelled) return;
      setMode(prefs.mode);
      setHidden(prefs.hidden);
      setGoals(prefs.goals);
      setPrefsLoaded(true);
    };

    (async () => {
      try {
        const res = await fetch(`/api/config?key=${encodeURIComponent(PREF_KEY)}`, { cache: 'no-store' });
        const data = await res.json();
        if (data?.value && typeof data.value === 'object') {
          const value = data.value as Partial<WeekPrefs>;
          applyPrefs({
            mode: value.mode === 'category' ? 'category' : 'type',
            hidden: {
              type: Array.isArray(value.hidden?.type) ? value.hidden.type : [],
              category: Array.isArray(value.hidden?.category) ? value.hidden.category : [],
            },
            goals: {
              type: value.goals?.type && typeof value.goals.type === 'object' ? value.goals.type : {},
              category: value.goals?.category && typeof value.goals.category === 'object' ? value.goals.category : {},
            },
          });
          return;
        }
      } catch {
        // fall through to local migration
      }

      const localPrefs = readLocalPrefs();
      applyPrefs(localPrefs);
      void fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: PREF_KEY, value: localPrefs }),
      });
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!prefsLoaded) return;
    const value = { mode, hidden, goals };
    localStorage.setItem(LEGACY_PREF_KEY, JSON.stringify(value));
    void fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: PREF_KEY, value }),
    });
  }, [mode, hidden, goals, prefsLoaded]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/config?key=widgetPrefs', { cache: 'no-store' })
      .then(res => res.json())
      .then(data => {
        if (!cancelled && data?.value && typeof data.value === 'object') setToolbarPrefs(data.value as ToolbarPrefs);
      })
      .catch(() => {});

    const onPrefsChange = (event: Event) => {
      const detail = (event as CustomEvent<ToolbarPrefs>).detail;
      if (detail && typeof detail === 'object') setToolbarPrefs(detail);
    };
    window.addEventListener('pt-widget-prefs-change', onPrefsChange);
    return () => {
      cancelled = true;
      window.removeEventListener('pt-widget-prefs-change', onPrefsChange);
    };
  }, []);

  useEffect(() => {
    const syncToolbar = () => {
      const visibility: Array<[string, boolean]> = [
        ['Exercise library', toolbarPrefs.library !== false],
        ['Ask AI about exercise', toolbarPrefs.aiCoach !== false],
        ['Reorder & edit', toolbarPrefs.manage !== false],
        ['Show daily summary', toolbarPrefs.dailySummary !== false],
      ];

      visibility.forEach(([title, visible]) => {
        const button = document.querySelector<HTMLElement>(`button[title="${title}"]`);
        if (button) button.style.display = visible ? '' : 'none';
      });
    };

    syncToolbar();
    const observer = new MutationObserver(syncToolbar);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [toolbarPrefs]);

  const groups = useMemo<WeekGroup[]>(() => {
    if (mode === 'category') {
      return layout.map((cat) => {
        const palette = COLOR_PALETTE[cat.color] ?? COLOR_PALETTE.green;
        return {
          id: cat.id,
          name: cat.name,
          color: palette.accent,
          exercises: cat.exerciseIds.map(id => exercises.find(ex => ex.id === id)).filter((ex): ex is Exercise => !!ex && !ex.optional),
        };
      }).filter(group => group.exercises.length || indexIsVisible(group.id, hidden.category));
    }

    const byType = new Map<string, Exercise[]>();
    exercises.filter(ex => !ex.optional).forEach(ex => {
      const type = normalizeType(ex.cat);
      byType.set(type, [...(byType.get(type) ?? []), ex]);
    });
    return Array.from(byType.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([type, items], index) => ({
      id: type,
      name: type,
      color: TYPE_COLORS[index % TYPE_COLORS.length],
      exercises: items,
    }));
  }, [exercises, hidden.category, layout, mode]);

  const visibleGroups = groups.filter(group => !hidden[mode].includes(group.id));

  function indexIsVisible(id: string, hiddenIds: string[]) {
    return !hiddenIds.includes(id);
  }

  function groupCount(dateStr: string, group: WeekGroup) {
    const dayLog = log[dateStr] || {};
    return group.exercises.filter((e) => dayLog[e.id]).length;
  }

  function groupFraction(dateStr: string, group: WeekGroup) {
    const done = groupCount(dateStr, group);
    const denominator = groupGoal(group);
    return denominator ? Math.min(1, done / denominator) : 0;
  }

  function groupGoal(group: WeekGroup) {
    return Math.max(1, Math.min(99, Number(goals[mode][group.id] ?? (group.exercises.length || 1))));
  }

  function setGroupGoal(groupId: string, value: string) {
    const next = Math.max(1, Math.min(99, Number(value) || 1));
    setGoals(prev => ({ ...prev, [mode]: { ...prev[mode], [groupId]: next } }));
  }

  function toggleGroup(id: string) {
    setHidden(prev => {
      const current = new Set(prev[mode]);
      if (current.has(id)) current.delete(id);
      else current.add(id);
      return { ...prev, [mode]: Array.from(current) };
    });
  }

  const handleDayClick = (ds: string) => {
    const isTouchLike = window.matchMedia('(hover: none), (pointer: coarse)').matches;
    if (isTouchLike) {
      setHoveredDay(ds);
      return;
    }
    onSelectDate(ds);
  };

  const hovered = hoveredDay
    ? {
        groups: visibleGroups.map(group => ({
          group,
          done: groupCount(hoveredDay, group),
          total: groupGoal(group),
        })),
        ptSession: ptSessions?.find((s) => s.date === hoveredDay),
      }
    : null;

  const completions = visibleGroups.map(group => {
    const totalDone = days.reduce((sum, day) => sum + groupCount(todayStr(day), group), 0);
    return `${group.name}: ${totalDone}/${groupGoal(group) * 7}`;
  });

  return (
    <>
      <div className="bg-white border border-stone-100 rounded-2xl p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-serif text-base font-semibold text-stone-800">This week</h2>
            <p className="text-[10px] text-stone-400 mt-0.5">
              {new Date(days[0].getTime()).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              {' - '}
              {new Date(days[days.length - 1].getTime()).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
          <button onClick={() => setSettingsOpen(prev => !prev)} className="rounded-lg bg-stone-50 px-2.5 py-1.5 text-[10px] font-bold text-stone-500">
            Set goal
          </button>
        </div>

        {settingsOpen && (
          <div className="mb-3 rounded-xl border border-stone-100 bg-stone-50 p-2">
            <div className="grid grid-cols-2 gap-1.5 mb-2">
              {(['type', 'category'] as const).map(value => (
                <button
                  key={value}
                  onClick={() => setMode(value)}
                  className="rounded-lg px-2 py-1.5 text-[11px] font-bold capitalize"
                  style={{ background: mode === value ? '#7E9B86' : '#fff', color: mode === value ? '#fff' : '#78716c' }}
                >
                  {value}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {groups.map(group => (
                <button
                  key={group.id}
                  onClick={() => toggleGroup(group.id)}
                  className="rounded-full border px-2 py-1 text-[10px] font-semibold"
                  style={{
                    borderColor: hidden[mode].includes(group.id) ? '#e7e5e4' : group.color,
                    color: hidden[mode].includes(group.id) ? '#a8a29e' : group.color,
                    background: hidden[mode].includes(group.id) ? '#fff' : `${group.color}14`,
                  }}
                >
                  {hidden[mode].includes(group.id) ? 'Show ' : 'Hide '}{group.name}
                </button>
              ))}
            </div>
            <div className="mt-2 space-y-1.5">
              {visibleGroups.map(group => (
                <div key={group.id} className="flex items-center gap-2 rounded-lg bg-white px-2 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-[11px] font-semibold capitalize text-stone-600">{group.name}</span>
                  <span className="text-[10px] text-stone-400">daily goal</span>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={groupGoal(group)}
                    onChange={e => setGroupGoal(group.id, e.target.value)}
                    className="w-14 rounded-lg border border-stone-200 px-2 py-1 text-center text-xs font-bold text-stone-700"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {visibleGroups.map((group) => (
          <div key={group.id} className="flex items-center gap-3 mb-3 last:mb-0">
            <div className="w-24 flex-shrink-0 min-w-0">
              <p className="text-xs font-semibold text-stone-700 truncate capitalize">{group.name}</p>
              <p className="text-[10px] text-stone-400">goal: {groupGoal(group)}/day</p>
            </div>
            <div className="flex justify-between flex-1 gap-1">
              {days.map((d) => {
                const ds = todayStr(d);
                const frac = groupFraction(ds, group);
                const hasAnyDayData = visibleGroups.some(item => groupFraction(ds, item) > 0);
                const isToday = ds === today;
                const isSelected = ds === selectedDate;
                const ptSession = ptSessions?.find(s => s.date === ds);
                const showPTCircle = visibleGroups[0]?.id === group.id && !!ptSession && !hasAnyDayData;
                const isHovered = hoveredDay === ds;

                return (
                  <button
                    key={ds}
                    type="button"
                    onClick={() => handleDayClick(ds)}
                    onMouseEnter={() => setHoveredDay(ds)}
                    onMouseLeave={() => setHoveredDay(null)}
                    onFocus={() => setHoveredDay(ds)}
                    onBlur={() => setHoveredDay(null)}
                    className={`flex flex-col items-center gap-0.5 rounded-xl px-1 py-1 transition-colors outline-none ${
                      isHovered ? 'bg-stone-100' : 'hover:bg-stone-50 focus-visible:bg-stone-100'
                    }`}
                    title={`Show ${displayDay(ds)} summary`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full border-2 relative overflow-hidden transition-transform ${
                        showPTCircle
                          ? 'border-[#E7D4A3] bg-[#FCF8EE]'
                          : isSelected
                          ? 'border-[#D9A94B] ring-2 ring-[#D9A94B]/30'
                          : isToday
                          ? 'border-[#D9A94B]'
                          : 'border-stone-200'
                      } ${isHovered ? 'scale-110' : 'scale-100'}`}
                    >
                      {frac > 0 && (
                        <div className="absolute bottom-0 left-0 right-0" style={{ height: `${frac * 100}%`, background: group.color }} />
                      )}
                    </div>
                    <span className={`text-[9px] font-medium ${isHovered ? 'text-stone-600' : 'text-stone-400'}`}>
                      {DAY_LABELS[d.getDay()]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <div className="border-t border-stone-100 mt-3 pt-3 min-h-[58px]">
          {hoveredDay && hovered ? (
            <>
              <div className="flex items-center gap-2 mb-1.5 min-w-0">
                <p className="text-xs font-bold text-stone-700 flex-shrink-0">{displayDay(hoveredDay)}</p>
                {hovered.ptSession && (
                  <>
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ background: '#FBF5E8', color: '#D9A94B' }}>
                      {sessionLabel(hovered.ptSession.kind)}
                    </span>
                    {hovered.ptSession.note?.trim() && <span className="text-[10px] text-stone-400 truncate">{hovered.ptSession.note}</span>}
                  </>
                )}
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {hovered.groups.map(({ group, done, total }) => (
                  <span key={group.id} className="text-xs text-stone-500">
                    <span className="font-semibold" style={{ color: group.color }}>{done}/{total}</span> {group.name}
                  </span>
                ))}
                {!hovered.ptSession && hovered.groups.every(item => item.done === 0) && (
                  <span className="text-xs text-stone-400 italic">No activity logged</span>
                )}
              </div>
            </>
          ) : (
            <div className="h-full flex items-center justify-center">
              <p className="text-[11px] text-stone-400 text-center">Tap or hover a day for a summary</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between mt-2 flex-wrap gap-y-1">
          <p className="text-[10px] text-stone-400 truncate">
            {completions.length ? completions.join(' · ') : 'No groups selected'}
          </p>
          {ptSessions && ptSessions.some(s => days.some(day => todayStr(day) === s.date)) && (
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full border" style={{ background: '#FBF5E8', borderColor: '#D9A94B' }} />
              <span className="text-[10px] text-stone-400">PT / training session</span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
