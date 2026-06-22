'use client';

import { useEffect, useRef, useState } from 'react';
import { Exercise } from '@/lib/exercises';

type AiReply = {
  answer: string;
  options: string[];
  confirmedExercise?: Partial<Exercise> & { confidence?: string; nextStep?: string };
};

interface Props {
  exercises: Exercise[];
  onClose: () => void;
}

const STARTERS = [
  'Do you know which ankle band exercise I mean?',
  'Help me identify a calf/ankle mobility drill',
  'Is this more balance, strength, or mobility?',
  'I want to add a variation my PT showed me',
];

function trimHistory(history: { role: 'user' | 'assistant'; content: string }[]) {
  return history.slice(-8);
}

export default function ExerciseAiCoachModal({ exercises, onClose }: Props) {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [reply, setReply] = useState<AiReply | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', fn);
    inputRef.current?.focus();
    return () => document.removeEventListener('keydown', fn);
  }, [onClose]);

  const ask = async (text: string) => {
    const clean = text.trim();
    if (!clean || loading) return;
    setLoading(true);
    setError('');
    setInput('');
    const nextHistory = trimHistory([...history, { role: 'user', content: clean }]);
    setHistory(nextHistory);

    try {
      const res = await fetch('/api/ai-exercise-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: clean,
          history: nextHistory,
          exercises: exercises.map(ex => ({ id: ex.id, name: ex.name, cat: ex.cat, cue: ex.cue, sets: ex.sets, tips: ex.tips?.slice(0, 5) })).slice(0, 80),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI coach failed');
      const nextReply: AiReply = data.reply;
      setReply(nextReply);
      setHistory(trimHistory([...nextHistory, { role: 'assistant', content: nextReply.answer }]));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI coach failed');
    } finally {
      setLoading(false);
    }
  };

  const draftText = reply?.confirmedExercise
    ? [
        reply.confirmedExercise.name,
        reply.confirmedExercise.cue,
        reply.confirmedExercise.sets,
        ...(reply.confirmedExercise.tips ?? []),
      ].filter(Boolean).join('\n')
    : '';

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm px-3 py-6" onClick={onClose}>
      <div className="w-full max-w-lg rounded-3xl bg-[#F6F1E7] shadow-2xl border border-white/50 flex flex-col" style={{ maxHeight: '88dvh' }} onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-stone-200 flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">AI exercise identifier</p>
            <h2 className="font-serif text-xl font-semibold text-stone-800">Ask about an exercise</h2>
            <p className="text-xs text-stone-500 mt-1 leading-snug">Built for ankle PT: it asks clarifying questions until the exact variation is clear, then gives a clean draft you can use to edit or add an exercise.</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white hover:bg-stone-100 border border-stone-100 flex items-center justify-center text-stone-500 text-xl flex-shrink-0">×</button>
        </div>

        <div className="overflow-y-auto px-5 py-4 flex-1 space-y-3">
          {!history.length && <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{STARTERS.map(item => <button key={item} onClick={() => ask(item)} className="text-left text-xs font-semibold leading-snug rounded-2xl bg-white border border-stone-100 px-3 py-3 text-stone-600 hover:bg-stone-50" style={{ touchAction: 'manipulation' }}>{item}</button>)}</div>}
          {history.map((msg, idx) => <div key={idx} className={`rounded-2xl px-3 py-2.5 text-sm leading-snug ${msg.role === 'user' ? 'ml-8 bg-[#1F2F46] text-white' : 'mr-8 bg-white border border-stone-100 text-stone-700'}`}>{msg.content}</div>)}
          {loading && <div className="mr-8 rounded-2xl bg-white border border-stone-100 px-3 py-2.5 text-sm text-stone-500">Thinking like a PT…</div>}
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>}

          {!!reply?.options?.length && <div className="space-y-2"><p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Tap one</p>{reply.options.slice(0, 5).map(option => <button key={option} onClick={() => ask(option)} className="w-full text-left text-sm font-semibold rounded-2xl bg-white border border-stone-100 px-3 py-3 text-stone-700 hover:bg-[#FDF8EE]" style={{ touchAction: 'manipulation' }}>{option}</button>)}</div>}

          {reply?.confirmedExercise && <div className="rounded-2xl border border-[#E4ECE6] bg-[#F8FBF8] p-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#7E9B86]">Possible exercise draft</p>
            <h3 className="font-serif text-lg font-semibold text-stone-800 mt-1">{reply.confirmedExercise.name}</h3>
            <p className="text-sm text-stone-600 mt-1 leading-snug">{reply.confirmedExercise.cue}</p>
            {reply.confirmedExercise.sets && <p className="text-xs font-semibold text-stone-500 mt-2">{reply.confirmedExercise.sets}</p>}
            {!!reply.confirmedExercise.tips?.length && <ul className="mt-2 space-y-1">{reply.confirmedExercise.tips.slice(0, 5).map((tip, idx) => <li key={idx} className="text-xs text-stone-600 leading-snug">• {tip}</li>)}</ul>}
            <button onClick={() => navigator.clipboard?.writeText(draftText)} className="mt-3 w-full py-2.5 rounded-xl text-xs font-bold" style={{ background: '#E4ECE6', color: '#476653', touchAction: 'manipulation' }}>Copy draft for edit/add</button>
          </div>}
        </div>

        <div className="px-5 py-4 border-t border-stone-200">
          <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask(input); } }} placeholder="Ask: do you know much about the ankle band thing where it pulls sideways?" rows={2} className="w-full text-sm border border-stone-200 rounded-2xl px-3 py-3 focus:outline-none resize-none bg-white" style={{ fontSize: 16, colorScheme: 'light' }} />
          <button onClick={() => ask(input)} disabled={loading || !input.trim()} className="mt-2 w-full py-3 rounded-2xl text-sm font-bold text-white disabled:opacity-40" style={{ background: '#1F2F46', touchAction: 'manipulation' }}>{loading ? 'Asking…' : 'Ask AI'}</button>
        </div>
      </div>
    </div>
  );
}
