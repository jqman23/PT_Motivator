'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
  return blocks.length ? blocks : [{ type: 'text', text: '' }];
}

function mergeText(blocks: SecretNoteBlock[]) {
  return blocks.reduce<SecretNoteBlock[]>((next, block) => {
    const prev = next.at(-1);
    if (block.type === 'text' && prev?.type === 'text') prev.text += block.text;
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
    return [
      ...(before ? [{ type: 'text' as const, text: before }] : []),
      { type: 'secret' as const, locked: false, text: after },
    ];
  });
  return { changed, blocks: mergeText(next.length ? next : [{ type: 'text', text: '' }]) };
}

function textFromNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (!(node instanceof HTMLElement)) return '';
  if (node.dataset.secret === 'true') return '';
  if (node.tagName === 'BR') return '\n';
  return Array.from(node.childNodes).map(textFromNode).join('');
}

export default function SecretTextarea({ value, onChange, placeholder, rows = 2, className = '', style, autoFocus, onFocus, onBlur }: Props) {
  const [blocks, setBlocks] = useState(() => normalizedBlocks(value));
  const [unlockingIndex, setUnlockingIndex] = useState<number | null>(null);
  const [unlockCode, setUnlockCode] = useState('');
  const [expanded, setExpanded] = useState(false);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const focusedRef = useRef(false);
  const pendingSecretIndex = useRef<number | null>(null);
  const canResize = /\bresize-y\b/.test(className);
  const serialized = useMemo(() => serializeSecretNote(blocks), [blocks]);
  const hasSecretBlock = blocks.some(block => block.type === 'secret');
  const plainText = useMemo(() => blocks.map(block => block.type === 'text' ? block.text : '').join(''), [blocks]);
  const expandedHeight = rows >= 3 ? 240 : 200;

  useEffect(() => {
    if (focusedRef.current || value === serialized) return;
    setBlocks(normalizedBlocks(value));
  }, [serialized, value]);

  useEffect(() => {
    if (!autoFocus) return;
    if (hasSecretBlock) editorRef.current?.focus();
    else textareaRef.current?.focus();
  }, [autoFocus, hasSecretBlock]);

  useLayoutEffect(() => {
    const index = pendingSecretIndex.current;
    if (index === null) return;
    pendingSecretIndex.current = null;
    const target = editorRef.current?.querySelector<HTMLElement>(`[data-secret-index="${index}"] [data-secret-content="true"]`);
    if (!target) return;
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(target);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);
    target.focus();
  }, [blocks]);

  const readBlocks = () => {
    const root = editorRef.current;
    if (!root) return blocks;
    const next: SecretNoteBlock[] = [];
    const appendText = (text: string) => {
      if (!text) return;
      const prev = next.at(-1);
      if (prev?.type === 'text') prev.text += text;
      else next.push({ type: 'text', text });
    };
    root.childNodes.forEach(node => {
      if (node instanceof HTMLElement && node.dataset.secret === 'true') {
        next.push({
          type: 'secret',
          locked: node.dataset.locked === 'true',
          text: node.dataset.locked === 'true'
            ? node.dataset.secretText ?? ''
            : node.querySelector<HTMLElement>('[data-secret-content="true"]')?.textContent ?? '',
        });
        return;
      }
      appendText(textFromNode(node));
    });
    return mergeText(next.length ? next : [{ type: 'text', text: '' }]);
  };

  const commit = (next: SecretNoteBlock[]) => {
    const clean = mergeText(next.length ? next : [{ type: 'text', text: '' }]);
    setBlocks(clean);
    onChange(serializeSecretNote(clean));
  };

  const handleInput = () => {
    const current = readBlocks();
    const converted = convertSecretTriggers(current);
    if (converted.changed) {
      pendingSecretIndex.current = converted.blocks.findIndex(block => block.type === 'secret' && !block.locked);
      commit(converted.blocks);
      return;
    }
    setBlocks(current);
    onChange(serializeSecretNote(current));
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

  const patchSecret = (index: number, patch: Partial<Extract<SecretNoteBlock, { type: 'secret' }>>) => {
    const current = readBlocks();
    commit(current.map((block, i) => i === index && block.type === 'secret' ? { ...block, ...patch } : block));
  };

  const removeBlock = (index: number) => {
    const current = readBlocks();
    setUnlockingIndex(null);
    setUnlockCode('');
    commit(current.filter((_, i) => i !== index));
  };

  const toggleSecret = (index: number, block: Extract<SecretNoteBlock, { type: 'secret' }>) => {
    if (!block.locked) {
      patchSecret(index, { locked: true });
      return;
    }
    setUnlockingIndex(index);
    setUnlockCode('');
  };

  const unlock = (index: number) => {
    pendingSecretIndex.current = index;
    setUnlockingIndex(null);
    setUnlockCode('');
    patchSecret(index, { locked: false });
  };

  const updateUnlockCode = (index: number, raw: string) => {
    const next = raw.replace(/\D/g, '').slice(0, 4);
    setUnlockCode(next);
    if (next === SECRET_UNLOCK_CODE) unlock(index);
  };

  const adjacentSecretIndex = (direction: -1 | 1) => {
    const selection = window.getSelection();
    if (!selection?.isCollapsed || !editorRef.current) return -1;
    let node: Node | null = selection.anchorNode;
    let offset = selection.anchorOffset;

    const element = node instanceof HTMLElement ? node : node?.parentElement;
    const containingSecret = element?.closest<HTMLElement>('[data-secret="true"]');
    if (containingSecret && editorRef.current.contains(containingSecret)) {
      if (direction === -1 && offset > 0) return Number(containingSecret.dataset.secretIndex);
      if (direction === 1 && offset === 0) return Number(containingSecret.dataset.secretIndex);
    }

    if (node?.nodeType === Node.TEXT_NODE && direction === -1 && offset > 0) return -1;
    if (node?.nodeType === Node.TEXT_NODE && direction === 1 && offset < (node.textContent ?? '').length) return -1;
    if (node !== editorRef.current) {
      while (node?.parentNode && node.parentNode !== editorRef.current) node = node.parentNode;
      if (!node?.parentNode) return -1;
      offset = Array.from(editorRef.current.childNodes).indexOf(node as ChildNode) + (direction === 1 ? 1 : 0);
    }
    const target = editorRef.current.childNodes[offset + (direction === -1 ? -1 : 0)];
    return target instanceof HTMLElement && target.dataset.secret === 'true' ? Number(target.dataset.secretIndex) : -1;
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if ((event.key === 'Backspace' || event.key === 'Delete') && !event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey) {
      const index = adjacentSecretIndex(event.key === 'Backspace' ? -1 : 1);
      if (index >= 0) {
        event.preventDefault();
        removeBlock(index);
      }
      return;
    }
    if (event.key !== 'Enter') return;
    const selection = window.getSelection();
    const container = selection?.anchorNode instanceof HTMLElement ? selection.anchorNode : selection?.anchorNode?.parentElement;
    const secret = container?.closest<HTMLElement>('[data-secret="true"]');
    if (!secret || secret.dataset.locked === 'true') return;
    event.preventDefault();
    patchSecret(Number(secret.dataset.secretIndex), { locked: true });
  };

  const toggleResize = () => setExpanded(value => !value);
  const textareaHeight = canResize && expanded ? expandedHeight : style?.height;

  if (!hasSecretBlock) {
    const textarea = (
      <textarea
        ref={textareaRef}
        value={plainText}
        onChange={handlePlainChange}
        placeholder={placeholder}
        rows={rows}
        className={`${className} ${canResize ? 'resize-none pr-7' : ''}`}
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
        <button
          type="button"
          onClick={toggleResize}
          className="absolute bottom-1.5 right-1.5 flex h-6 w-6 touch-none items-end justify-end rounded-md text-stone-300 hover:bg-stone-100 hover:text-stone-500"
          aria-label={expanded ? 'Shrink note' : 'Expand note'}
          title={expanded ? 'Shrink note' : 'Expand note'}
        >
          <span className="mb-1 mr-1 block h-3 w-3 border-b-2 border-r-2 border-current" />
        </button>
      </div>
    );
  }

  return (
    <div
      ref={editorRef}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      data-placeholder={placeholder}
      className={`${className} secret-note-editor relative overflow-auto resize-none leading-relaxed empty:before:text-stone-300 empty:before:content-[attr(data-placeholder)] ${canResize ? 'pr-7' : ''}`}
      style={{ ...style, minHeight: style?.minHeight ?? `${Math.max(rows, 1) * 1.55 + 1.4}rem`, height: canResize && expanded ? expandedHeight : style?.height, whiteSpace: 'pre-wrap' }}
      onInput={handleInput}
      onKeyDown={handleKeyDown}
      onFocus={event => {
        focusedRef.current = true;
        onFocus?.(event as unknown as React.FocusEvent<HTMLTextAreaElement>);
      }}
      onBlur={event => {
        focusedRef.current = false;
        const latest = readBlocks();
        setBlocks(latest);
        onChange(serializeSecretNote(latest));
        onBlur?.(event as unknown as React.FocusEvent<HTMLTextAreaElement>);
      }}
    >
      {blocks.map((block, index) => block.type === 'secret' ? (
        <span key={index} data-secret="true" data-secret-index={index} data-locked={block.locked ? 'true' : 'false'} data-secret-text={block.text} className="inline-flex max-w-full items-baseline gap-1 align-baseline">
          <span
            role="button"
            tabIndex={0}
            contentEditable={false}
            onClick={() => toggleSecret(index, block)}
            onKeyDown={event => {
              if (event.key === 'Backspace' || event.key === 'Delete') {
                event.preventDefault();
                removeBlock(index);
              }
            }}
            className="inline-flex h-4 items-center gap-0.5 rounded-full border px-1.5 text-[8px] font-bold uppercase tracking-wide"
            style={{
              background: block.locked ? '#1F2F46' : '#E4ECE6',
              borderColor: block.locked ? '#162233' : '#cfded3',
              color: block.locked ? '#ffffff' : '#476653',
              lineHeight: 1,
            }}
          >
            <LockIcon locked={block.locked} />
            secret
          </span>
          {block.locked && unlockingIndex === index && (
            <span contentEditable={false} className="inline-flex items-center gap-1">
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
            </span>
          )}
          {!block.locked && <span data-secret-content="true" className="min-w-[1ch] outline-none">{block.text}</span>}
        </span>
      ) : block.text)}
      {canResize && (
        <button
          type="button"
          contentEditable={false}
          onClick={toggleResize}
          className="absolute bottom-1.5 right-1.5 flex h-6 w-6 touch-none items-end justify-end rounded-md text-stone-300 hover:bg-stone-100 hover:text-stone-500"
          aria-label={expanded ? 'Shrink note' : 'Expand note'}
          title={expanded ? 'Shrink note' : 'Expand note'}
        >
          <span className="mb-1 mr-1 block h-3 w-3 border-b-2 border-r-2 border-current" />
        </button>
      )}
    </div>
  );
}
