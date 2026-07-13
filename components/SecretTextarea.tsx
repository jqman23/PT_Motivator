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
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4.5" y="8.5" width="11" height="8" rx="2" />
      {locked ? <path d="M7 8.5V6.7a3 3 0 0 1 6 0v1.8" /> : <path d="M7 8.5V6.7a3 3 0 0 1 5.3-1.9" />}
    </svg>
  );
}

function normalizedBlocks(value: string): SecretNoteBlock[] {
  const blocks = parseSecretNote(value);
  if (!blocks.length) return [{ type: 'text', text: '' }];
  const normalized: SecretNoteBlock[] = [];
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (block.type === 'text') {
      const nextBlock = blocks[index + 1];
      const trailingGap = nextBlock?.type === 'secret' ? (block.text.match(/\n+$/)?.[0] ?? '') : '';
      if (trailingGap) {
        const leadingText = block.text.slice(0, -trailingGap.length);
        if (leadingText) normalized.push({ type: 'text', text: leadingText });
        normalized.push({ type: 'text', text: trailingGap });
        continue;
      }
    }
    normalized.push(block);
  }
  return mergeText(normalized.length ? normalized : [{ type: 'text', text: '' }]);
}

function mergeText(blocks: SecretNoteBlock[]) {
  return blocks.reduce<SecretNoteBlock[]>((next, block) => {
    const prev = next.at(-1);
    const prevSpacer = prev?.type === 'text' && /^[\n]+$/.test(prev.text);
    const nextSpacer = block.type === 'text' && /^[\n]+$/.test(block.text);
    if (block.type === 'text' && prev?.type === 'text' && !prevSpacer && !nextSpacer) prev.text += block.text;
    else next.push({ ...block } as SecretNoteBlock);
    return next;
  }, []);
}

function convertSecretTriggers(blocks: SecretNoteBlock[]) {
  let changed = false;
  const next = blocks.flatMap(block => {
    if (block.type !== 'text') return [block];
    const match = block.text.match(/(^|\n)\/secret\s([^\n]*)$/);
    if (!match || match.index === undefined) return [block];
    changed = true;
    const lineStart = match.index + match[1].length;
    const before = block.text.slice(0, lineStart);
    const after = match[2] ?? '';
    const trailingGap = before.match(/\n+$/)?.[0] ?? '';
    const leadingText = trailingGap ? before.slice(0, -trailingGap.length) : before;
    return [
      ...(leadingText ? [{ type: 'text' as const, text: leadingText }] : []),
      ...(trailingGap ? [{ type: 'text' as const, text: trailingGap }] : []),
      { type: 'secret' as const, locked: false, text: after },
    ];
  });
  return { changed, blocks: mergeText(next.length ? next : [{ type: 'text', text: '' }]) };
}

function textRows(text: string) {
  return Math.max(1, text.split('\n').length);
}

function isNewlineSpacer(text: string) {
  return !!text && /^[\n]+$/.test(text);
}

