'use client';

import { useEffect, useMemo, useState } from 'react';
import { ExerciseTypeMeta, defaultExerciseTypeMeta, getExerciseTypeMark, normalizeExerciseType } from '@/lib/exerciseTypes';

interface Props {
  types: string[];
  meta: ExerciseTypeMeta;
  onChange: (next: ExerciseTypeMeta) => void;
  onClose: () => void;
}

export type EmojiItem = { emoji: string; keywords: string[] };
export type EmojiGroup = { label: string; items: EmojiItem[] };

const emojiItem = (emoji: string, keywords: string | string[]): EmojiItem => ({
  emoji,
  keywords: Array.isArray(keywords) ? keywords : keywords.split('|').map(k => k.trim()).filter(Boolean),
});

export const EMOJI_GROUPS: EmojiGroup[] = [
  { label: 'Recent', items: [] },
  { label: 'Cardio', items: [
    emojiItem('❤️', 'heart|cardio|pulse'),
    emojiItem('🫀', 'heart|cardio|pulse|heart rate'),
    emojiItem('🏃', 'run|jog|treadmill|cardio'),
    emojiItem('🏃‍♀️', 'run|jog|treadmill|cardio'),
    emojiItem('🏃‍♂️', 'run|jog|treadmill|cardio'),
    emojiItem('🚴', 'bike|cycle|cardio'),
    emojiItem('🚴‍♀️', 'bike|cycle|cardio'),
    emojiItem('🚴‍♂️', 'bike|cycle|cardio'),
    emojiItem('🏊', 'swim|cardio'),
    emojiItem('🏊‍♀️', 'swim|cardio'),
    emojiItem('🏊‍♂️', 'swim|cardio'),
    emojiItem('🏁', 'goal|finish|race'),
    emojiItem('🎽', 'run|race|cardio'),
    emojiItem('🔥', 'burn|intense|cardio'),
    emojiItem('⚡', 'speed|interval|cardio'),
    emojiItem('💦', 'sweat|cardio'),
    emojiItem('⏱️', 'timer|interval|hiit'),
    emojiItem('⌛', 'timer|interval'),
    emojiItem('📈', 'progress|cardio'),
  ] },
  { label: 'Workout', items: [
    emojiItem('🏋️', 'weights|gym|lift'),
    emojiItem('🏋️‍♀️', 'weights|gym|lift'),
    emojiItem('🏋️‍♂️', 'weights|gym|lift'),
    emojiItem('🚶', 'walk|walking|warmup|treadmill'),
    emojiItem('🚶‍♀️', 'walk|walking|warmup|treadmill'),
    emojiItem('🚶‍♂️', 'walk|walking|warmup|treadmill'),
    emojiItem('🧘', 'stretch|mobility|yoga'),
    emojiItem('🤸', 'mobility|agility|warmup'),
    emojiItem('🤼', 'core|conditioning'),
    emojiItem('⛹️', 'sport|conditioning'),
    emojiItem('🧎', 'kneel|ground|stretch'),
    emojiItem('🧍', 'stand|posture'),
    emojiItem('🔁', 'repeat|cycle'),
    emojiItem('↔️', 'side|range|mobility'),
    emojiItem('⬆️', 'up|progress'),
    emojiItem('⬇️', 'down|regress'),
    emojiItem('➡️', 'forward|advance'),
    emojiItem('⬅️', 'back|reverse'),
    emojiItem('🔄', 'repeat|rotate'),
    emojiItem('▶️', 'play|start'),
  ] },
  { label: 'Body', items: [
    emojiItem('💪', 'arm|strength|upper body'),
    emojiItem('🦵', 'leg|lower body'),
    emojiItem('🦶', 'foot|ankle|toe'),
    emojiItem('🧠', 'brain|balance|coordination'),
    emojiItem('🦴', 'bone|skeleton'),
    emojiItem('🦾', 'arm|prosthetic|strength'),
    emojiItem('🦿', 'leg|prosthetic|strength'),
    emojiItem('🖐️', 'hand|wrist'),
    emojiItem('✋', 'hand|palm'),
    emojiItem('👣', 'foot|steps|gait'),
    emojiItem('👀', 'vision|balance'),
    emojiItem('👂', 'hearing|balance'),
    emojiItem('👃', 'breathing|nose'),
    emojiItem('👐', 'hands|open'),
    emojiItem('👏', 'hands|activation'),
    emojiItem('🤝', 'assist|support'),
    emojiItem('🙏', 'stretch|mobility'),
    emojiItem('🤙', 'hand|cue'),
    emojiItem('☝️', 'point|one'),
    emojiItem('✌️', 'two|peace'),
    emojiItem('🤘', 'strong|hand'),
  ] },
  { label: 'Medical', items: [
    emojiItem('🩺', 'medical|doctor|rehab'),
    emojiItem('💊', 'meds|pill'),
    emojiItem('🩹', 'bandage|tape'),
    emojiItem('🧊', 'ice|cold|cryo'),
    emojiItem('🏥', 'hospital|clinic'),
    emojiItem('🚑', 'ambulance'),
    emojiItem('⚕️', 'medical'),
    emojiItem('🩻', 'xray|scan'),
    emojiItem('🦽', 'wheelchair'),
    emojiItem('🩼', 'crutch'),
    emojiItem('🧴', 'lotion|cream'),
    emojiItem('📋', 'clipboard|chart'),
    emojiItem('📈', 'progress|tracking'),
    emojiItem('📉', 'decline|tracking'),
    emojiItem('💉', 'needle'),
    emojiItem('🩸', 'blood'),
  ] },
  { label: 'Equipment', items: [
    emojiItem('🪜', 'stairs|stair master|stepmill|steps'),
    emojiItem('🏃', 'treadmill|cardio'),
    emojiItem('🏋️', 'weights|gym'),
    emojiItem('🚴', 'bike erg|cycle'),
    emojiItem('🛞', 'wheel|cycle'),
    emojiItem('🪢', 'band|strap'),
    emojiItem('🪝', 'anchor|hook'),
    emojiItem('🧲', 'resistance|magnet'),
    emojiItem('🪑', 'chair|box'),
    emojiItem('🛋️', 'couch|support'),
    emojiItem('🛌', 'bed|rest'),
    emojiItem('🎳', 'roll|lane'),
    emojiItem('🛹', 'balance|board'),
    emojiItem('🛼', 'balance|skate'),
    emojiItem('⛸️', 'balance|skate'),
    emojiItem('🏟️', 'stadium|cardio'),
    emojiItem('🧰', 'kit|tools'),
    emojiItem('🧳', 'carry|travel'),
    emojiItem('🪧', 'sign|cue'),
  ] },
  { label: 'Objects', items: [
    emojiItem('🪞', 'mirror|posture'),
    emojiItem('🪟', 'window|frame'),
    emojiItem('📱', 'phone|mobile'),
    emojiItem('💻', 'laptop|desktop'),
    emojiItem('⌚', 'watch|timer'),
    emojiItem('📺', 'screen|video'),
    emojiItem('📷', 'photo|camera'),
    emojiItem('📹', 'video|camera'),
    emojiItem('🎥', 'video|film'),
    emojiItem('📌', 'pin|marker'),
    emojiItem('📍', 'location|marker'),
    emojiItem('🗂️', 'files|folder'),
    emojiItem('🗒️', 'notes|paper'),
    emojiItem('📎', 'clip|paperclip'),
    emojiItem('🖊️', 'pen'),
    emojiItem('✏️', 'pencil'),
    emojiItem('📐', 'measure|angle'),
    emojiItem('📏', 'measure|length'),
    emojiItem('🪣', 'bucket'),
    emojiItem('🧹', 'clean|broom'),
    emojiItem('🧼', 'clean|soap'),
    emojiItem('🛒', 'cart'),
    emojiItem('🛁', 'bath'),
    emojiItem('🚰', 'water'),
    emojiItem('🚽', 'toilet'),
    emojiItem('🧽', 'sponge'),
    emojiItem('🪮', 'comb'),
  ] },
  { label: 'Symbols', items: [
    emojiItem('✅', 'check|done'),
    emojiItem('❗', 'alert|important'),
    emojiItem('⭐', 'star|favorite'),
    emojiItem('💯', 'perfect'),
    emojiItem('➕', 'add|plus'),
    emojiItem('➖', 'remove|minus'),
    emojiItem('⚙️', 'settings|gear'),
    emojiItem('💥', 'impact'),
    emojiItem('🔷', 'blue|diamond'),
    emojiItem('🔶', 'orange|diamond'),
    emojiItem('🔸', 'small|diamond'),
    emojiItem('🔹', 'small|diamond'),
    emojiItem('💠', 'diamond'),
    emojiItem('🔺', 'up|triangle'),
    emojiItem('🔻', 'down|triangle'),
    emojiItem('🔴', 'red'),
    emojiItem('🟢', 'green'),
    emojiItem('🟡', 'yellow'),
    emojiItem('🔵', 'blue'),
    emojiItem('🟣', 'purple'),
  ] },
];

