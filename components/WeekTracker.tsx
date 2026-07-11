'use client';

import { useEffect, useMemo, useRef, useState, type MouseEvent, type TouchEvent } from 'react';
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

type WeekPrefs = {
  mode: WeekMode;
  hidden: Record<WeekMode, string[]>;
  goals: Record<WeekMode, Record<string, number>>;
};

type SwipeStart = {
  x: number;
  y: number;
};

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const TYPE_COLORS = ['#7E9B86', '#C17B4F', '#5B9BD5', '#7C3AED', '#0D9488', '#E11D48', '#D97706', '#475569'];
const PREF_KEY = 'weekTrackerPrefs';
const LEGACY_PREF_KEY = 'pt-week-tracker-prefs';
const SWIPE_THRESHOLD = 52;

function todayStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function daysForWeek(today: string, weekOffset: number): Date[] {
  const end = new Date(`${today}T12:00:00`);
  end.setDate(end.getDate() + weekOffset * 7);

  const out: Date[] = [];
  for (let index = 6; index >= 0; index -= 1) {
    const date = new Date(end);
    date.setDate(end.getDate() - index);
    out.push(date);
  }
  return out;
}

function displayDay(dateString: string) {
  return new Date(`${dateString}T12:00:00`).toLocaleDateString(undefined, {
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

function defaultPrefs(): WeekPrefs {
  return {
    mode: 'type',
    hidden: { type: [], category: [] },
    goals: { type: {}, category: {} },
  };
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

function weekTitle(weekOffset: number) {
  if (weekOffset === 0) return 'This week';
  if (weekOffset === -1) return 'Previous week';
  return `${Math.abs(weekOffset)} weeks ago`;
}

export default function WeekTracker({
  log,
  today,
  selectedDate,
  ptSessions,
  exercises,
  layout,
  onSelectDate,
}: Props) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [hoveredDay, setHoveredDay] = useState<string | null>(null);
  const [mode, setMode] = useState<WeekMode>('type');
  const [hidden, setHidden] = useState<Record<WeekMode, string[]>>({ type: [], category: [] });
  const [goals, setGoals] = useState<Record<WeekMode, Record<string, number>>>({ type: {}, category: {} });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [toolbarPrefs, setToolbarPrefs] = useState<ToolbarPrefs>({});

  const swipeStartRef = useRef<SwipeStart | null>(null);
  const suppressNextDayClickRef = useRef(false);
  const suppressResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const days = useMemo(() => daysForWeek(today, weekOffset), [today, weekOffset]);

  useEffect(() => {
    setWeekOffset(0);
    setHoveredDay(null);
  }, [today]);

  useEffect(() => {
    return () => {
      if (suppressResetTimerRef.current) clearTimeout(suppressResetTimerRef.current);
    };
  }, []);

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
        const response = await fetch(`/api/config?key=${encodeURIComponent(PREF_KEY)}`, { cache: 'no-store' });
        const data = await response.json();
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
        // Fall through to the local migration.
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
      .then(response => response.json())
      .then(data => {
        if (!cancelled && data?.value && typeof data.value === 'object') {
          setToolbarPrefs(data.value as ToolbarPrefs);
        }
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
      return layout
        .map(category => {
          const palette = COLOR_PALETTE[category.color] ?? COLOR_PALETTE.green;
          return {
            id: category.id,
            name: category.name,
            color: palette.accent,
            exercises: category.exerciseIds
              .map(id => exercises.find(exercise => exercise.id === id))
              .filter((exercise): exercise is Exercise => Boolean(exercise) && !exercise.optional),
          };
        })
        .filter(group => group.exercises.length || !hidden.category.includes(group.id));
    }

    const byType = new Map<string, Exercise[]>();
    exercises
      .filter(exercise => !exercise.optional)
      .forEach(exercise => {
        const type = normalizeType(exercise.cat);
        byType.set(type, [...(byType.get(type) ?? []), exercise]);
      });

    return Array.from(byType.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([type, items], index) => ({
        id: type,
        name: type,
        color: TYPE_COLORS[index % TYPE_COLORS.length],
        exercises: items,
      }));
  }, [exercises, hidden.category, layout, mode]);

  const visibleGroups = groups.filter(group => !hidden[mode].includes(group.id));

  function groupGoal(group: WeekGroup) {
    return Math.max(1, Math.min(99, Number(goals[mode][group.id] ?? (group.exercises.length || 1))));
  }

  function groupCount(dateString: string, group: WeekGroup) {
    const dayLog = log[dateString] || {};
    return group.exercises.filter(exercise => dayLog[exercise.id]).length;
  }

  function groupFraction(dateString: string, group: WeekGroup) {
    const denominator = groupGoal(group);
    return denominator ? Math.min(1, groupCount(dateString, group) / denominator) : 0;
  }

  function setGroupGoal(groupId: string, value: string) {
    const next = Math.max(1, Math.min(99, Number(value) || 1));
    setGoals(previous => ({
      ...previous,
      [mode]: { ...previous[mode], [groupId]: next },
    }));
  }

  function toggleGroup(groupId: string) {
    setHidden(previous => {
      const current = new Set(previous[mode]);
      if (current.has(groupId)) current.delete(groupId);
      else current.add(groupId);

      return {
        ...previous,
        [mode]: Array.from(current),
      };
    });
  }

  function moveToOlderWeek() {
    setHoveredDay(null);
    setWeekOffset(previous => previous - 1);
  }

  function moveToNewerWeek() {
    setHoveredDay(null);
    setWeekOffset(previous => Math.min(0, previous + 1));
  }

  function handleTouchStart(event: TouchEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest('input, select, textarea')) {
      swipeStartRef.current = null;
      return;
    }

    const touch = event.touches[0];
    swipeStartRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  }

  function handleTouchEnd(event: TouchEvent<HTMLDivElement>) {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;

    const touch = event.changedTouches[0];
    if (!start || !touch) return;

    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) <= Math.abs(dy) * 1.15) return;

    suppressNextDayClickRef.current = true;
    if (suppressResetTimerRef.current) clearTimeout(suppressResetTimerRef.current);
    suppressResetTimerRef.current = setTimeout(() => {
      suppressNextDayClickRef.current = false;
    }, 450);

    if (dx > 0) moveToOlderWeek();
    else if (weekOffset < 0) moveToNewerWeek();
  }

  function handleCardClickCapture(event: MouseEvent<HTMLDivElement>) {
    if (!suppressNextDayClickRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    suppressNextDayClickRef.current = false;
  }

  function handleDayClick(dateString: string) {
    if (suppressNextDayClickRef.current) {
      suppressNextDayClickRef.current = false;
      return;
    }

    const isTouchLike = window.matchMedia('(hover: none), (pointer: coarse)').matches;
    if (isTouchLike) {
      setHoveredDay(dateString);
      return;
    }

    onSelectDate(dateString);
  }

  const hovered = hoveredDay
    ? {
        groups: visibleGroups.map(group => ({
          group,
          done: groupCount(hoveredDay, group),
          total: groupGoal(group),
        })),
        ptSession: ptSessions?.find(session => session.date === hoveredDay),
      }
    : null;

  const completions = visibleGroups.map(group => {
    const totalDone = days.reduce((sum, day) => sum + groupCount(todayStr(day), group), 0);
    return `${group.name}: ${totalDone}/${groupGoal(group) * 7}`;
  });

  const weekHasSession = Boolean(
    ptSessions?.some(session => days.some(day => todayStr(day) === session.date))
  );

  return (
    <div
      className="rounded-2xl border border-stone-100 bg-white p-4"
      style={{ touchAction: 'pan-y' }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onClickCapture={handleCardClickCapture}
      onTouchCancel={() => {
        swipeStartRef.current = null;
      }}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={moveToOlderWeek}
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-stone-50 text-base text-stone-500"
              aria-label="Show previous week"
              title="Previous week"
            >
              ‹
            </button>

            <div className="min-w-0">
              <h2 className="truncate font-serif text-base font-semibold text-stone-800">
                {weekTitle(weekOffset)}
              </h2>
              <p className="mt-0.5 text-[10px] text-stone-400">
                {days[0].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                {' - '}
                {days[days.length - 1].toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </p>
            </div>

            <button
              type="button"
              onClick={moveToNewerWeek}
              disabled={weekOffset === 0}
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-stone-50 text-base text-stone-500 disabled:opacity-25"
              aria-label="Show newer week"
              title="Newer week"
            >
              ›
            </button>
          </div>
          <p className="mt-1 pl-8 text-[9px] text-stone-300">
            Swipe right for earlier · left for newer
          </p>
        </div>

        <button
          type="button"
          onClick={() => setSettingsOpen(previous => !previous)}
          className="flex-shrink-0 rounded-lg bg-stone-50 px-2.5 py-1.5 text-[10px] font-bold text-stone-500"
        >
          Set goal
        </button>
      </div>

      {settingsOpen && (
        <div className="mb-3 rounded-xl border border-stone-100 bg-stone-50 p-2">
          <div className="mb-2 grid grid-cols-2 gap-1.5">
            {(['type', 'category'] as const).map(value => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                className="rounded-lg px-2 py-1.5 text-[11px] font-bold capitalize"
                style={{
                  background: mode === value ? '#7E9B86' : '#fff',
                  color: mode === value ? '#fff' : '#78716c',
                }}
              >
                {value}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {groups.map(group => {
              const isHidden = hidden[mode].includes(group.id);
              return (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  className="rounded-full border px-2 py-1 text-[10px] font-semibold"
                  style={{
                    borderColor: isHidden ? '#e7e5e4' : group.color,
                    color: isHidden ? '#a8a29e' : group.color,
                    background: isHidden ? '#fff' : `${group.color}14`,
                  }}
                >
                  {isHidden ? 'Show ' : 'Hide '}
                  {group.name}
                </button>
              );
            })}
          </div>

          <div className="mt-2 space-y-1.5">
            {visibleGroups.map(group => (
              <div key={group.id} className="flex items-center gap-2 rounded-lg bg-white px-2 py-1.5">
                <span className="min-w-0 flex-1 truncate text-[11px] font-semibold capitalize text-stone-600">
                  {group.name}
                </span>
                <span className="text-[10px] text-stone-400">daily goal</span>
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={groupGoal(group)}
                  onChange={event => setGroupGoal(group.id, event.target.value)}
                  className="w-14 rounded-lg border border-stone-200 px-2 py-1 text-center text-xs font-bold text-stone-700"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {visibleGroups.map(group => (
        <div key={group.id} className="mb-3 flex items-center gap-3 last:mb-0">
          <div className="w-24 min-w-0 flex-shrink-0">
            <p className="truncate text-xs font-semibold capitalize text-stone-700">{group.name}</p>
            <p className="text-[10px] text-stone-400">goal: {groupGoal(group)}/day</p>
          </div>

          <div className="flex flex-1 justify-between gap-1">
            {days.map(day => {
              const dateString = todayStr(day);
              const fraction = groupFraction(dateString, group);
              const hasAnyDayData = visibleGroups.some(item => groupFraction(dateString, item) > 0);
              const isToday = dateString === today;
              const isSelected = dateString === selectedDate;
              const ptSession = ptSessions?.find(session => session.date === dateString);
              const showPTCircle = visibleGroups[0]?.id === group.id && Boolean(ptSession) && !hasAnyDayData;
              const isHovered = hoveredDay === dateString;

              return (
                <button
                  key={dateString}
                  type="button"
                  onClick={() => handleDayClick(dateString)}
                  onMouseEnter={() => setHoveredDay(dateString)}
                  onMouseLeave={() => setHoveredDay(null)}
                  onFocus={() => setHoveredDay(dateString)}
                  onBlur={() => setHoveredDay(null)}
                  className={`flex flex-col items-center gap-0.5 rounded-xl px-1 py-1 outline-none transition-colors ${
                    isHovered ? 'bg-stone-100' : 'hover:bg-stone-50 focus-visible:bg-stone-100'
                  }`}
                  title={`Show ${displayDay(dateString)} summary`}
                >
                  <div
                    className={`relative h-5 w-5 overflow-hidden rounded-full border-2 transition-transform ${
                      showPTCircle
                        ? 'border-[#E7D4A3] bg-[#FCF8EE]'
                        : isSelected
                          ? 'border-[#D9A94B] ring-2 ring-[#D9A94B]/30'
                          : isToday
                            ? 'border-[#D9A94B]'
                            : 'border-stone-200'
                    } ${isHovered ? 'scale-110' : 'scale-100'}`}
                  >
                    {fraction > 0 && (
                      <div
                        className="absolute bottom-0 left-0 right-0"
                        style={{ height: `${fraction * 100}%`, background: group.color }}
                      />
                    )}
                  </div>

                  <span className={`text-[9px] font-medium ${isHovered ? 'text-stone-600' : 'text-stone-400'}`}>
                    {DAY_LABELS[day.getDay()]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <div className="mt-3 min-h-[58px] border-t border-stone-100 pt-3">
        {hoveredDay && hovered ? (
          <>
            <div className="mb-1.5 flex min-w-0 items-center gap-2">
              <p className="flex-shrink-0 text-xs font-bold text-stone-700">{displayDay(hoveredDay)}</p>
              {hovered.ptSession && (
                <>
                  <span
                    className="flex-shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                    style={{ background: '#FBF5E8', color: '#D9A94B' }}
                  >
                    {sessionLabel(hovered.ptSession.kind)}
                  </span>
                  {hovered.ptSession.note?.trim() && (
                    <span className="truncate text-[10px] text-stone-400">{hovered.ptSession.note}</span>
                  )}
                </>
              )}
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {hovered.groups.map(({ group, done, total }) => (
                <span key={group.id} className="text-xs text-stone-500">
                  <span className="font-semibold" style={{ color: group.color }}>
                    {done}/{total}
                  </span>{' '}
                  {group.name}
                </span>
              ))}

              {!hovered.ptSession && hovered.groups.every(item => item.done === 0) && (
                <span className="text-xs italic text-stone-400">No activity logged</span>
              )}
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-center text-[11px] text-stone-400">Tap or hover a day for a summary</p>
          </div>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-y-1">
        <p className="truncate text-[10px] text-stone-400">
          {completions.length ? completions.join(' · ') : 'No groups selected'}
        </p>

        {weekHasSession && (
          <div className="flex items-center gap-1">
            <div
              className="h-2 w-2 rounded-full border"
              style={{ background: '#FBF5E8', borderColor: '#D9A94B' }}
            />
            <span className="text-[10px] text-stone-400">PT / training session</span>
          </div>
        )}
      </div>
    </div>
  );
}