export default function SecretTextarea({ value, onChange, placeholder, rows = 2, className = '', style, autoFocus, onFocus, onBlur }: Props) {
  const [blocks, setBlocks] = useState(() => normalizedBlocks(value));
  const [unlockingIndex, setUnlockingIndex] = useState<number | null>(null);
  const [unlockCode, setUnlockCode] = useState('');
  const [expanded, setExpanded] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const secretRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const pillRefs = useRef<Record<number, HTMLButtonElement | null>>({});
  const focusedRef = useRef(false);
  const pendingSecretIndex = useRef<number | null>(null);
  const pendingPillIndex = useRef<number | null>(null);
  const canResize = /\bresize-y\b/.test(className);
  const serialized = useMemo(() => serializeSecretNote(blocks), [blocks]);
  const hasSecretBlock = blocks.some(block => block.type === 'secret');
  const plainText = useMemo(() => blocks.map(block => block.type === 'text' ? block.text : '').join(''), [blocks]);
  const expandedHeight = rows >= 3 ? 240 : 200;
  const textareaHeight = canResize && expanded ? expandedHeight : style?.height;

  useEffect(() => {
    if (focusedRef.current || value === serialized) return;
    setBlocks(normalizedBlocks(value));
  }, [serialized, value]);

  useEffect(() => {
    if (autoFocus && !hasSecretBlock) textareaRef.current?.focus();
  }, [autoFocus, hasSecretBlock]);

  useEffect(() => {
    const index = pendingSecretIndex.current;
    if (index === null) return;
    pendingSecretIndex.current = null;
    const input = secretRefs.current[index];
    input?.focus();
    input?.setSelectionRange(input.value.length, input.value.length);
  }, [blocks]);

  useEffect(() => {
    const index = pendingPillIndex.current;
    if (index === null) return;
    pendingPillIndex.current = null;
    pillRefs.current[index]?.focus();
  }, [blocks]);

  const commit = (next: SecretNoteBlock[]) => {
    const clean = mergeText(next.length ? next : [{ type: 'text', text: '' }]);
    setBlocks(clean);
    onChange(serializeSecretNote(clean));
  };

  const handlePlainChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = event.target.value;
    const current: SecretNoteBlock[] = [{ type: 'text', text }];
    const converted = convertSecretTriggers(current);
    if (converted.changed) {
      pendingSecretIndex.current = converted.blocks.findIndex(block => block.type === 'secret' && !block.locked);
      commit(converted.blocks);
      return;
    }
    setBlocks(current);
    onChange(text);
  };

  const patchBlock = (index: number, block: SecretNoteBlock) => {
    commit(blocks.map((current, i) => i === index ? block : current));
  };

  const removeBlock = (index: number) => {
    setUnlockingIndex(null);
    setUnlockCode('');
    commit(blocks.filter((_, i) => i !== index));
  };

  const toggleSecret = (index: number, block: Extract<SecretNoteBlock, { type: 'secret' }>) => {
    if (!block.locked) {
      pendingPillIndex.current = index;
      patchBlock(index, { ...block, locked: true });
      return;
    }
    setUnlockingIndex(index);
    setUnlockCode('');
  };

  const unlock = (index: number) => {
    const block = blocks[index];
    if (!block || block.type !== 'secret') return;
    pendingSecretIndex.current = index;
    setUnlockingIndex(null);
    setUnlockCode('');
    patchBlock(index, { ...block, locked: false });
  };

  const updateUnlockCode = (index: number, raw: string) => {
    const next = raw.replace(/\D/g, '').slice(0, 4);
    setUnlockCode(next);
    if (next === SECRET_UNLOCK_CODE) unlock(index);
  };

  const toggleResize = () => setExpanded(value => !value);

  const resizeButton = (
    <button
      type="button"
      onClick={toggleResize}
      className="absolute bottom-1.5 right-1.5 flex h-6 w-6 touch-none items-end justify-end rounded-md text-stone-300 hover:bg-stone-100 hover:text-stone-500 sm:hidden"
      aria-label={expanded ? 'Shrink note' : 'Expand note'}
      title={expanded ? 'Shrink note' : 'Expand note'}
    >
      <span className="mb-1 mr-1 block h-3 w-3 border-b-2 border-r-2 border-current" />
    </button>
  );

  if (!hasSecretBlock) {
    const textarea = (
      <textarea
        ref={textareaRef}
        value={plainText}
        onChange={handlePlainChange}
        placeholder={placeholder}
        rows={rows}
        className={`${className} ${canResize ? 'resize-none pr-7 sm:resize-y sm:pr-3' : ''}`}
        style={{ ...style, height: textareaHeight }}
        autoFocus={autoFocus}
        onFocus={event => {
          focusedRef.current = true;
          onFocus?.(event);
        }}
        onBlur={event => {
          focusedRef.current = false;
          onBlur?.(event);
        }}
      />
    );

    if (!canResize) return textarea;

    return (
      <div className="relative">
        {textarea}
        {resizeButton}
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        role="textbox"
        aria-multiline="true"
        className={`${className} secret-note-editor overflow-auto resize-none ${canResize ? 'pr-7 sm:resize-y sm:pr-3' : ''}`}
        style={{ ...style, minHeight: style?.minHeight ?? `${Math.max(rows, 1) * 1.55 + 1.4}rem`, height: textareaHeight, whiteSpace: 'pre-wrap' }}
        onFocus={event => {
          focusedRef.current = true;
          onFocus?.(event as unknown as React.FocusEvent<HTMLTextAreaElement>);
        }}
        onBlur={event => {
          focusedRef.current = false;
          onBlur?.(event as unknown as React.FocusEvent<HTMLTextAreaElement>);
        }}
      >
        {blocks.map((block, index) => block.type === 'secret' ? (
          <div key={index} data-secret="true" data-secret-index={index} data-locked={block.locked ? 'true' : 'false'} className="my-1 flex min-h-[1.55rem] w-full max-w-full flex-wrap items-center gap-1">
            <button
              ref={node => {
                pillRefs.current[index] = node;
              }}
              type="button"
              onClick={() => toggleSecret(index, block)}
              onKeyDown={event => {
                if (event.key === 'Backspace' || event.key === 'Delete') {
                  event.preventDefault();
                  removeBlock(index);
                }
              }}
              className="inline-flex h-4 shrink-0 items-center gap-0.5 rounded-full border px-1.5 text-[8px] font-bold uppercase tracking-wide"
              style={{
                background: block.locked ? '#1F2F46' : '#E4ECE6',
                borderColor: block.locked ? '#162233' : '#cfded3',
                color: block.locked ? '#ffffff' : '#476653',
                lineHeight: 1,
              }}
            >
              <LockIcon locked={block.locked} />
              secret
            </button>
            {block.locked && unlockingIndex === index && (
              <input
                value={unlockCode}
                onChange={event => updateUnlockCode(index, event.target.value)}
                type="password"
                inputMode="numeric"
                autoFocus
                placeholder=""
                className="h-5 w-14 rounded-full border border-stone-200 bg-white px-2 text-xs font-semibold tracking-widest text-stone-700 focus:outline-none focus:ring-2 focus:ring-[#7E9B86]/30"
                style={{ fontSize: 16, colorScheme: 'light' }}
                aria-label="Secret unlock code"
              />
            )}
            {!block.locked && (
              <input
                ref={node => {
                  secretRefs.current[index] = node;
                }}
                value={block.text}
                onChange={event => patchBlock(index, { ...block, text: event.target.value })}
                onKeyDown={event => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    pendingPillIndex.current = index;
                    patchBlock(index, { ...block, locked: true });
                    return;
                  }
                  if ((event.key === 'Backspace' || event.key === 'Delete') && !block.text) {
                    event.preventDefault();
                    removeBlock(index);
                  }
                }}
                placeholder=""
                className="min-w-[8ch] flex-1 border-0 bg-transparent p-0 text-inherit outline-none"
                style={{ fontSize: 16, colorScheme: 'light' }}
                aria-label="Secret note text"
              />
            )}
          </div>
        ) : isNewlineSpacer(block.text) ? (
          <div
            key={index}
            aria-hidden="true"
            className="block w-full border-0 bg-transparent p-0"
            style={{ minHeight: `${textRows(block.text) * 1.55}rem` }}
          />
        ) : (
          <textarea
            key={index}
            value={block.text}
            onChange={event => patchBlock(index, { type: 'text', text: event.target.value })}
            rows={textRows(block.text)}
            placeholder={!block.text && blocks.length === 1 ? placeholder : undefined}
            className="block w-full resize-none border-0 bg-transparent p-0 text-inherit outline-none"
            style={{ font: 'inherit', colorScheme: 'light' }}
            aria-label="Note text"
          />
        ))}
      </div>
      {canResize && resizeButton}
    </div>
  );
}