export function loadRecentEmojis(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem('pt-type-emoji-recents') || '[]');
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
  } catch {
    return [];
  }
}

export function saveRecentEmoji(emoji: string) {
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
  const [recent, setRecent] = useState<string[]>(() => loadRecentEmojis());

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
        ? recent.map(emoji => ({ emoji, keywords: [emoji] }))
        : group.items.filter(item => !q || item.emoji.includes(q) || item.keywords.some(keyword => keyword.toLowerCase().includes(q))),
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
        <div className="fixed inset-0 z-[79] flex items-start sm:items-center justify-center bg-black/45 backdrop-blur-[1px]" onClick={() => setPickerType(null)}>
          <div className="flex h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden bg-[#F6F1E7] shadow-2xl sm:h-auto sm:max-h-[88dvh] sm:max-w-lg sm:rounded-2xl sm:border sm:border-stone-200" onClick={e => e.stopPropagation()}>
            <div className="flex flex-shrink-0 items-start justify-between gap-3 border-b border-stone-200 px-4 py-3">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Emoji picker</p>
                <h3 className="font-serif text-base font-semibold text-stone-800 truncate">{activeType}</h3>
              </div>
              <button onClick={() => setPickerType(null)} className="w-8 h-8 rounded-full hover:bg-stone-200 flex items-center justify-center text-stone-500 text-xl">×</button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <input
                value={emojiQuery}
                onChange={e => setEmojiQuery(e.target.value)}
                placeholder="Search emoji"
                onFocus={e => window.setTimeout(() => e.currentTarget.scrollIntoView({ block: 'start' }), 100)}
                className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm"
                style={{ fontSize: 16, colorScheme: 'light' }}
              />
              <div className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1 [-webkit-overflow-scrolling:touch]">
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
                      {group.items.map(item => (
                        <button
                          key={`${group.label}-${item.emoji}`}
                          onClick={() => { setEmoji(activeType, item.emoji); setPickerType(null); }}
                          className="h-11 rounded-xl border border-stone-100 bg-white text-xl flex items-center justify-center hover:bg-stone-50"
                          title={item.keywords.join(', ')}
                        >
                          {item.emoji}
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
