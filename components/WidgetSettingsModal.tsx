'use client';

type WidgetKey = 'timer' | 'info' | 'calendar' | 'treatments' | 'ptSessions' | 'reporting' | 'masterDatabase';

const OPTIONS: { key: WidgetKey; label: string; description: string }[] = [
  { key: 'timer', label: 'Timer', description: 'Quick countdown timer.' },
  { key: 'info', label: 'Exercise guide', description: 'Consolidated exercise instructions.' },
  { key: 'calendar', label: 'Calendar', description: 'Date picker and calendar view.' },
  { key: 'treatments', label: 'Meds / treatments', description: 'Assign treatment notes to days.' },
  { key: 'ptSessions', label: 'PT sessions', description: 'Mark PT appointment days.' },
  { key: 'reporting', label: 'Progress report', description: 'Charts and trend summaries.' },
  { key: 'masterDatabase', label: 'Master database', description: 'Desktop-only bulk editor for every exercise field.' },
];

export type WidgetPrefs = Record<WidgetKey, boolean>;

interface Props {
  prefs: WidgetPrefs;
  onChange: (prefs: WidgetPrefs) => void;
  onClose: () => void;
}

export default function WidgetSettingsModal({ prefs, onChange, onClose }: Props) {
  const toggle = (key: WidgetKey) => onChange({ ...prefs, [key]: !prefs[key] });

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm sm:px-4 sm:py-8"
      onPointerDown={onClose}
    >
      <div
        className="bg-[#F6F1E7] w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col"
        onPointerDown={e => e.stopPropagation()}
        style={{ maxHeight: '90dvh' }}
      >
        <div className="px-4 py-3 border-b border-stone-200 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="font-serif text-lg font-semibold text-stone-800">Widget settings</h2>
            <p className="text-[11px] text-stone-400">Choose which optional icons show up top.</p>
          </div>
          <button onPointerDown={e => { e.stopPropagation(); onClose(); }} className="w-9 h-9 rounded-full hover:bg-stone-200 flex items-center justify-center text-stone-500 text-xl">×</button>
        </div>

        <div className="px-4 py-4 space-y-2 overflow-y-auto">
          <div className="bg-white rounded-xl border border-stone-100 px-3 py-3">
            <p className="text-sm font-semibold text-stone-800">Always shown</p>
            <p className="text-xs text-stone-400 mt-1">Exercise Library, Reorder & Edit, and Widget Settings stay visible.</p>
          </div>

          {OPTIONS.map(opt => (
            <button
              key={opt.key}
              onPointerDown={e => { e.stopPropagation(); toggle(opt.key); }}
              className="w-full bg-white rounded-xl border border-stone-100 px-3 py-3 flex items-center justify-between gap-3 text-left"
              style={{ touchAction: 'manipulation' }}
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-stone-800">{opt.label}</p>
                <p className="text-xs text-stone-400 mt-0.5">{opt.description}</p>
              </div>
              <span
                className="w-11 h-6 rounded-full p-0.5 flex-shrink-0 transition-colors"
                style={{ background: prefs[opt.key] ? '#7E9B86' : '#e7e5e4' }}
              >
                <span
                  className="block w-5 h-5 rounded-full bg-white shadow-sm transition-transform"
                  style={{ transform: prefs[opt.key] ? 'translateX(20px)' : 'translateX(0)' }}
                />
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
