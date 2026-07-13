'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Exercise } from '@/lib/exercises';
import { SmartDbMatch } from '@/components/SmartAddTypes';

type DateLink = {
  date: string;
  label: string;
  reason?: string;
};

type ExerciseDraft = Partial<Exercise> & {
  confidence?: string;
  nextStep?: string;
};

type AiReply = {
  answer: string;
  options: string[];
  dateLinks: DateLink[];
  confirmedExercise?: ExerciseDraft;
  model?: string;
  searchedDays?: number;
  degraded?: boolean;
};

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  reply?: AiReply;
};

type ExerciseDbResult = {
  source?: 'exercisedb';
  exerciseId: string;
  name: string;
  targetMuscles?: string[];
  bodyParts?: string[];
  equipments?: string[];
  instructions?: string[];
};

type ApiNinjasResult = {
  source?: 'api_ninjas';
  id?: string;
  name: string;
  type?: string;
  muscle?: string;
  difficulty?: string;
  instructions?: string;
  equipments?: string[];
};

interface Props {
  exercises: Exercise[];
  selectedDate: string;
  today: string;
  onClose: () => void;
}

const STARTERS = [
  'Which day did I first mention burning or stinging under my foot?',
  'What did I log the day after my most recent PT session?',
  'Help me construct an exercise from a movement I remember',
  'Compare my pain on PT days with the following day',
];

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function errorMessage(res: Response, data: { error?: string; detail?: string; hint?: string }) {
  const detail = data.detail ? `: ${data.detail}` : '';
  const hint = data.hint ? ` ${data.hint}` : '';
  return data.error ? `${data.error}${detail}${hint}` : `Ask AI failed (${res.status})${detail}${hint}`;
}

