'use client';

import { useEffect, useMemo, useState } from 'react';
import { ExerciseTypeMeta, defaultExerciseTypeMeta, getExerciseTypeMark, normalizeExerciseType } from '@/lib/exerciseTypes';

interface Props {
  types: string[];
  meta: ExerciseTypeMeta;
  onChange: (next: ExerciseTypeMeta) => void;
  onClose: () => void;
}

type EmojiGroup = { label: string; items: string[] };

const EMOJI_GROUPS: EmojiGroup[] = [
  { label: 'Recent', items: [] },
  { label: 'Cardio', items: [
    '❤️','💖','💗','💓','💞','💘','💝','💟','🫀','🫁','💨','🔥','⚡','💦','🏃','🏃‍♀️','🏃‍♂️',
    '🚴','🚴‍♀️','🚴‍♂️','🏁','🎽','⛷️','🏊','🏊‍♀️','🏊‍♂️','🫶','🫰','💪','⏱️','⌛','📈'
  ] },
  { label: 'Workout', items: [
    '🏋️','🏋️‍♀️','🏋️‍♂️','🏃','🏃‍♀️','🏃‍♂️','🚶','🚶‍♀️','🚶‍♂️','🚴','🚴‍♀️','🚴‍♂️',
    '🧘','🧘‍♀️','🧘‍♂️','🤸','🤸‍♀️','🤸‍♂️','🤾','🤾‍♀️','🤾‍♂️','🤼','🤼‍♀️','🤼‍♂️',
    '⛹️','⛹️‍♀️','⛹️‍♂️','🏌️','🏌️‍♀️','🏌️‍♂️','🧎','🧎‍♀️','🧎‍♂️','🧍','🧍‍♀️','🧍‍♂️',
    '⏱️','⏲️','⌛','⛳','🎯','🔁','↔️','⬆️','⬇️','➡️','⬅️','🔄','🔃','▶️','⏯️'
  ] },
  { label: 'Body', items: [
    '💪','🦵','🦶','🖐️','✋','👣','👀','👂','👃','👄','🫀','🫁','🧠','🦴','🦷','🫁','🫀',
    '👐','👏','🤝','🙏','🫶','🤲','🫳','🫴','🫰','👌','✊','👍','👎','🤙','☝️','✌️','🤘',
    '🦾','🦿','💋','👋','🫥','😮','😶','😵','🫠','🥵','🥶'
  ] },
  { label: 'Medical', items: [
    '🩺','💊','🩹','🧴','🧼','🪥','🪒','🧻','🧻','🧊','🔥','🩻','🦽','🦼','🩼','🪑','🛏️',
    '🧰','🧯','📋','📈','📉','🧪','🧫','🔬','🧬','💉','🩸','🩺','🏥','🚑','🏨','⚕️','🧑‍⚕️'
  ] },
  { label: 'Equipment', items: [
    '🏃','🛤️','🪜','🪢','🪝','🪚','🛞','🏑','🏒','🏸','🏓','🎾','⚽','🏀','🏐','🥎','🪀',
    '🏋️','🪈','🧱','🪵','🪛','🪚','🧲','🧩','🧸','🪑','🛋️','🛌','🧎','🧍','🏟️','🏟️',
    '🛹','🛼','⛸️','🎳','🎯','🪆','🧷','🪝','🪤','🧰','🧳','🧯','🪧'
  ] },
  { label: 'Objects', items: [
    '🪞','🪟','🪟','🧰','🧲','🧪','📱','💻','⌚','📺','📷','📹','🎥','📌','📍','🗂️','🗒️',
    '📎','🖊️','✏️','📐','📏','🧷','🪜','🧯','🧯','🪣','🧴','🧹','🧼','🪥','🪒','🛒',
    '🪑','🛋️','🛏️','🪟','🪔','🧯','🧯','🧻','🧻','🛁','🚰','🚽','🧽','🪮'
  ] },
  { label: 'Symbols', items: ['✅','❗','⭐','💥','💯','🔁','➡️','⬆️','⬇️','⬅️','↔️','⚙️','➕','➖','✳️','⚡','🔷','🔶','🔸','🔹','💠','🔺','🔻','🔴','🟢','🟡','🔵','🟣'] },
];

function loadRecentEmojis(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem('pt-type-emoji-recents') || '[]');
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
  } catch {
    return [];
  }
}

function saveRecentEmoji(emoji: string) {
  try {
    const current = loadRecentEmojis().filter(item => item !== emoji);
    localStorage.setItem('pt-type-emoji-recents', JSON.stringify([emoji, ...current].slice(0, 24)));
  } catch {}
}

function mergeMeta(base: ExerciseTypeMeta, type: string, patch: { letters?: string; emoji?: string }) {
  const key = normalizeExerciseType(type).toLowerCase();
  const current = base[key] ?? defaultExerciseTypeMeta(type);
  return {
    ...base,
    [key]: {
      letters: patch.letters !== undefined ? patch.letters : current.letters,
      emoji: patch.emoji !== undefined ? patch.emoji : current.emoji,
    },
  };
}

