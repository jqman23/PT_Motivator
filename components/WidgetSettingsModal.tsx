'use client';

type CoreWidgetKey = 'timer' | 'info' | 'calendar' | 'treatments' | 'ptSessions' | 'reporting' | 'masterDatabase' | 'ptReport';
type ExtraWidgetKey = 'library' | 'aiCoach' | 'manage' | 'doctorNotes' | 'dailySummary';
type WidgetKey = CoreWidgetKey | ExtraWidgetKey;

const OPTIONS: { key: WidgetKey; label: string; description: string }[] = [
  { key: 'timer', label: 'Timer', description: 'Quick countdown timer.' },
  { key: 'library', label: 'Exercise library', description: 'Browse, add, and import exercises.' },
  { key: 'aiCoach', label: 'Ask AI', description: 'Ask questions about exercises and form.' },
  { key: 'info', label: 'Exercise guide', description: 'Consolidated exercise instructions.' },
  { key: 'manage', label: 'Reorder & edit', description: 'Reorder categories and exercises.' },
  { key: 'calendar', label: 'Calendar', description: 'Date picker and calendar view.' },
  { key: 'doctorNotes', label: 'Doctor notes', description: 'Simple notes, photos, and related days.' },
  { key: 'treatments', label: 'Meds / treatments', description: 'Assign treatment notes to days.' },
  { key: 'ptSessions', label: 'PT sessions', description: 'Mark PT appointment days.' },
  { key: 'reporting', label: 'Progress report', description: 'Charts and trend summaries.' },
  { key: 'ptReport', label: 'Reports & exports', description: 'Generate a PT PDF or export date-range data as JSON.' },
  { key: 'dailySummary', label: 'Daily summary', description: 'Show or hide the sun summary control.' },
  { key: 'masterDatabase', label: 'Master database', description: 'Desktop-only bulk editor for every exercise field.' },
];

export type WidgetPrefs = Record<CoreWidgetKey, boolean> & Partial<Record<ExtraWidgetKey, boolean>>;

interface Props {
  prefs: WidgetPrefs;
  onChange: (prefs: WidgetPrefs) => void;
  onOpenTypes: () => void;
  onClose: () => void;
}

export default function WidgetSettingsModal({ prefs, onChange, onOpenTypes, onClose }: Props) {
  const isOn = (key: WidgetKey) => prefs[key] !== false;
  const toggle = (key: WidgetKey) => {
    const next = { ...prefs, [key]: !isOn(key) } as WidgetPrefs;
    onChange(next);
    window.dispatchEvent(new CustomEvent('pt-widget-prefs-change', { detail: next }));
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm sm:px-4 sm:py-8"
      onClick={(e) => { e.stopPropagation(); onClose(); }}
    >
      <div
        className="bg-[#F6F1E7] w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col"
        onClick={e => e.stopPropagation()}
        style={{ maxHeight: '90dvh' }}
      >
        <div className="px-4 py-3 border-b border-stone-200 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="font-serif text-lg font-semibold text-stone-800">Widget settings</h2>
            <p className="text-[11px] text-stone-400">Choose exactly which controls are visible.</p>
          </div>
          <button
            onClick={e => { e.preventDefault(); e.stopPropagation(); onClose(); }}
            className="w-9 h-9 rounded-full hover:bg-stone-200 flex items-center justify-center text-stone-500 text-xl"
          >
            ×
          </button>
        </div>

        <div className="px-4 py-4 space-y-2 overflow-y-auto">
          <div className="bg-white rounded-xl border border-stone-100 px-3 py-3">
            <p className="text-sm font-semibold text-stone-800">Settings stays visible</p>
            <p className="text-xs text-stone-400 mt-1">The Settings button is the only control that cannot be hidden, so you can always turn widgets back on.</p>
          </div>

          {OPTIONS.map(opt => {
            const isMobileDisabled = opt.key === 'masterDatabase';
            const enabled = isOn(opt.key);

            return (
              <button
                key={opt.key}
                onClick={e => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (isMobileDisabled && window.innerWidth < 640) return;
                  toggle(opt.key);
                }}
                className={`w-full bg-white rounded-xl border border-stone-100 px-3 py-3 flex items-center justify-between gap-3 text-left ${
                  isMobileDisabled ? 'opacity-60 sm:opacity-100 cursor-not-allowed sm:cursor-pointer' : ''
                }`}
                style={{ touchAction: 'manipulation' }}
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-stone-800">{opt.label}</p>
                  <p className="text-xs text-stone-400 mt-0.5">{opt.description}</p>
                  {isMobileDisabled && (
                    <p className="sm:hidden text-[10px] font-semibold text-stone-400 mt-1">Desktop only — disabled on mobile.</p>
                  )}
                </div>
                <span
                  className="w-11 h-6 rounded-full p-0.5 flex-shrink-0 transition-colors"
                  style={{ background: enabled ? '#7E9B86' : '#e7e5e4' }}
                >
                  <span
                    className="block w-5 h-5 rounded-full bg-white shadow-sm transition-transform"
                    style={{ transform: enabled ? 'translateX(20px)' : 'translateX(0)' }}
                  />
                </span>
              </button>
            );
          })}

          <button
            onClick={e => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
              onOpenTypes();
            }}
            className="w-full bg-white rounded-xl border border-stone-100 px-3 py-3 flex items-center justify-between gap-3 text-left"
            style={{ touchAction: 'manipulation' }}
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-stone-800">Exercise types</p>
              <p className="text-xs text-stone-400 mt-0.5">Set the 3-letter mark and emoji for each type.</p>
            </div>
            <span className="text-xs font-semibold text-stone-400 flex-shrink-0">Open</span>
          </button>
        </div>
      </div>
    </div>
  );
}
