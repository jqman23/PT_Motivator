'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Exercise } from '@/lib/exercises';
import { SmartDbMatch } from '@/components/SmartAddTypes';
import { extractAiInstructions, stripSecretNotes } from '@/lib/secretNotes';
import SecretTextarea from './SecretTextarea';
import { normalizeAiReplyOptions } from '@/lib/aiReplyOptions';
import { isDirectBackdropInteraction } from '@/lib/modalInteraction';
import { AI_COACH_ACTIVE_KEY, AI_COACH_SESSION_KEY, aiAnswerDateSegments, formatAiDate, isIsoCalendarDate } from '@/lib/aiDatePresentation';
import {
  normalizeAiChatMessages,
  type AiChatSessionSummary,
  type StoredAiChatMessage,
  type StoredAiDateSummary,
  type StoredAiExerciseDraft,
  type StoredAiReply,
} from '@/lib/aiChatHistory';
import {
  agentActionNeedsPhoto,
  isAgentWriteAction,
  normalizeAgentPlan,
  type AgentAction,
  type PreviewedAgentPlan,
} from '@/lib/aiAgent';

type DateSummary = StoredAiDateSummary;
type ExerciseDraft = StoredAiExerciseDraft;
type AiReply = StoredAiReply;
type ChatMessage = StoredAiChatMessage;

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
  onOpenDate: (date: string) => void;
  appContext: {
    appTitle: string;
    categories: Array<{ id: string; name: string; color: string }>;
    ptSessions: Array<{ date: string; kind?: 'pt' | 'training'; note?: string }>;
    widgetPrefs: Record<string, boolean | undefined>;
  };
  onAgentApplied: (result: { runId: string; label: string; affectedDates: string[]; changedConfig: Record<string, unknown> }) => void;
  onAgentNavigate: (action: Extract<AgentAction, { type: 'navigate' }>) => void;
}

type AgentPhoto = { id: string; name: string; type: string; dataUrl: string; createdAt: string };

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('Could not read that photo.'));
    reader.readAsDataURL(file);
  });
}