export default function TypeSettingsModal({ types, meta, onChange, onClose }: Props) {
  const [typeQuery, setTypeQuery] = useState('');
  const [emojiQuery, setEmojiQuery] = useState('');
  const [pickerType, setPickerType] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    setRecent(loadRecentEmojis());
  }, []);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, [onClose]);

  const filteredTypes = useMemo(() => {
    const q = typeQuery.trim().toLowerCase();
    const unique = Array.from(new Set(types.map(normalizeExerciseType)));
    return unique
      .sort((a, b) => a.localeCompare(b))
      .filter(type => !q || type.toLowerCase().includes(q) || (meta[type.toLowerCase()]?.letters ?? '').toLowerCase().includes(q));
  }, [meta, typeQuery, types]);

  const activeType = pickerType ? normalizeExerciseType(pickerType) : '';
  const activeEmoji = activeType ? (meta[activeType.toLowerCase()]?.emoji ?? '') : '';

  const emojiGroups = useMemo(() => {
    const q = emojiQuery.trim().toLowerCase();
    const groups = EMOJI_GROUPS.map(group => ({
      ...group,
      items: group.label === 'Recent'
        ? recent
        : group.items.filter(emoji => !q || emoji.includes(q) || emoji === q),
    })).filter(group => group.items.length > 0 || group.label === 'Recent');
    return groups;
  }, [emojiQuery, recent]);

  const setLetters = (type: string, letters: string) => {
    const clean = Array.from(letters.replace(/\s+/g, '')).slice(0, 3).join('');
    onChange(mergeMeta(meta, type, { letters: clean || defaultExerciseTypeMeta(type).letters }));
  };

  const setEmoji = (type: string, emoji: string) => {
    saveRecentEmoji(emoji);
    setRecent(loadRecentEmojis());
    onChange(mergeMeta(meta, type, { emoji }));
  };

  return (
    <div
      className="fixed inset-0 z-[78] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm sm:px-4 sm:py-8"
      onClick={onClose}
    >
      <div
        className="bg-[#F6F1E7] w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col"
        onClick={e => e.stopPropagation()}
        style={{ maxHeight: '92dvh' }}
      >
        <div className="px-4 py-3 border-b border-stone-200 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-serif text-lg font-semibold text-stone-800">Exercise types</h2>
            <p className="text-[11px] text-stone-400">Set the 3-character label and optional emoji for each type.</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full hover:bg-stone-200 flex items-center justify-center text-stone-500 text-xl">×</button>
        </div>

        <div className="px-4 py-4 overflow-y-auto space-y-3">
          <div className="sticky top-0 z-10 bg-[#F6F1E7] pb-3">
            <input
              value={typeQuery}
              onChange={e => setTypeQuery(e.target.value)}
              placeholder="Search types or letters..."
              className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm"
              style={{ fontSize: 16, colorScheme: 'light' }}
            />
          </div>

          <div className="space-y-2">
            {filteredTypes.map(type => {
              const key = type.toLowerCase();
              const current = meta[key] ?? defaultExerciseTypeMeta(type);
              const displayLetters = (current.letters ?? getExerciseTypeMark(type)).toUpperCase().slice(0, 3);
              return (
                <div key={type} className="rounded-2xl border border-stone-100 bg-white px-3 py-3">
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-stone-800">{type}</p>
                      <p className="text-[11px] text-stone-400">Displayed as {displayLetters}{current.emoji ? ` ${current.emoji}` : ''}</p>
                    </div>
                    <input
                      value={displayLetters}
                      onChange={e => setLetters(type, e.target.value)}
                      className="w-16 rounded-lg border border-stone-200 px-2 py-2 text-center text-sm font-bold uppercase tracking-widest"
                      maxLength={3}
                    />
                    <button
                      onClick={() => setPickerType(type)}
                      className="min-w-11 h-11 rounded-xl border border-stone-200 bg-stone-50 px-2 text-xl flex items-center justify-center"
                      title="Pick emoji"
                    >
                      {current.emoji || '😀'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {pickerType && (
        <div className="fixed inset-0 z-[79] flex items-end sm:items-center justify-center bg-black/45 backdrop-blur-[1px]" onClick={() => setPickerType(null)}>
          <div className="w-full sm:max-w-lg bg-[#F6F1E7] rounded-t-2xl sm:rounded-2xl border-t sm:border border-stone-200 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-stone-200 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Emoji picker</p>
                <h3 className="font-serif text-base font-semibold text-stone-800 truncate">{activeType}</h3>
              </div>
              <button onClick={() => setPickerType(null)} className="w-8 h-8 rounded-full hover:bg-stone-200 flex items-center justify-center text-stone-500 text-xl">×</button>
            </div>

            <div className="p-3">
              <input
                value={emojiQuery}
                onChange={e => setEmojiQuery(e.target.value)}
                placeholder="Search emoji"
                className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm"
                style={{ fontSize: 16, colorScheme: 'light' }}
              />
              <div className="mt-3 space-y-3 max-h-[60dvh] overflow-y-auto pr-1">
                {emojiGroups.map(group => (
                  <div key={group.label}>
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">{group.label}</p>
                      {group.label === 'Recent' && activeEmoji && (
                        <button
                          onClick={() => { setEmoji(activeType, ''); setPickerType(null); }}
                          className="text-[10px] font-semibold text-stone-400 hover:text-stone-600"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-8 sm:grid-cols-10 gap-1.5">
                      {group.items.map(emoji => (
                        <button
                          key={`${group.label}-${emoji}`}
                          onClick={() => { setEmoji(activeType, emoji); setPickerType(null); }}
                          className="h-11 rounded-xl border border-stone-100 bg-white text-xl flex items-center justify-center hover:bg-stone-50"
                          title={emoji}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
