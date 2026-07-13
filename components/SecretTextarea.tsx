'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { SECRET_UNLOCK_CODE, SecretNoteBlock, parseSecretNote, serializeSecretNote } from '@/lib/secretNotes';

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  style?: React.CSSProperties;
  autoFocus?: boolean;
  onFocus?: (event: React.FocusEvent<HTMLTextAreaElement>) => void;
  onBlur?: (event: React.FocusEvent<HTMLTextAreaElement>) => void;
};

function LockIcon({ locked }: { locked: boolean }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4.5" y="8.5" width="11" height="8" rx="2" />
      {locked ? <path d="M7 8.5V6.7a3 3 0 0 1 6 0v1.8" /> : <path d="M7 8.5V6.7a3 3 0 0 1 5.3-1.9" />}
    </svg>
  );
}

function normalizeBlocks(blocks: SecretNoteBlock[]) {
  return blocks.length ? blocks : [{ type: 'text', text: '' } satisfies SecretNoteBlock];
}

export default function SecretTextarea({ value, onChange, placeholder, rows = 2, className = '', style, autoFocus, onFocus, onBlur }: Props) {
  const blocks = useMemo(() => normalizeBlocks(parseSecretNote(value)), [value]);
  const [unlockingIndex, setUnlockingIndex] = useState<number | null>(null);
  const [unlockCode, setUnlockCode] = useState('');
  const [heightPx, setHeightPx] = useState<number | null>(null);
  const pendingSecretIndex = useRef<number | null>(null);
  const secretRefs = useRef<Record<number, HTMLTextAreaElement | null>>({});
  const editorRef = useRef<HTMLDivElement | null>(null);
  const resizeRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const canResize = /\bresize-y\b/.test(className);

  useEffect(() => {
    const index = pendingSecretIndex.current;
    if (index === null) return;
    pendingSecretIndex.current = null;
    window.setTimeout(() => secretRefs.current[index]?.focus(), 0);
  }, [blocks]);

  const commit = (next: SecretNoteBlock[]) => onChange(serializeSecretNote(next));

  const patchBlock = (index: number, patch: Partial<SecretNoteBlock>) => {
    commit(blocks.map((block, i) => i === index ? ({ ...block, ...patch } as SecretNoteBlock) : block));
  };

  const convertSecretLine = (index: number, text: string, selectionStart: number) => {
    const lineStart = text.lastIndexOf('\n', Math.max(0, selectionStart - 1)) + 1;
    const lineEndIndex = text.indexOf('\n', selectionStart);
    const lineEnd = lineEndIndex === -1 ? text.length : lineEndIndex;
    const line = text.slice(lineStart, lineEnd);
    const trigger = line.match(/^\/secret\s(.*)$/);
    if (!trigger) return false;

    const before = text.slice(0, lineStart);
    const after = text.slice(lineEnd);
    const secretIndex = index + (before ? 1 : 0);
    pendingSecretIndex.current = secretIndex;
    const replacement: SecretNoteBlock[] = [];
    if (before) replacement.push({ type: 'text', text: before });
    replacement.push({ type: 'secret', locked: false, text: trigger[1] ?? '' });
    if (after) replacement.push({ type: 'text', text: after });
    commit(blocks.flatMap((block, i) => i === index ? replacement : [block]));
    return true;
  };

  const handleTextChange = (index: number, event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextText = event.target.value;
    if (convertSecretLine(index, nextText, event.target.selectionStart ?? nextText.length)) return;
    patchBlock(index, { text: nextText });
  };

  const handleSecretKeyDown = (index: number, event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.altKey || event.metaKey || event.ctrlKey) return;
    event.preventDefault();
    patchBlock(index, { locked: true });
  };

  const toggleSecret = (index: number, block: Extract<SecretNoteBlock, { type: 'secret' }>) => {
    if (!block.locked) {
      setUnlockingIndex(null);
      setUnlockCode('');
      patchBlock(index, { locked: true });
      return;
    }
    setUnlockingIndex(index);
    setUnlockCode('');
  };

  const submitUnlock = (index: number) => {
    if (unlockCode === SECRET_UNLOCK_CODE) {
      pendingSecretIndex.current = index;
      setUnlockingIndex(null);
      setUnlockCode('');
      patchBlock(index, { locked: false });
    }
  };

  const removeBlock = (index: number) => {
    const next = blocks.filter((_, i) => i !== index);
    setUnlockingIndex(null);
    setUnlockCode('');
    commit(next.length ? next : [{ type: 'text', text: '' }]);
  };

  const textAreaStyle: React.CSSProperties = {
    color: 'inherit',
    fontSize: 'inherit',
    fontFamily: 'inherit',
    colorScheme: style?.colorScheme,
  };

  const startResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    const editor = editorRef.current;
    if (!editor) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeRef.current = { startY: event.clientY, startHeight: editor.getBoundingClientRect().height };
  };

  const moveResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    const active = resizeRef.current;
    if (!active) return;
    const next = Math.max(64, Math.min(640, active.startHeight + event.clientY - active.startY));
    setHeightPx(next);
  };

  const endResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    resizeRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {}
  };

  return (
    <div
      ref={editorRef}
      className={`${className} secret-note-editor relative overflow-auto ${canResize ? 'pr-7' : ''}`}
      style={{ ...style, minHeight: style?.minHeight ?? `${Math.max(rows, 1) * 1.55 + 1.4}rem`, height: heightPx ?? style?.height }}
    >
      {blocks.map((block, index) => block.type === 'secret' ? (
        <div key={index} className="my-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => toggleSecret(index, block)}
              className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide transition-colors"
              style={{
                background: block.locked ? '#1F2F46' : '#E4ECE6',
                borderColor: block.locked ? '#162233' : '#cfded3',
                color: block.locked ? '#ffffff' : '#476653',
                touchAction: 'manipulation',
              }}
              title={block.locked ? 'Unlock secret note' : 'Lock secret note'}
            >
              <LockIcon locked={block.locked} />
              Secret
            </button>
            <button
              type="button"
              onClick={() => removeBlock(index)}
              className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-stone-100 text-sm font-bold leading-none text-stone-400 hover:bg-stone-200 hover:text-stone-600"
              style={{ touchAction: 'manipulation' }}
              aria-label="Remove secret note"
              title="Remove secret note"
            >
              x
            </button>
          </div>
          {block.locked && unlockingIndex === index && (
            <div className="mt-1.5 flex items-center gap-2">
              <input
                value={unlockCode}
                onChange={event => setUnlockCode(event.target.value.replace(/\D/g, '').slice(0, 4))}
                onKeyDown={event => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    submitUnlock(index);
                  }
                }}
                inputMode="numeric"
                autoFocus
                placeholder="Code"
                className="min-w-0 flex-1 rounded-lg border border-stone-200 bg-white px-2.5 py-2 text-sm font-semibold tracking-widest text-stone-700 focus:outline-none focus:ring-2 focus:ring-[#7E9B86]/30"
                style={{ fontSize: 16, colorScheme: 'light' }}
                aria-label="Secret unlock code"
              />
              <button
                type="button"
                onClick={() => submitUnlock(index)}
                className="rounded-lg px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
                style={{ background: '#7E9B86', touchAction: 'manipulation' }}
                disabled={unlockCode.length !== 4}
              >
                Unlock
              </button>
            </div>
          )}
          {!block.locked && (
            <textarea
              ref={node => { secretRefs.current[index] = node; }}
              value={block.text}
              onChange={event => patchBlock(index, { text: event.target.value })}
              onKeyDown={event => handleSecretKeyDown(index, event)}
              placeholder="Private note..."
              rows={Math.max(1, rows)}
              className="mt-1.5 block w-full resize-none border-0 bg-transparent p-0 text-inherit placeholder-stone-300 focus:outline-none"
              style={textAreaStyle}
              onFocus={onFocus}
              onBlur={onBlur}
            />
          )}
        </div>
      ) : (
        <textarea
          key={index}
          autoFocus={autoFocus && index === 0}
          value={block.text}
          onChange={event => handleTextChange(index, event)}
          placeholder={blocks.length === 1 ? placeholder : undefined}
          rows={rows}
          className="block w-full resize-none border-0 bg-transparent p-0 text-inherit placeholder-stone-300 focus:outline-none"
          style={textAreaStyle}
          onFocus={onFocus}
          onBlur={onBlur}
        />
      ))}
      {canResize && (
        <button
          type="button"
          onPointerDown={startResize}
          onPointerMove={moveResize}
          onPointerUp={endResize}
          onPointerCancel={endResize}
          className="absolute bottom-1.5 right-1.5 flex h-6 w-6 touch-none items-end justify-end rounded-md text-stone-300 hover:bg-stone-100 hover:text-stone-500"
          aria-label="Resize note"
          title="Drag to resize note"
        >
          <span className="mb-1 mr-1 block h-3 w-3 border-b-2 border-r-2 border-current" />
        </button>
      )}
    </div>
  );
}
