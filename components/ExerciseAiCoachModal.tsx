'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Exercise } from '@/lib/exercises';
import { SmartDbMatch } from '@/components/SmartAddTypes';
import { extractAiInstructions, stripSecretNotes } from '@/lib/secretNotes';
import SecretTextarea from './SecretTextarea';
import { normalizeAiReplyOptions } from '@/lib/aiReplyOptions';
import { AI_COACH_ACTIVE_KEY, AI_COACH_SESSION_KEY, aiAnswerDateSegments, formatAiDate, isIsoCalendarDate } from '@/lib/aiDatePresentation';

type DateLink = {
  date: string;
  label: string;
  reason?: string;
};

type DateSummary = {
  date: string;
  summary: string;
};

type ExerciseDraft = Partial<Exercise> & {
  confidence?: string;
  nextStep?: string;
};

type AiReply = {
  answer: string;
  options: string[];
  dateLinks: DateLink[];
  dateSummaries?: DateSummary[];
  confirmedExercise?: ExerciseDraft;
  model?: string;
  searchedDays?: number;
  rerankerModel?: string;
  rerankedCandidates?: number;
  degraded?: boolean;
};

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  aiInstructions?: string[];
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

function restoreConversation(): { input: string; messages: ChatMessage[] } {
  if (typeof window === 'undefined') return { input: '', messages: [] };
  try {
    const stored = JSON.parse(sessionStorage.getItem(AI_COACH_SESSION_KEY) || '{}') as Record<string, unknown>;
    const input = typeof stored.input === 'string' ? stored.input.slice(0, 4000) : '';
    const messages = Array.isArray(stored.messages)
      ? stored.messages.filter((message): message is ChatMessage => Boolean(message)
        && typeof message === 'object'
        && (message.role === 'user' || message.role === 'assistant')
        && typeof message.id === 'string'
        && typeof message.content === 'string').slice(-20)
      : [];
    return { input, messages };
  } catch {
    return { input: '', messages: [] };
  }
}