async function prepareAgentPhoto(file: File): Promise<AgentPhoto> {
  const original = await readFile(file);
  const dataUrl = await new Promise<string>(resolve => {
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, 1100 / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext('2d');
      if (!context) return resolve(original);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.76));
    };
    image.onerror = () => resolve(original);
    image.src = original;
  });
  return {
    id: `agent-photo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: file.name || 'AI chat photo',
    type: dataUrl.startsWith('data:image/jpeg') ? 'image/jpeg' : file.type || 'image/jpeg',
    dataUrl,
    createdAt: new Date().toISOString(),
  };
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

function restoreConversation(): { id: string; input: string; messages: ChatMessage[] } {
  if (typeof window === 'undefined') return { id: makeId(), input: '', messages: [] };
  try {
    const stored = JSON.parse(sessionStorage.getItem(AI_COACH_SESSION_KEY) || '{}') as Record<string, unknown>;
    const id = typeof stored.id === 'string' && stored.id.trim() ? stored.id.slice(0, 100) : makeId();
    const input = typeof stored.input === 'string' ? stored.input.slice(0, 4000) : '';
    return { id, input, messages: normalizeAiChatMessages(stored.messages) };
  } catch {
    return { id: makeId(), input: '', messages: [] };
  }
}

function normalizeSessionSummary(value: unknown): AiChatSessionSummary | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const id = typeof raw.id === 'string' ? raw.id.slice(0, 100) : '';
  const createdAt = typeof raw.createdAt === 'string' && !Number.isNaN(Date.parse(raw.createdAt)) ? raw.createdAt : '';
  const updatedAt = typeof raw.updatedAt === 'string' && !Number.isNaN(Date.parse(raw.updatedAt)) ? raw.updatedAt : '';
  if (!id || !createdAt || !updatedAt) return null;
  return {
    id,
    title: typeof raw.title === 'string' ? raw.title.slice(0, 90) : 'Untitled conversation',
    preview: typeof raw.preview === 'string' ? raw.preview.slice(0, 180) : '',
    messageCount: Number.isFinite(Number(raw.messageCount)) ? Number(raw.messageCount) : 0,
    createdAt,
    updatedAt,
  };
}

function formatChatTimestamp(value: string) {
  const date = new Date(value);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (date.getFullYear() === now.getFullYear()) return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return date.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric', year: '2-digit' });
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
      <a
        key={index}
        href={`#ai-day-${segment.date}`}
        onClick={event => { event.preventDefault(); onPreview(summary); }}
        className="inline border-0 bg-transparent p-0 font-semibold text-[#476653] underline decoration-[#8EAA96] decoration-1 underline-offset-2"
        style={{ touchAction: 'manipulation' }}
        aria-label={`Show a quick summary for ${displayDate(segment.date)}`}
      >
        {label}
      </a>
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

function AgentPlanCard({ plan, selectedIds, busy, error, copyStatus, photo, onToggle, onApply, onNavigate, onChoosePhoto, onCopyJson }: {
  plan: PreviewedAgentPlan;
  selectedIds: string[];
  busy: boolean;
  error: string;
  copyStatus: string;
  photo?: AgentPhoto;
  onToggle: (actionId: string) => void;
  onApply: () => void;
  onNavigate: (action: Extract<AgentAction, { type: 'navigate' }>) => void;
  onChoosePhoto: () => void;
  onCopyJson: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const previewById = new Map(plan.previewItems.map(item => [item.actionId, item]));
  const visibleActions = showAll ? plan.actions : plan.actions.slice(0, 6);
  const writeActions = plan.actions.filter(isAgentWriteAction);
  const selectedCount = writeActions.filter(action => selectedIds.includes(action.id)).length;
  const selectedNeedsPhoto = writeActions.some(action => selectedIds.includes(action.id) && agentActionNeedsPhoto(action));
  const applied = Boolean(plan.appliedRunId && !plan.undoneAt);
  const undone = Boolean(plan.undoneAt);

  return (
    <div className="overflow-hidden rounded-lg border border-[#C7D6CB] bg-[#EEF2ED]">
      <div className="flex items-start justify-between gap-3 border-b border-[#D3DDD5] px-3 py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#DCE8DF] text-[#52705C]" aria-hidden="true">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><path d="M10 2.8l1.15 3.25L14.4 7.2l-3.25 1.15L10 11.6 8.85 8.35 5.6 7.2l3.25-1.15L10 2.8Z" /><path d="M15.2 12.1l.62 1.73 1.73.62-1.73.62-.62 1.73-.62-1.73-1.73-.62 1.73-.62.62-1.73Z" /></svg>
            </span>
            <p className="text-[10px] font-bold uppercase text-[#52705C]">Proposed app actions</p>
          </div>
          <p className="mt-1 text-sm font-semibold leading-snug text-stone-800">{plan.summary}</p>
        </div>
        <button type="button" onClick={onCopyJson} className="shrink-0 text-[10px] font-bold text-stone-400" title="Copy action-plan JSON">JSON</button>
      </div>

      <div className="divide-y divide-[#D8E0DA]">
        {visibleActions.map(action => {
          const preview = previewById.get(action.id);
          const navigation = action.type === 'navigate';
          const selected = selectedIds.includes(action.id);
          return (
            <div key={action.id} className="flex min-w-0 items-start gap-2.5 px-3 py-2.5">
              {navigation ? (
                <button type="button" onClick={() => onNavigate(action)} className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#BFCFC3] bg-[#F6F1E7] text-[#52705C]" aria-label={preview?.title || 'Open destination'}>
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><path d="M7 4h9v9M16 4 6 14" /><path d="M13 16H4V7" /></svg>
                </button>
              ) : (
                <input type="checkbox" checked={selected} disabled={applied || undone || busy} onChange={() => onToggle(action.id)} className="mt-1 h-4 w-4 shrink-0 accent-[#6F8C78]" aria-label={`Include ${preview?.title || action.type}`} />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="text-xs font-semibold leading-snug text-stone-700">{preview?.title || action.type.replaceAll('_', ' ')}</p>
                  {preview?.risk === 'destructive' && <span className="text-[8px] font-bold uppercase text-[#A85E53]">Overwrite/delete</span>}
                  {preview?.risk === 'bulk' && <span className="text-[8px] font-bold uppercase text-[#8B6B32]">Bulk</span>}
                </div>
                {preview?.detail && <p className="mt-0.5 break-words text-[10px] leading-snug text-stone-500">{preview.detail}</p>}
                {action.reason && <p className="mt-0.5 text-[9px] leading-snug text-stone-400">{action.reason}</p>}
              </div>
            </div>
          );
        })}
      </div>

      {plan.actions.length > 6 && (
        <button type="button" onClick={() => setShowAll(value => !value)} className="w-full border-t border-[#D8E0DA] py-2 text-[10px] font-bold text-[#64806D]">
          {showAll ? 'Show fewer' : `Show ${plan.actions.length - 6} more`}
        </button>
      )}

      {selectedNeedsPhoto && !applied && (
        <div className="border-t border-[#D3DDD5] px-3 py-2.5">
          <button type="button" onClick={onChoosePhoto} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#BFCFC3] bg-[#F6F1E7] py-2 text-xs font-bold text-[#52705C] disabled:opacity-50">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true"><rect x="2.5" y="3.5" width="15" height="13" rx="2" /><circle cx="7" cy="8" r="1.4" /><path d="m4.5 14 3.4-3 2.4 2 2.3-2.2 2.9 3.2" /></svg>
            {photo ? `Selected: ${photo.name}` : 'Choose photo'}
          </button>
        </div>
      )}

      {error && <p className="border-t border-red-100 bg-red-50 px-3 py-2 text-[11px] text-red-600">{error}</p>}
      {copyStatus && <p className="border-t border-[#D3DDD5] px-3 py-1.5 text-center text-[10px] font-semibold text-[#64806D]">{copyStatus}</p>}
      {writeActions.length > 0 && (
        <div className="flex items-center gap-2 border-t border-[#D3DDD5] px-3 py-2.5">
          {applied ? (
            <div className="flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#DCE8DF] text-xs font-bold text-[#52705C]">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true"><path d="m4 10 4 4 8-8" /></svg>
              Applied
            </div>
          ) : undone ? (
            <div className="flex min-h-9 flex-1 items-center justify-center rounded-lg bg-stone-200/70 text-xs font-bold text-stone-500">Undone</div>
          ) : (
            <button type="button" onClick={onApply} disabled={busy || selectedCount === 0} className="min-h-9 flex-1 rounded-lg bg-[#1F2F46] px-3 text-xs font-bold text-white disabled:opacity-40" style={{ touchAction: 'manipulation' }}>
              {busy ? 'Applying safely…' : `Apply ${selectedCount} selected`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function ExerciseAiCoachModal({ exercises, selectedDate, today, onClose, onOpenDate, appContext, onAgentApplied, onAgentNavigate }: Props) {
  const initialConversation = useMemo(() => restoreConversation(), []);
  const [conversationId, setConversationId] = useState(initialConversation.id);
  const [input, setInput] = useState(initialConversation.input);
  const [messages, setMessages] = useState<ChatMessage[]>(initialConversation.messages);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copyStatus, setCopyStatus] = useState<Record<string, string>>({});
  const [datePreview, setDatePreview] = useState<DateSummary | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [chatSessions, setChatSessions] = useState<AiChatSessionSummary[]>([]);
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [historySaveError, setHistorySaveError] = useState(false);
  const [openingChatId, setOpeningChatId] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState('');
  const [agentSelections, setAgentSelections] = useState<Record<string, string[]>>({});
  const [agentBusyMessageId, setAgentBusyMessageId] = useState('');
  const [agentErrors, setAgentErrors] = useState<Record<string, string>>({});
  const [agentPhotos, setAgentPhotos] = useState<Record<string, AgentPhoto>>({});
  const [photoTargetMessageId, setPhotoTargetMessageId] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const historyLoadedRef = useRef(false);
  const historyRequestRef = useRef(false);
  const chatSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const agentPhotoInputRef = useRef<HTMLInputElement>(null);

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

  const persistConversation = (nextInput = input, nextMessages = messages, nextId = conversationId) => {
    try {
      sessionStorage.setItem(AI_COACH_ACTIVE_KEY, '1');
      sessionStorage.setItem(AI_COACH_SESSION_KEY, JSON.stringify({ id: nextId, input: nextInput, messages: normalizeAiChatMessages(nextMessages) }));
    } catch {}
  };

  const mergeChatSummary = (summary: AiChatSessionSummary) => {
    setChatSessions(previous => [summary, ...previous.filter(item => item.id !== summary.id)]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id)));
  };

  const writeChatSession = async (id: string, nextMessages: ChatMessage[]) => {
    const normalized = normalizeAiChatMessages(nextMessages);
    if (!normalized.length) return;
    try {
      const response = await fetch('/api/ai-chat-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, messages: normalized }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error('Could not save chat');
      const summary = normalizeSessionSummary(data.session);
      if (summary) mergeChatSummary(summary);
      setHistorySaveError(false);
    } catch {
      setHistorySaveError(true);
    }
  };

  const saveChatSession = (id: string, nextMessages: ChatMessage[]) => {
    chatSaveQueueRef.current = chatSaveQueueRef.current.then(() => writeChatSession(id, nextMessages));
    return chatSaveQueueRef.current;
  };

  const loadChatHistory = async (reset = false) => {
    if (historyRequestRef.current) return;
    historyRequestRef.current = true;
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const cursor = reset ? '' : historyCursor ?? '';
      const params = new URLSearchParams({ limit: '30' });
      if (cursor) params.set('cursor', cursor);
      const response = await fetch(`/api/ai-chat-sessions?${params}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error('Could not load chat history');
      const rawSessions: unknown[] = Array.isArray(data.sessions) ? data.sessions : [];
      const incoming: AiChatSessionSummary[] = rawSessions
        .map(item => normalizeSessionSummary(item))
        .filter((item): item is AiChatSessionSummary => Boolean(item));
      setChatSessions(previous => {
        const combined = reset ? incoming : [...previous, ...incoming];
        const sessionsById = new Map<string, AiChatSessionSummary>();
        for (const session of combined) sessionsById.set(session.id, session);
        return Array.from(sessionsById.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id));
      });
      setHistoryCursor(typeof data.nextCursor === 'string' ? data.nextCursor : null);
      historyLoadedRef.current = true;
    } catch {
      setHistoryError('Chat history could not be loaded.');
    } finally {
      historyRequestRef.current = false;
      setHistoryLoading(false);
    }
  };

  const showChatHistory = () => {
    setHistoryOpen(true);
    setPendingDeleteId('');
    if (!historyLoadedRef.current) void chatSaveQueueRef.current.then(() => loadChatHistory(true));
  };

  const startNewConversation = () => {
    const nextId = makeId();
    setConversationId(nextId);
    setMessages([]);
    setInput('');
    setError('');
    setDatePreview(null);
    setHistoryOpen(false);
    setPendingDeleteId('');
    setAgentSelections({});
    setAgentErrors({});
    setAgentPhotos({});
    persistConversation('', [], nextId);
  };

  const openSavedConversation = async (session: AiChatSessionSummary) => {
    if (openingChatId) return;
    if (session.id === conversationId && messages.length) {
      setHistoryOpen(false);
      return;
    }
    setOpeningChatId(session.id);
    setHistoryError('');
    try {
      const response = await fetch(`/api/ai-chat-sessions?id=${encodeURIComponent(session.id)}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error('Could not open chat');
      const restored = normalizeAiChatMessages(data.session?.messages);
      if (!restored.length) throw new Error('Chat is empty');
      setConversationId(session.id);
      setMessages(restored);
      setInput('');
      setError('');
      setAgentSelections({});
      setAgentErrors({});
      setAgentPhotos({});
      setHistoryOpen(false);
      persistConversation('', restored, session.id);
    } catch {
      setHistoryError('That conversation could not be opened.');
    } finally {
      setOpeningChatId('');
    }
  };

  const deleteSavedConversation = async (id: string) => {
    setHistoryError('');
    try {
      const response = await fetch(`/api/ai-chat-sessions?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Could not delete chat');
      setChatSessions(previous => previous.filter(session => session.id !== id));
      setPendingDeleteId('');
    } catch {
      setHistoryError('That conversation could not be deleted.');
    }
  };

  useEffect(() => {
    try { sessionStorage.setItem(AI_COACH_ACTIVE_KEY, '1'); } catch {}
  }, []);

  useEffect(() => {
    persistConversation(input, messages);
    // Draft text is saved immediately before date navigation; avoid synchronous storage work on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, messages]);

  useEffect(() => {
    const handleAgentUndone = (event: Event) => {
      const runId = String((event as CustomEvent<{ runId?: string }>).detail?.runId ?? '');
      if (!runId) return;
      let matched = false;
      const nextMessages = normalizeAiChatMessages(messages.map(message => {
        if (message.reply?.agentPlan?.appliedRunId !== runId) return message;
        matched = true;
        return { ...message, reply: { ...message.reply, agentPlan: { ...message.reply.agentPlan, undoneAt: new Date().toISOString() } } };
      }));
      if (!matched) return;
      setMessages(nextMessages);
      persistConversation(input, nextMessages);
      void saveChatSession(conversationId, nextMessages);
    };
    window.addEventListener('pt-ai-agent-undone', handleAgentUndone);
    return () => window.removeEventListener('pt-ai-agent-undone', handleAgentUndone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, input, messages]);

  useEffect(() => {
    const fn = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (datePreview) setDatePreview(null);
      else if (historyOpen) setHistoryOpen(false);
      else closeModal();
    };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datePreview, historyOpen, onClose]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading, error]);

  const apiHistory = useMemo(() => historyForApi(messages), [messages]);

  const previewAgentPlan = async (value: unknown): Promise<PreviewedAgentPlan | undefined> => {
    const plan = normalizeAgentPlan(value);
    if (!plan) return undefined;
    const response = await fetch('/api/ai-agent/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary: plan.summary, actions: plan.actions }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'The proposed changes could not be prepared.');
    return data.plan as PreviewedAgentPlan;
  };

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
          appContext,
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

      let agentPlan: PreviewedAgentPlan | undefined;
      let agentPlanError = '';
      let agentPlanningStatus: AiReply['agentPlanningStatus'] = data.reply?.agentPlanningStatus;
      if (data.reply?.agentPlan) {
        try {
          agentPlan = await previewAgentPlan(data.reply.agentPlan);
        } catch (planError) {
          agentPlanError = planError instanceof Error ? planError.message : 'The proposed changes could not be prepared.';
          agentPlanningStatus = 'invalid';
        }
      }

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
        comparedDays: Number.isFinite(Number(data.comparedDays)) && Number(data.comparedDays) > 0 ? Number(data.comparedDays) : undefined,
        rerankerModel: typeof data.rerankerModel === 'string' ? data.rerankerModel : undefined,
        rerankedCandidates: Number.isFinite(Number(data.rerankedCandidates)) ? Number(data.rerankedCandidates) : undefined,
        degraded: data.degraded === true,
        agentPlan,
        agentPlanningStatus,
      };

      const assistantMessage: ChatMessage = {
        id: makeId(),
        role: 'assistant',
        content: reply.answer,
        reply,
      };
      const completedMessages = normalizeAiChatMessages([...messages, userMessage, assistantMessage]);
      setMessages(completedMessages);
      if (agentPlan) {
        setAgentSelections(previous => ({ ...previous, [assistantMessage.id]: agentPlan.actions.filter(isAgentWriteAction).map(action => action.id) }));
      }
      if (agentPlanError) setAgentErrors(previous => ({ ...previous, [assistantMessage.id]: agentPlanError }));
      void saveChatSession(conversationId, completedMessages);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ask AI failed');
      void saveChatSession(conversationId, [...messages, userMessage]);
    } finally {
      setLoading(false);
      window.setTimeout(() => composerRef.current?.querySelector<HTMLElement>('[role="textbox"]')?.focus(), 100);
    }
  };

  const openDate = (date: string) => {
    persistConversation();
    try { sessionStorage.removeItem(AI_COACH_ACTIVE_KEY); } catch {}
    onOpenDate(date);
  };

  const selectedAgentActionIds = (message: ChatMessage, plan: PreviewedAgentPlan) =>
    plan.appliedActionIds ?? agentSelections[message.id] ?? plan.actions.filter(isAgentWriteAction).map(action => action.id);

  const toggleAgentAction = (message: ChatMessage, plan: PreviewedAgentPlan, actionId: string) => {
    setAgentSelections(previous => {
      const selected = previous[message.id] ?? plan.actions.filter(isAgentWriteAction).map(action => action.id);
      return { ...previous, [message.id]: selected.includes(actionId) ? selected.filter(id => id !== actionId) : [...selected, actionId] };
    });
  };

  const chooseAgentPhoto = (messageId: string) => {
    setPhotoTargetMessageId(messageId);
    agentPhotoInputRef.current?.click();
  };

  const handleAgentPhoto = async (file: File | undefined) => {
    const messageId = photoTargetMessageId;
    if (!file || !messageId) return;
    setAgentErrors(previous => ({ ...previous, [messageId]: '' }));
    try {
      const photo = await prepareAgentPhoto(file);
      if (photo.dataUrl.length > 2_000_000) throw new Error('That photo is still too large after compression. Choose a smaller image.');
      setAgentPhotos(previous => ({ ...previous, [messageId]: photo }));
    } catch (photoError) {
      setAgentErrors(previous => ({ ...previous, [messageId]: photoError instanceof Error ? photoError.message : 'Could not prepare that photo.' }));
    } finally {
      setPhotoTargetMessageId('');
      if (agentPhotoInputRef.current) agentPhotoInputRef.current.value = '';
    }
  };

  const applyAgentPlan = async (message: ChatMessage, plan: PreviewedAgentPlan) => {
    if (agentBusyMessageId || plan.appliedRunId) return;
    const selectedIds = new Set(selectedAgentActionIds(message, plan));
    const selectedActions = plan.actions.filter(action => isAgentWriteAction(action) && selectedIds.has(action.id));
    if (!selectedActions.length) {
      setAgentErrors(previous => ({ ...previous, [message.id]: 'Select at least one change.' }));
      return;
    }
    const needsPhoto = selectedActions.some(agentActionNeedsPhoto);
    if (needsPhoto && !agentPhotos[message.id]) {
      setAgentErrors(previous => ({ ...previous, [message.id]: 'Choose the photo to attach before applying.' }));
      return;
    }
    setAgentBusyMessageId(message.id);
    setAgentErrors(previous => ({ ...previous, [message.id]: '' }));
    try {
      const requestId = `${conversationId.slice(-40)}-${message.id.slice(-40)}`.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 100);
      const response = await fetch('/api/ai-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId,
          label: plan.summary,
          actions: selectedActions,
          attachment: needsPhoto ? agentPhotos[message.id] : undefined,
          chatSessionId: conversationId,
          chatMessageId: message.id,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'The changes could not be applied.');
      const appliedAt = new Date().toISOString();
      const nextMessages = normalizeAiChatMessages(messages.map(item => item.id === message.id && item.reply?.agentPlan ? {
        ...item,
        reply: { ...item.reply, agentPlan: { ...item.reply.agentPlan, appliedRunId: String(data.runId), appliedAt, appliedActionIds: selectedActions.map(action => action.id) } },
      } : item));
      setMessages(nextMessages);
      persistConversation(input, nextMessages);
      await saveChatSession(conversationId, nextMessages);
      setAgentPhotos(previous => {
        const next = { ...previous };
        delete next[message.id];
        return next;
      });
      onAgentApplied({
        runId: String(data.runId),
        label: String(data.label || plan.summary),
        affectedDates: Array.isArray(data.affectedDates) ? data.affectedDates.map(String) : [],
        changedConfig: data.changedConfig && typeof data.changedConfig === 'object' ? data.changedConfig : {},
      });
    } catch (applyError) {
      setAgentErrors(previous => ({ ...previous, [message.id]: applyError instanceof Error ? applyError.message : 'The changes could not be applied.' }));
    } finally {
      setAgentBusyMessageId('');
    }
  };

  const copyAgentPlan = async (messageId: string, plan: PreviewedAgentPlan) => {
    try {
      await copyValue(JSON.stringify({ version: plan.version, summary: plan.summary, actions: plan.actions }, null, 2));
      setCopyStatus(previous => ({ ...previous, [messageId]: 'Plan JSON copied ✓' }));
    } catch {
      setCopyStatus(previous => ({ ...previous, [messageId]: 'Copy failed' }));
    }
    window.setTimeout(() => setCopyStatus(previous => ({ ...previous, [messageId]: '' })), 1600);
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
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm px-3 py-4"
      onPointerDown={event => {
        if (isDirectBackdropInteraction(event.target, event.currentTarget)) closeModal();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-coach-title"
        className="w-full max-w-lg overflow-hidden rounded-3xl bg-[#F6F1E7] shadow-2xl border border-white/50 flex flex-col"
        style={{ maxHeight: '94dvh' }}
        onPointerDown={event => event.stopPropagation()}
      >
        <div className="px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">PT Motivator assistant</p>
              <h2 id="ai-coach-title" className="font-serif text-xl font-semibold text-stone-800">Ask anything</h2>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => historyOpen ? setHistoryOpen(false) : showChatHistory()}
                className="flex h-9 w-9 items-center justify-center rounded-full border"
                style={{ background: historyOpen ? '#EAF2F5' : '#fff', borderColor: historyOpen ? '#C6DCE9' : '#f5f5f4', color: historyOpen ? '#648399' : '#78716c', touchAction: 'manipulation' }}
                title={historyOpen ? 'Back to conversation' : 'Chat history'}
                aria-label={historyOpen ? 'Back to conversation' : 'Chat history'}
              >
                {historyOpen ? (
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true"><path d="M16 10H4M9 5l-5 5 5 5" /></svg>
                ) : (
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true"><path d="M4.2 6.1A7 7 0 1 1 3 10" /><path d="M3 3.5v4h4" /><path d="M10 6.5V10l2.5 1.5" /></svg>
                )}
              </button>
              {!historyOpen && messages.length > 0 && (
                <button type="button" onClick={startNewConversation} className="rounded-lg bg-white border border-stone-100 px-2.5 py-2 text-[10px] font-bold text-stone-400">Clear</button>
              )}
              <button type="button" onClick={closeModal} className="w-9 h-9 rounded-full bg-white hover:bg-stone-100 border border-stone-100 flex items-center justify-center text-stone-500 text-xl" aria-label="Close Ask AI">×</button>
            </div>
          </div>
          <p className="mt-2 w-full text-xs leading-snug text-stone-500">Ask about any saved day, find when something happened, compare patterns, identify a movement, construct an exercise, or keep asking follow-ups.</p>
        </div>

        {historyOpen ? (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-stone-200/70 bg-[#F2EEE6]" style={{ height: 'min(34rem, calc(94dvh - 9rem))' }}>
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-stone-200/70 bg-[#F6F1E7]/95 px-5 py-3 backdrop-blur">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-stone-800">Chat history</h3>
              </div>
              <button type="button" onClick={startNewConversation} disabled={Boolean(openingChatId)} className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-[#C6DCE9] bg-[#F3F8FA] px-2.5 text-[11px] font-bold text-[#648399] disabled:opacity-50" style={{ touchAction: 'manipulation' }}>
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-3.5 w-3.5" aria-hidden="true"><path d="M10 4v12M4 10h12" /></svg>
                New
              </button>
            </div>

            {historyError && (
              <div className="mx-4 mt-3 flex items-center justify-between gap-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2">
                <p className="text-xs text-red-600">{historyError}</p>
                <button type="button" onClick={() => void loadChatHistory(true)} className="text-[11px] font-bold text-red-600">Retry</button>
              </div>
            )}

            {!chatSessions.length && historyLoading && <p className="px-5 py-10 text-center text-xs text-stone-400">Loading conversations...</p>}
            {!chatSessions.length && !historyLoading && !historyError && (
              <div className="px-6 py-12 text-center">
                <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full border border-[#C6DCE9] bg-[#F3F8FA] text-[#648399]">
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true"><path d="M4.2 6.1A7 7 0 1 1 3 10" /><path d="M3 3.5v4h4" /><path d="M10 6.5V10l2.5 1.5" /></svg>
                </div>
                <p className="mt-3 text-sm font-semibold text-stone-600">No saved conversations yet</p>
              </div>
            )}

            <div className="space-y-2.5 px-3 pb-4 pt-3">
              {chatSessions.map(session => {
                const isCurrent = session.id === conversationId;
                const awaitingDelete = pendingDeleteId === session.id;
                return (
                  <div key={session.id} className={`flex items-stretch overflow-hidden rounded-2xl border shadow-[0_1px_2px_rgba(71,59,43,0.04)] transition-colors ${isCurrent ? 'border-[#C8D8CC] bg-[#E9F0EB]' : 'border-stone-200/80 bg-white/75 hover:border-stone-300 hover:bg-white'}`}>
                    <button type="button" onClick={() => void openSavedConversation(session)} disabled={Boolean(openingChatId)} className="min-w-0 flex-1 px-4 py-3.5 text-left disabled:opacity-60" style={{ touchAction: 'manipulation' }}>
                      <div className="flex items-start justify-between gap-3">
                        <p className="min-w-0 truncate text-sm font-semibold text-stone-800">{session.title || 'Untitled conversation'}</p>
                        <span className="shrink-0 text-[10px] font-medium text-stone-400">{openingChatId === session.id ? 'Opening...' : formatChatTimestamp(session.updatedAt)}</span>
                      </div>
                      {session.preview && <p className="mt-1 line-clamp-2 text-xs leading-snug text-stone-500">{session.preview}</p>}
                      <div className="mt-1.5 flex items-center gap-2 text-[9px] font-semibold uppercase text-stone-400">
                        <span>{session.messageCount} message{session.messageCount === 1 ? '' : 's'}</span>
                        {isCurrent && <span className="text-[#648399]">Current</span>}
                      </div>
                    </button>
                    {!isCurrent && (
                      <button
                        type="button"
                        onClick={() => awaitingDelete ? void deleteSavedConversation(session.id) : setPendingDeleteId(session.id)}
                        onBlur={() => { if (awaitingDelete) setPendingDeleteId(''); }}
                        className={`flex w-14 shrink-0 items-center justify-center border-l border-stone-200/70 text-[10px] font-bold transition-colors ${awaitingDelete ? 'bg-red-50 text-red-600' : 'text-stone-300 hover:bg-stone-50 hover:text-stone-500'}`}
                        style={{ touchAction: 'manipulation' }}
                        aria-label={awaitingDelete ? `Confirm delete ${session.title}` : `Delete ${session.title}`}
                      >
                        {awaitingDelete ? 'Delete?' : (
                          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true"><path d="M4 6h12M8 3h4l1 3H7l1-3ZM6 6l.7 11h6.6L14 6M8.5 9v5M11.5 9v5" /></svg>
                        )}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {historyCursor && (
              <div className="px-4 pb-5 pt-1 text-center">
                <button type="button" onClick={() => void loadChatHistory(false)} disabled={historyLoading} className="rounded-lg border border-stone-200 bg-white px-4 py-2 text-xs font-semibold text-stone-500 disabled:opacity-50" style={{ touchAction: 'manipulation' }}>
                  {historyLoading ? 'Loading...' : 'Load older'}
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
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
                      {reply?.comparedDays ? <span>Compared all {reply.comparedDays} saved days</span> : reply?.searchedDays ? <span>Searched {reply.searchedDays} saved days</span> : null}
                      {reply?.rerankerModel && !reply?.comparedDays ? <span>{reply.rerankerModel.includes('scout') ? 'Scout' : 'AI'} ranked {reply.rerankedCandidates ?? 0} candidates</span> : null}
                      {reply?.model ? <span>{reply.degraded ? 'Fallback result' : reply.model}</span> : null}
                    </div>
                  )}
                </div>

                {reply?.agentPlan && (
                  <AgentPlanCard
                    plan={reply.agentPlan}
                    selectedIds={selectedAgentActionIds(message, reply.agentPlan)}
                    busy={agentBusyMessageId === message.id}
                    error={agentErrors[message.id] || ''}
                    copyStatus={copyStatus[message.id] || ''}
                    photo={agentPhotos[message.id]}
                    onToggle={actionId => toggleAgentAction(message, reply.agentPlan!, actionId)}
                    onApply={() => void applyAgentPlan(message, reply.agentPlan!)}
                    onNavigate={action => {
                      persistConversation();
                      onAgentNavigate(action);
                    }}
                    onChoosePhoto={() => chooseAgentPhoto(message.id)}
                    onCopyJson={() => void copyAgentPlan(message.id, reply.agentPlan!)}
                  />
                )}

                {!reply?.agentPlan && agentErrors[message.id] && (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">{agentErrors[message.id]}</p>
                )}

                {!reply?.agentPlan && !agentErrors[message.id] && (reply?.agentPlanningStatus === 'missing' || reply?.agentPlanningStatus === 'invalid') && (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    Agent mode recognized this as a command, but no safe action plan was produced. Specify the exact item, date, and change so it can prepare an Apply card.
                  </p>
                )}

                {!!reply?.dateLinks?.length && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Tap to open the day</p>
                    {reply.dateLinks.map(link => (
                      <button key={`${message.id}-${link.date}`} onClick={() => openDate(link.date)} className="w-full rounded-2xl border border-[#D3DDD5] bg-[#EEF2ED] px-3 py-3 text-left transition hover:border-[#BFCFC3] hover:bg-[#E9EFEA]" style={{ touchAction: 'manipulation' }}>
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
                  <div className="rounded-2xl border border-[#D3DDD5] bg-[#EEF2ED] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[#7E9B86]">App-ready exercise draft</p>
                        <h3 className="font-serif text-lg font-semibold text-stone-800 mt-1">{reply.confirmedExercise.name}</h3>
                      </div>
                      {reply.confirmedExercise.confidence && <span className="rounded-full bg-[#F6F1E7] px-2 py-1 text-[9px] font-bold uppercase text-stone-400">{reply.confirmedExercise.confidence}</span>}
                    </div>
                    {reply.confirmedExercise.cat && <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-stone-400">{reply.confirmedExercise.cat}</p>}
                    {reply.confirmedExercise.cue && <p className="text-sm text-stone-600 mt-2 leading-snug">{reply.confirmedExercise.cue}</p>}
                    {reply.confirmedExercise.sets && <p className="text-xs font-semibold text-stone-500 mt-2">{reply.confirmedExercise.sets}</p>}
                    {!!reply.confirmedExercise.tips?.length && (
                      <ul className="mt-2 space-y-1">
                        {reply.confirmedExercise.tips.slice(0, 6).map((tip, index) => <li key={index} className="text-xs text-stone-600 leading-snug">• {tip}</li>)}
                      </ul>
                    )}
                    {reply.confirmedExercise.nextStep && <p className="mt-2 rounded-xl bg-[#F6F1E7] px-2.5 py-2 text-xs text-stone-500"><span className="font-semibold">Next:</span> {reply.confirmedExercise.nextStep}</p>}
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button onClick={() => void copyDraft(message.id, reply.confirmedExercise!, 'text')} className="py-2.5 rounded-xl text-xs font-bold" style={{ background: '#E4ECE6', color: '#476653', touchAction: 'manipulation' }}>Copy description</button>
                      <button onClick={() => void copyDraft(message.id, reply.confirmedExercise!, 'json')} className="py-2.5 rounded-xl border border-stone-200 bg-[#F6F1E7] text-xs font-bold text-stone-600" style={{ touchAction: 'manipulation' }}>Copy JSON</button>
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
          <input ref={agentPhotoInputRef} type="file" accept="image/*" className="hidden" onChange={event => void handleAgentPhoto(event.target.files?.[0])} />
          <SecretTextarea
            value={input}
            onChange={setInput}
            placeholder="Ask about a past day, a symptom pattern, an exercise, or follow up on the answer…"
            rows={2}
            className="ai-coach-composer-editor w-full text-sm border border-stone-200 rounded-lg px-3 py-2 focus:outline-none resize-y bg-white"
            style={{ fontSize: 16, colorScheme: 'light' }}
          />
          <button type="button" onClick={() => void ask(input)} disabled={loading || !stripSecretNotes(input).trim()} className="mt-2 w-full py-3 rounded-lg text-sm font-bold text-white disabled:opacity-40" style={{ background: '#1F2F46', touchAction: 'manipulation' }}>
            {loading ? 'Thinking…' : messages.length ? 'Send follow-up' : 'Ask AI'}
          </button>
          {historySaveError && <p className="mt-2 text-center text-[10px] font-semibold text-red-500">The answer is here, but chat history could not save.</p>}
          <p className="mt-2 text-center text-[10px] leading-snug text-stone-400">It can use your saved logs, but its health interpretations are not a diagnosis.</p>
        </div>
          </>
        )}
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