function toTitleCase(value: string) {
  return value.replace(/\w\S*/g, word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

function normalizeExerciseDbMatch(item: ExerciseDbResult): SmartDbMatch {
  const target = item.targetMuscles?.join(', ') ?? '';
  const equipment = item.equipments?.join(', ') ?? '';
  return {
    source: 'exercisedb',
    sourceId: item.exerciseId,
    name: toTitleCase(item.name),
    cue: [target, equipment].filter(Boolean).join(' · '),
    tips: item.instructions?.slice(0, 5),
    label: 'ExerciseDB',
  };
}

function normalizeApiNinjasMatch(item: ApiNinjasResult, index: number): SmartDbMatch {
  return {
    source: 'api_ninjas',
    sourceId: item.name || item.id || `api-ninjas-${index}`,
    name: toTitleCase(item.name),
    cue: [item.type, item.muscle, item.difficulty].filter(Boolean).join(' · '),
    tips: item.instructions ? [item.instructions] : [],
    label: 'API Ninjas',
  };
}

function shouldSearchExerciseSources(value: string) {
  const exerciseWords = /exercise|movement|stretch|drill|band|raise|curl|squat|lunge|bridge|balance|mobility|strength|form|construct|build|identify/i;
  const historyWords = /which day|what day|when did|history|previous|last time|day after|day before|compare|pattern|trend/i;
  return exerciseWords.test(value) && !historyWords.test(value);
}

async function searchExternalSources(search: string): Promise<SmartDbMatch[]> {
  if (search.trim().length < 2) return [];
  const [exerciseDbRes, apiNinjasRes] = await Promise.all([
    fetch(`/api/exercisedb/search?search=${encodeURIComponent(search)}`).then(r => r.json()).catch(() => ({ success: false, data: [] })),
    fetch(`/api/api-ninjas/exercises?search=${encodeURIComponent(search)}`).then(r => r.json()).catch(() => ({ success: false, data: [] })),
  ]);

  const exerciseDbMatches: SmartDbMatch[] = Array.isArray(exerciseDbRes.data)
    ? exerciseDbRes.data.slice(0, 5).map((item: ExerciseDbResult) => normalizeExerciseDbMatch(item))
    : [];
  const apiNinjasMatches: SmartDbMatch[] = Array.isArray(apiNinjasRes.data)
    ? apiNinjasRes.data.slice(0, 5).map((item: ApiNinjasResult, index: number) => normalizeApiNinjasMatch(item, index))
    : [];

  return [...exerciseDbMatches, ...apiNinjasMatches].slice(0, 8);
}

function fallbackCopy(text: string) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try { document.execCommand('copy'); } finally { textarea.remove(); }
}

function displayDate(date: string) {
  return new Date(date + 'T12:00:00').toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function historyForApi(messages: ChatMessage[]) {
  return messages.slice(-10).map(message => {
    const dates = message.reply?.dateLinks?.length
      ? `\nRelevant dates: ${message.reply.dateLinks.map(link => `${link.date} (${link.reason || link.label})`).join('; ')}`
      : '';
    return {
      role: message.role,
      content: `${message.content}${dates}`.slice(0, 900),
    };
  });
}

function exerciseDraftText(draft: ExerciseDraft) {
  return [
    draft.name,
    draft.cat ? `Type: ${draft.cat}` : '',
    draft.cue,
    draft.sets,
    ...(draft.tips ?? []),
  ].filter(Boolean).join('\n');
}

function exerciseDraftJson(draft: ExerciseDraft) {
  return JSON.stringify({
    id: '',
    cat: draft.cat || 'mobility',
    name: draft.name || '',
    cue: draft.cue || '',
    sets: draft.sets || '',
    videoIds: [],
    videoTitles: [],
    imageSearch: draft.imageSearch || draft.name || '',
    tips: draft.tips || [],
    origin: 'patient_added',
  }, null, 2);
}

async function copyValue(value: string) {
  if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value);
  else fallbackCopy(value);
}

export default function ExerciseAiCoachModal({ exercises, selectedDate, today, onClose }: Props) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copyStatus, setCopyStatus] = useState<Record<string, string>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const fn = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, [onClose]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading, error]);

  const apiHistory = useMemo(() => historyForApi(messages), [messages]);

  const ask = async (text: string) => {
    const clean = text.trim();
    if (!clean || loading) return;

    const userMessage: ChatMessage = { id: makeId(), role: 'user', content: clean };
    const historyBeforeQuestion = apiHistory;
    setMessages(previous => [...previous, userMessage]);
    setInput('');
    setLoading(true);
    setError('');

    try {
      const sourceMatches = shouldSearchExerciseSources(clean) ? await searchExternalSources(clean) : [];
      const res = await fetch('/api/ai-exercise-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: clean,
          history: historyBeforeQuestion,
          sourceMatches,
          selectedDate,
          today,
          exercises: exercises.map(exercise => ({
            id: exercise.id,
            name: exercise.name,
            cat: exercise.cat,
            cue: exercise.cue,
            sets: exercise.sets,
            tips: exercise.tips?.slice(0, 4),
          })).slice(0, 250),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(errorMessage(res, data));

      const reply: AiReply = {
        answer: String(data.reply?.answer || 'I need one more detail to answer that.'),
        options: Array.isArray(data.reply?.options) ? data.reply.options.slice(0, 4) : [],
        dateLinks: Array.isArray(data.reply?.dateLinks) ? data.reply.dateLinks.slice(0, 5) : [],
        confirmedExercise: data.reply?.confirmedExercise,
        model: data.model,
        searchedDays: Number.isFinite(Number(data.searchedDays)) ? Number(data.searchedDays) : undefined,
        degraded: data.degraded === true,
      };

      setMessages(previous => [...previous, {
        id: makeId(),
        role: 'assistant',
        content: reply.answer,
        reply,
      }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ask AI failed');
    } finally {
      setLoading(false);
      window.setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const openDate = (date: string) => {
    localStorage.setItem('pt-selected-date', date);
    window.location.reload();
  };

  const copyDraft = async (messageId: string, draft: ExerciseDraft, format: 'text' | 'json') => {
    try {
      await copyValue(format === 'json' ? exerciseDraftJson(draft) : exerciseDraftText(draft));
      setCopyStatus(previous => ({ ...previous, [messageId]: format === 'json' ? 'JSON copied ✓' : 'Draft copied ✓' }));
    } catch {
      setCopyStatus(previous => ({ ...previous, [messageId]: 'Copy failed' }));
    }
    window.setTimeout(() => setCopyStatus(previous => ({ ...previous, [messageId]: '' })), 1600);
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm px-3 py-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-3xl bg-[#F6F1E7] shadow-2xl border border-white/50 flex flex-col" style={{ maxHeight: '94dvh' }} onClick={event => event.stopPropagation()}>
        <div className="px-5 py-4 border-b border-stone-200 flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">PT Motivator assistant</p>
            <h2 className="font-serif text-xl font-semibold text-stone-800">Ask anything about your PT</h2>
            <p className="text-xs text-stone-500 mt-1 leading-snug">Ask about any saved day, find when something happened, compare patterns, identify a movement, construct an exercise, or keep asking follow-ups.</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {messages.length > 0 && (
              <button onClick={() => { setMessages([]); setError(''); }} className="rounded-lg bg-white border border-stone-100 px-2.5 py-2 text-[10px] font-bold text-stone-400">Clear</button>
            )}
            <button onClick={onClose} className="w-9 h-9 rounded-full bg-white hover:bg-stone-100 border border-stone-100 flex items-center justify-center text-stone-500 text-xl">×</button>
          </div>
        </div>

        <div ref={scrollRef} className="overflow-y-auto px-5 py-4 flex-1 space-y-3">
          {!messages.length && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {STARTERS.map(item => (
                <button key={item} onClick={() => void ask(item)} className="text-left text-xs font-semibold leading-snug rounded-2xl bg-white border border-stone-100 px-3 py-3 text-stone-600 hover:bg-stone-50" style={{ touchAction: 'manipulation' }}>
                  {item}
                </button>
              ))}
            </div>
          )}

          {messages.map(message => {
            if (message.role === 'user') {
              return <div key={message.id} className="ml-8 rounded-2xl px-3 py-2.5 text-sm leading-snug bg-[#1F2F46] text-white whitespace-pre-wrap">{message.content}</div>;
            }

            const reply = message.reply;
            return (
              <div key={message.id} className="space-y-2">
                <div className="mr-8 rounded-2xl bg-white border border-stone-100 px-3 py-2.5 text-sm leading-relaxed text-stone-700 whitespace-pre-wrap">
                  {message.content}
                  {(reply?.model || reply?.searchedDays) && (
                    <div className="mt-2 flex flex-wrap gap-2 text-[9px] font-semibold uppercase tracking-wide text-stone-300">
                      {reply?.searchedDays ? <span>Searched {reply.searchedDays} saved days</span> : null}
                      {reply?.model ? <span>{reply.degraded ? 'Fallback result' : reply.model}</span> : null}
                    </div>
                  )}
                </div>

                {!!reply?.dateLinks?.length && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Tap to open the day</p>
                    {reply.dateLinks.map(link => (
                      <button key={`${message.id}-${link.date}`} onClick={() => openDate(link.date)} className="w-full rounded-2xl border border-[#D8E4DB] bg-[#F8FBF8] px-3 py-3 text-left transition hover:shadow-sm" style={{ touchAction: 'manipulation' }}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-stone-800">{link.label || displayDate(link.date)}</p>
                            <p className="text-[10px] font-semibold text-[#7E9B86] mt-0.5">{link.date}</p>
                            {link.reason && <p className="mt-1 text-xs leading-snug text-stone-500">{link.reason}</p>}
                          </div>
                          <span className="flex-shrink-0 text-lg text-[#7E9B86]">›</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {reply?.confirmedExercise && (
                  <div className="rounded-2xl border border-[#E4ECE6] bg-[#F8FBF8] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[#7E9B86]">App-ready exercise draft</p>
                        <h3 className="font-serif text-lg font-semibold text-stone-800 mt-1">{reply.confirmedExercise.name}</h3>
                      </div>
                      {reply.confirmedExercise.confidence && <span className="rounded-full bg-white px-2 py-1 text-[9px] font-bold uppercase text-stone-400">{reply.confirmedExercise.confidence}</span>}
                    </div>
                    {reply.confirmedExercise.cat && <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-stone-400">{reply.confirmedExercise.cat}</p>}
                    {reply.confirmedExercise.cue && <p className="text-sm text-stone-600 mt-2 leading-snug">{reply.confirmedExercise.cue}</p>}
                    {reply.confirmedExercise.sets && <p className="text-xs font-semibold text-stone-500 mt-2">{reply.confirmedExercise.sets}</p>}
                    {!!reply.confirmedExercise.tips?.length && (
                      <ul className="mt-2 space-y-1">
                        {reply.confirmedExercise.tips.slice(0, 6).map((tip, index) => <li key={index} className="text-xs text-stone-600 leading-snug">• {tip}</li>)}
                      </ul>
                    )}
                    {reply.confirmedExercise.nextStep && <p className="mt-2 rounded-xl bg-white px-2.5 py-2 text-xs text-stone-500"><span className="font-semibold">Next:</span> {reply.confirmedExercise.nextStep}</p>}
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button onClick={() => void copyDraft(message.id, reply.confirmedExercise!, 'text')} className="py-2.5 rounded-xl text-xs font-bold" style={{ background: '#E4ECE6', color: '#476653', touchAction: 'manipulation' }}>Copy description</button>
                      <button onClick={() => void copyDraft(message.id, reply.confirmedExercise!, 'json')} className="py-2.5 rounded-xl bg-white border border-stone-200 text-xs font-bold text-stone-600" style={{ touchAction: 'manipulation' }}>Copy JSON</button>
                    </div>
                    {copyStatus[message.id] && <p className="mt-2 text-center text-[10px] font-semibold text-[#7E9B86]">{copyStatus[message.id]}</p>}
                  </div>
                )}

                {!!reply?.options?.length && (
                  <div className="flex flex-wrap gap-1.5">
                    {reply.options.map(option => (
                      <button key={`${message.id}-${option}`} onClick={() => void ask(option)} className="rounded-full border border-stone-200 bg-white px-3 py-2 text-left text-xs font-semibold text-stone-600 hover:bg-[#FDF8EE]" style={{ touchAction: 'manipulation' }}>
                        {option}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {loading && <div className="mr-8 rounded-2xl bg-white border border-stone-100 px-3 py-2.5 text-sm text-stone-500">Checking your app history and thinking…</div>}
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 whitespace-pre-wrap">{error}</p>}
        </div>

        <div className="px-5 py-4 border-t border-stone-200">
          <textarea
            ref={inputRef}
            value={input}
            onChange={event => setInput(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void ask(input);
              }
            }}
            placeholder="Ask about a past day, a symptom pattern, an exercise, or follow up on the answer…"
            rows={2}
            className="w-full text-sm border border-stone-200 rounded-2xl px-3 py-3 focus:outline-none resize-none bg-white"
            style={{ fontSize: 16, colorScheme: 'light' }}
          />
          <button onClick={() => void ask(input)} disabled={loading || !input.trim()} className="mt-2 w-full py-3 rounded-2xl text-sm font-bold text-white disabled:opacity-40" style={{ background: '#1F2F46', touchAction: 'manipulation' }}>
            {loading ? 'Thinking…' : messages.length ? 'Send follow-up' : 'Ask AI'}
          </button>
          <p className="mt-2 text-center text-[10px] leading-snug text-stone-400">It can use your saved logs, but its health interpretations are not a diagnosis.</p>
        </div>
      </div>
    </div>
  );
}