function InlineAnswerDates({ text, today, summaries, onPreview }: {
  text: string;
  today: string;
  summaries: DateSummary[];
  onPreview: (summary: DateSummary) => void;
}) {
  const summaryByDate = new Map(summaries.map(summary => [summary.date, summary]));
  return aiAnswerDateSegments(text).map((segment, index) => {
    if (!segment.date) return <span key={index}>{segment.text}</span>;
    const label = formatAiDate(segment.date, today);
    const summary = summaryByDate.get(segment.date);
    if (!summary) return <span key={index}>{label}</span>;
    return (
      <button
        key={index}
        type="button"
        onClick={() => onPreview(summary)}
        className="inline border-0 bg-transparent p-0 font-semibold text-[#476653] underline decoration-[#8EAA96] decoration-1 underline-offset-2"
        style={{
          touchAction: 'manipulation',
          fontFamily: 'inherit',
          fontSize: 'inherit',
          lineHeight: 'inherit',
          letterSpacing: 'inherit',
          verticalAlign: 'baseline',
          WebkitAppearance: 'none',
        }}
        aria-label={`Show a quick summary for ${displayDate(segment.date)}`}
      >
        {label}
      </button>
    );
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
      aiInstructions: message.aiInstructions?.slice(0, 4).map(instruction => instruction.slice(0, 300)),
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
  const initialConversation = useMemo(() => restoreConversation(), []);
  const [input, setInput] = useState(initialConversation.input);
  const [messages, setMessages] = useState<ChatMessage[]>(initialConversation.messages);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copyStatus, setCopyStatus] = useState<Record<string, string>>({});
  const [datePreview, setDatePreview] = useState<DateSummary | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);

  const clearStoredConversation = () => {
    try {
      sessionStorage.removeItem(AI_COACH_ACTIVE_KEY);
      sessionStorage.removeItem(AI_COACH_SESSION_KEY);
    } catch {}
  };

  const closeModal = () => {
    clearStoredConversation();
    onClose();
  };

  const persistConversation = (nextInput = input, nextMessages = messages) => {
    try {
      sessionStorage.setItem(AI_COACH_ACTIVE_KEY, '1');
      sessionStorage.setItem(AI_COACH_SESSION_KEY, JSON.stringify({ input: nextInput, messages: nextMessages.slice(-20) }));
    } catch {}
  };

  useEffect(() => {
    try { sessionStorage.setItem(AI_COACH_ACTIVE_KEY, '1'); } catch {}
  }, []);

  useEffect(() => {
    persistConversation(input, messages);
    // Draft text is saved immediately before date navigation; avoid synchronous storage work on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  useEffect(() => {
    const fn = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (datePreview) setDatePreview(null);
      else closeModal();
    };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datePreview, onClose]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading, error]);

  const apiHistory = useMemo(() => historyForApi(messages), [messages]);

  const ask = async (text: string) => {
    const serialized = text.trim();
    const clean = stripSecretNotes(serialized).trim();
    const aiInstructions = extractAiInstructions(serialized).slice(0, 4);
    if (!clean || loading) return;

    const userMessage: ChatMessage = { id: makeId(), role: 'user', content: clean, aiInstructions };
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
          question: serialized,
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
        options: normalizeAiReplyOptions(data.reply?.options),
        dateLinks: Array.isArray(data.reply?.dateLinks) ? data.reply.dateLinks.slice(0, 5) : [],
        dateSummaries: Array.isArray(data.reply?.dateSummaries)
          ? data.reply.dateSummaries.filter((item: unknown): item is DateSummary => Boolean(item)
            && typeof item === 'object'
            && isIsoCalendarDate(String((item as DateSummary).date))
            && typeof (item as DateSummary).summary === 'string').slice(0, 8)
          : [],
        confirmedExercise: data.reply?.confirmedExercise,
        model: data.model,
        searchedDays: Number.isFinite(Number(data.searchedDays)) ? Number(data.searchedDays) : undefined,
        rerankerModel: typeof data.rerankerModel === 'string' ? data.rerankerModel : undefined,
        rerankedCandidates: Number.isFinite(Number(data.rerankedCandidates)) ? Number(data.rerankedCandidates) : undefined,
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
      window.setTimeout(() => composerRef.current?.querySelector<HTMLElement>('[role="textbox"]')?.focus(), 100);
    }
  };

  const openDate = (date: string) => {
    persistConversation();
    try { sessionStorage.removeItem(AI_COACH_ACTIVE_KEY); } catch {}
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
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm px-3 py-4" onClick={closeModal}>
      <div className="w-full max-w-lg rounded-3xl bg-[#F6F1E7] shadow-2xl border border-white/50 flex flex-col" style={{ maxHeight: '94dvh' }} onClick={event => event.stopPropagation()}>
        <div className="px-5 py-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">PT Motivator assistant</p>
            <h2 className="font-serif text-xl font-semibold text-stone-800">Ask anything about your PT</h2>
            <p className="text-xs text-stone-500 mt-1 leading-snug">Ask about any saved day, find when something happened, compare patterns, identify a movement, construct an exercise, or keep asking follow-ups.</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {messages.length > 0 && (
              <button onClick={() => { setMessages([]); setInput(''); setDatePreview(null); setError(''); try { sessionStorage.removeItem(AI_COACH_SESSION_KEY); } catch {} }} className="rounded-lg bg-white border border-stone-100 px-2.5 py-2 text-[10px] font-bold text-stone-400">Clear</button>
            )}
            <button onClick={closeModal} className="w-9 h-9 rounded-full bg-white hover:bg-stone-100 border border-stone-100 flex items-center justify-center text-stone-500 text-xl" aria-label="Close Ask AI">×</button>
          </div>
        </div>

        <div ref={scrollRef} className={`${messages.length || loading || error ? 'block' : 'hidden'} overflow-y-auto px-5 py-4 flex-1 space-y-3`}>
          {messages.map(message => {
            if (message.role === 'user') {
              return (
                <div key={message.id} className="ml-8 rounded-2xl px-3 py-2.5 text-sm leading-snug bg-[#1F2F46] text-white whitespace-pre-wrap">
                  {message.content}
                  {!!message.aiInstructions?.length && (
                    <div className="mt-2 border-t border-white/15 pt-1.5 text-[11px] leading-snug text-[#C6DCE9]">
                      {message.aiInstructions.map((instruction, index) => (
                        <div key={`${message.id}-ai-${index}`} className="flex items-start gap-1">
                          <span className="font-bold uppercase">AI</span>
                          <span className="border-b border-[#C6DCE9]/50">{instruction}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            const reply = message.reply;
            return (
              <div key={message.id} className="space-y-2">
                <div className="mr-8 rounded-2xl bg-white border border-stone-100 px-3 py-2.5 text-sm leading-relaxed text-stone-700 whitespace-pre-wrap">
                  <InlineAnswerDates text={message.content} today={today} summaries={reply?.dateSummaries ?? []} onPreview={setDatePreview} />
                  {(reply?.model || reply?.searchedDays || reply?.rerankerModel) && (
                    <div className="mt-2 flex flex-wrap gap-2 text-[9px] font-semibold uppercase tracking-wide text-stone-300">
                      {reply?.searchedDays ? <span>Searched {reply.searchedDays} saved days</span> : null}
                      {reply?.rerankerModel ? <span>{reply.rerankerModel.includes('scout') ? 'Scout' : 'AI'} ranked {reply.rerankedCandidates ?? 0} candidates</span> : null}
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
                            <p className="text-[10px] font-semibold text-[#7E9B86] mt-0.5">{formatAiDate(link.date, today)}</p>
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

        <div ref={composerRef} className="px-5 pb-4 pt-1">
          <SecretTextarea
            value={input}
            onChange={setInput}
            placeholder="Ask about a past day, a symptom pattern, an exercise, or follow up on the answer…"
            rows={2}
            className="ai-coach-composer-editor w-full text-sm border border-stone-200 rounded-lg px-3 py-2 focus:outline-none resize-y bg-white"
            style={{ fontSize: 16, colorScheme: 'light' }}
          />
          <button onClick={() => void ask(input)} disabled={loading || !stripSecretNotes(input).trim()} className="mt-2 w-full py-3 rounded-lg text-sm font-bold text-white disabled:opacity-40" style={{ background: '#1F2F46', touchAction: 'manipulation' }}>
            {loading ? 'Thinking…' : messages.length ? 'Send follow-up' : 'Ask AI'}
          </button>
          <p className="mt-2 text-center text-[10px] leading-snug text-stone-400">It can use your saved logs, but its health interpretations are not a diagnosis.</p>
        </div>
      </div>

      {datePreview && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/35 px-5" onClick={event => { event.stopPropagation(); setDatePreview(null); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="ai-date-summary-title" className="w-full max-w-sm rounded-lg border border-stone-200 bg-white p-4 shadow-2xl" onClick={event => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase text-stone-400">Day at a glance</p>
                <h3 id="ai-date-summary-title" className="mt-0.5 text-base font-semibold text-stone-800">{displayDate(datePreview.date)}</h3>
              </div>
              <button type="button" onClick={() => setDatePreview(null)} className="flex h-8 w-8 items-center justify-center rounded-full border border-stone-200 text-lg text-stone-500" aria-label="Close day summary">×</button>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-stone-600">{datePreview.summary}</p>
            <button type="button" onClick={() => openDate(datePreview.date)} className="mt-4 w-full rounded-lg bg-[#1F2F46] py-2.5 text-sm font-bold text-white" style={{ touchAction: 'manipulation' }}>Open day</button>
          </div>
        </div>
      )}
    </div>
  );
}
