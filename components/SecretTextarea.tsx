'use client';

import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { applyNoteSlashCommand } from '@/lib/noteCommands';
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

type EditorSecretBlock = Extract<SecretNoteBlock, { type: 'secret' }> & { id: string };
type EditorBlock = Extract<SecretNoteBlock, { type: 'text' }> | EditorSecretBlock;
type PendingCaret = { secretId: string; position: 'inside-end' | 'before' | 'after' };
type TypingScrollSnapshot = {
  pageX: number;
  pageY: number;
  restorePage: boolean;
  containers: Array<{ element: HTMLElement; left: number; top: number }>;
};

const CARET_ANCHOR = '\u200b';
const BLOCK_ELEMENTS = new Set(['DIV', 'LI', 'P']);

function LockIcon({ locked }: { locked: boolean }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4.5" y="8.5" width="11" height="8" rx="2" />
      {locked ? <path d="M7 8.5V6.7a3 3 0 0 1 6 0v1.8" /> : <path d="M7 8.5V6.7a3 3 0 0 1 5.3-1.9" />}
    </svg>
  );
}

function cleanText(text: string) {
  return text.replaceAll(CARET_ANCHOR, '').replaceAll('\r\n', '\n');
}

function mergeEditorText(blocks: readonly EditorBlock[]): EditorBlock[] {
  const merged: EditorBlock[] = [];
  for (const block of blocks) {
    if (block.type === 'text') {
      const text = cleanText(block.text);
      const previous = merged.at(-1);
      if (previous?.type === 'text') previous.text += text;
      else if (text) merged.push({ type: 'text', text });
      continue;
    }
    merged.push({ ...block });
  }
  return merged.length ? merged : [{ type: 'text', text: '' }];
}

function makeEditorBlocks(value: string, idPrefix: string): EditorBlock[] {
  let secretIndex = 0;
  return mergeEditorText(parseSecretNote(value).map(block => {
    if (block.type !== 'secret') return block;
    const next = { ...block, id: `${idPrefix}-initial-${secretIndex}` };
    secretIndex += 1;
    return next;
  }));
}

function ensureSecretIds(blocks: readonly SecretNoteBlock[], idPrefix: string): EditorBlock[] {
  let newSecretIndex = 0;
  return mergeEditorText(blocks.map(block => {
    if (block.type !== 'secret') return block;
    const possibleId = (block as Partial<EditorSecretBlock>).id;
    if (typeof possibleId === 'string') return { ...block, id: possibleId };
    const next = { ...block, id: `${idPrefix}-new-${newSecretIndex}` };
    newSecretIndex += 1;
    return next;
  }));
}

function serializeEditorBlocks(blocks: readonly EditorBlock[]) {
  return serializeSecretNote(blocks.map(block => block.type === 'secret'
    ? { type: 'secret', locked: block.locked, text: block.text }
    : block));
}

function isEditorEmpty(blocks: readonly EditorBlock[]) {
  return blocks.every(block => block.type === 'text' && !block.text);
}

function compactFieldClassName(className: string) {
  return className
    .replace(/\bp-3\b/g, 'px-3 py-1.5')
    .replace(/\bp-2\.5\b/g, 'px-2.5 py-1.5')
    .replace(/\bp-2\b/g, 'px-2 py-1.5')
    .replace(/\bpy-2\.5\b/g, 'py-1.5')
    .replace(/\bpy-2\b/g, 'py-1.5');
}

function readEditorBlocks(root: HTMLDivElement, previous: readonly EditorBlock[]): EditorBlock[] {
  const secretById = new Map(previous.filter((block): block is EditorSecretBlock => block.type === 'secret').map(block => [block.id, block]));
  const blocks: EditorBlock[] = [];

  const appendText = (text: string) => {
    const clean = cleanText(text);
    if (!clean) return;
    const last = blocks.at(-1);
    if (last?.type === 'text') last.text += clean;
    else blocks.push({ type: 'text', text: clean });
  };

  const endsWithNewline = () => {
    const last = blocks.at(-1);
    return last?.type === 'text' && last.text.endsWith('\n');
  };

  const visit = (node: Node, addBlockBreak = false) => {
    if (node.nodeType === Node.TEXT_NODE) {
      appendText(node.textContent ?? '');
      return;
    }
    if (!(node instanceof HTMLElement)) return;

    if (node.dataset.secret === 'true') {
      const id = node.dataset.secretId;
      const previousSecret = id ? secretById.get(id) : undefined;
      if (!id || !previousSecret) return;
      const locked = node.dataset.locked === 'true';
      const content = node.querySelector<HTMLElement>('[data-secret-content="true"]');
      blocks.push({
        type: 'secret',
        id,
        locked,
        text: locked ? previousSecret.text : cleanText(content?.textContent ?? ''),
      });
      return;
    }

    if (node.tagName === 'BR') {
      appendText('\n');
      return;
    }

    if (addBlockBreak && blocks.length && !endsWithNewline()) appendText('\n');
    Array.from(node.childNodes).forEach(child => visit(child, BLOCK_ELEMENTS.has((child as HTMLElement).tagName)));
  };

  Array.from(root.childNodes).forEach(child => visit(child, BLOCK_ELEMENTS.has((child as HTMLElement).tagName)));
  const hasSecret = blocks.some(block => block.type === 'secret');
  const hasTextNodeContent = cleanText(root.textContent ?? '').length > 0;
  if (!hasSecret && !hasTextNodeContent && root.querySelector('br')) return [{ type: 'text', text: '' }];
  return mergeEditorText(blocks);
}

function insertTextAtSelection(root: HTMLDivElement, text: string) {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return false;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer) && range.commonAncestorContainer !== root) return false;

  range.deleteContents();
  const insertedText = text.endsWith('\n') ? `${text}${CARET_ANCHOR}` : text;
  const textNode = document.createTextNode(insertedText);
  range.insertNode(textNode);
  range.setStart(textNode, insertedText.length);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

function directEditorChild(root: HTMLDivElement, node: Node) {
  let current: Node | null = node;
  while (current?.parentNode && current.parentNode !== root) current = current.parentNode;
  return current?.parentNode === root ? current : null;
}

function skipCaretAnchors(node: Node | null, direction: 'backward' | 'forward') {
  let current = node;
  while (current?.nodeType === Node.TEXT_NODE && !cleanText(current.textContent ?? '')) {
    current = direction === 'backward' ? current.previousSibling : current.nextSibling;
  }
  return current;
}

function secretAtDeletionBoundary(root: HTMLDivElement, direction: 'backward' | 'forward') {
  const selection = window.getSelection();
  if (!selection?.isCollapsed || !selection.anchorNode) return null;

  const anchorElement = selection.anchorNode instanceof HTMLElement
    ? selection.anchorNode
    : selection.anchorNode.parentElement;
  const secretContent = anchorElement?.closest<HTMLElement>('[data-secret-content="true"]');
  if (secretContent && root.contains(secretContent) && !cleanText(secretContent.textContent ?? '')) {
    return secretContent.closest<HTMLElement>('[data-secret="true"]')?.dataset.secretId ?? null;
  }

  let candidate: Node | null;
  if (selection.anchorNode === root) {
    candidate = root.childNodes[selection.anchorOffset + (direction === 'backward' ? -1 : 0)] ?? null;
  } else {
    if (selection.anchorNode.nodeType === Node.TEXT_NODE) {
      const text = selection.anchorNode.textContent ?? '';
      const adjacentText = direction === 'backward'
        ? text.slice(0, selection.anchorOffset)
        : text.slice(selection.anchorOffset);
      if (cleanText(adjacentText)) return null;
    }
    const directChild = directEditorChild(root, selection.anchorNode);
    candidate = direction === 'backward' ? directChild?.previousSibling ?? null : directChild?.nextSibling ?? null;
  }

  candidate = skipCaretAnchors(candidate, direction);
  if (!(candidate instanceof HTMLElement)) return null;
  const expectedBoundary = direction === 'backward' ? 'after' : 'before';
  return candidate.dataset.secretBoundary === expectedBoundary ? candidate.dataset.secretId ?? null : null;
}

function captureTypingScroll(root: HTMLDivElement): TypingScrollSnapshot | null {
  if (!window.matchMedia('(max-width: 639px) and (pointer: coarse)').matches) return null;

  const visualViewport = window.visualViewport;
  const viewportTop = visualViewport?.offsetTop ?? 0;
  const viewportBottom = viewportTop + (visualViewport?.height ?? window.innerHeight);
  const selection = window.getSelection();
  const caretRect = selection?.rangeCount ? selection.getRangeAt(0).getBoundingClientRect() : root.getBoundingClientRect();
  const restorePage = caretRect.height === 0
    || (caretRect.top >= viewportTop + 24 && caretRect.bottom <= viewportBottom - 24);
  const containers: TypingScrollSnapshot['containers'] = [];

  let parent = root.parentElement;
  while (parent && parent !== document.body) {
    if (parent.scrollHeight > parent.clientHeight || parent.scrollWidth > parent.clientWidth) {
      containers.push({ element: parent, left: parent.scrollLeft, top: parent.scrollTop });
    }
    parent = parent.parentElement;
  }

  return {
    pageX: window.scrollX,
    pageY: window.scrollY,
    restorePage,
    containers,
  };
}

function restoreSmallTypingShift(snapshot: TypingScrollSnapshot) {
  const restore = () => {
    for (const container of snapshot.containers) {
      if (!container.element.isConnected) continue;
      const deltaX = Math.abs(container.element.scrollLeft - container.left);
      const deltaY = Math.abs(container.element.scrollTop - container.top);
      if (deltaX <= 48) container.element.scrollLeft = container.left;
      if (deltaY <= 48) container.element.scrollTop = container.top;
    }

    if (!snapshot.restorePage) return;
    const deltaX = Math.abs(window.scrollX - snapshot.pageX);
    const deltaY = Math.abs(window.scrollY - snapshot.pageY);
    if (deltaX <= 48 && deltaY <= 48 && (deltaX || deltaY)) window.scrollTo(snapshot.pageX, snapshot.pageY);
  };

  restore();
  window.requestAnimationFrame(() => {
    restore();
    window.requestAnimationFrame(restore);
  });
}

export default function SecretTextarea({ value, onChange, placeholder, rows = 2, className = '', style, autoFocus, onFocus, onBlur }: Props) {
  const editorId = useId();
  const [renderState, setRenderState] = useState(() => ({ blocks: makeEditorBlocks(value, editorId), revision: 0 }));
  const [unlockingId, setUnlockingId] = useState<string | null>(null);
  const [unlockCode, setUnlockCode] = useState('');
  const [unlockError, setUnlockError] = useState(false);
  const [unlockPosition, setUnlockPosition] = useState({ left: 0, top: 0 });
  const [expanded, setExpanded] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const unlockInputRef = useRef<HTMLInputElement | null>(null);
  const modelRef = useRef<EditorBlock[]>(renderState.blocks);
  const currentValueRef = useRef(serializeEditorBlocks(renderState.blocks));
  const focusedRef = useRef(false);
  const composingRef = useRef(false);
  const pendingCaretRef = useRef<PendingCaret | null>(null);
  const typingScrollRef = useRef<TypingScrollSnapshot | null>(null);
  const canResize = /\bresize-y\b/.test(className);
  const expandedHeight = rows >= 3 ? 240 : 200;
  const editorHeight = canResize && expanded ? expandedHeight : style?.height;
  const editorClassName = compactFieldClassName(className);

  const updateEmptyState = (blocks: readonly EditorBlock[]) => {
    if (editorRef.current) editorRef.current.dataset.empty = isEditorEmpty(blocks) ? 'true' : 'false';
  };

  const emit = (blocks: EditorBlock[]) => {
    modelRef.current = blocks;
    const serialized = serializeEditorBlocks(blocks);
    currentValueRef.current = serialized;
    updateEmptyState(blocks);
    onChange(serialized);
  };

  const replaceEditor = (blocks: EditorBlock[], caret?: PendingCaret, notify = true) => {
    const clean = mergeEditorText(blocks);
    modelRef.current = clean;
    currentValueRef.current = serializeEditorBlocks(clean);
    pendingCaretRef.current = caret ?? null;
    setRenderState(previous => ({ blocks: clean, revision: previous.revision + 1 }));
    if (notify) onChange(currentValueRef.current);
  };

  const readCurrent = () => editorRef.current
    ? readEditorBlocks(editorRef.current, modelRef.current)
    : modelRef.current;

  useEffect(() => {
    if (value === currentValueRef.current || focusedRef.current) return;
    replaceEditor(makeEditorBlocks(value, editorId), undefined, false);
    // External value synchronization should not echo through onChange.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    if (!autoFocus) return;
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, [autoFocus]);

  useLayoutEffect(() => {
    const pending = pendingCaretRef.current;
    if (!pending) return;
    pendingCaretRef.current = null;
    const editor = editorRef.current;
    const secret = editor?.querySelector<HTMLElement>(`[data-secret="true"][data-secret-id="${pending.secretId}"]`);
    if (!editor || !secret) return;

    const target = pending.position === 'inside-end'
      ? secret.querySelector<HTMLElement>('[data-secret-content="true"]')
      : editor.querySelector<HTMLElement>(`[data-secret-boundary="${pending.position}"][data-secret-id="${pending.secretId}"]`);
    if (!target) return;

    editor.focus({ preventScroll: true });
    const selection = window.getSelection();
    const range = document.createRange();
    if (pending.position === 'inside-end') {
      range.selectNodeContents(target);
      range.collapse(false);
    } else if (pending.position === 'before') {
      range.setStartBefore(target);
      range.collapse(true);
    } else {
      range.setStartAfter(target);
      range.collapse(true);
    }
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, [renderState.revision]);

  useEffect(() => {
    if (!unlockingId) return;
    unlockInputRef.current?.focus({ preventScroll: true });
  }, [unlockingId]);

  const syncFromEditor = () => {
    const current = readCurrent();
    if (!composingRef.current) {
      const command = applyNoteSlashCommand(current);
      if (command.changed) {
        const next = ensureSecretIds(command.blocks, `${editorId}-${renderState.revision + 1}`);
        const target = command.insertedBlockIndex === undefined ? undefined : next[command.insertedBlockIndex];
        replaceEditor(next, target?.type === 'secret' ? { secretId: target.id, position: 'inside-end' } : undefined);
        return;
      }
    }
    emit(current);
  };

  const captureScrollBeforeTyping = () => {
    const editor = editorRef.current;
    if (editor) typingScrollRef.current = captureTypingScroll(editor);
  };

  const stabilizeScrollAfterTyping = () => {
    const snapshot = typingScrollRef.current;
    typingScrollRef.current = null;
    if (snapshot) restoreSmallTypingShift(snapshot);
  };

  const handleEditorInput = () => {
    syncFromEditor();
    stabilizeScrollAfterTyping();
  };

  const handlePlainTextInsertion = (text: string) => {
    const editor = editorRef.current;
    if (!editor || !insertTextAtSelection(editor, text)) return false;
    syncFromEditor();
    return true;
  };

  const removeSecretWithoutRemount = (secretId: string) => {
    const editor = editorRef.current;
    if (!editor) return false;
    const before = editor.querySelector<HTMLElement>(`[data-secret-boundary="before"][data-secret-id="${secretId}"]`);
    const secret = editor.querySelector<HTMLElement>(`[data-secret="true"][data-secret-id="${secretId}"]`);
    const after = editor.querySelector<HTMLElement>(`[data-secret-boundary="after"][data-secret-id="${secretId}"]`);
    if (!before || !secret || !after) return false;

    const pageScroll = { x: window.scrollX, y: window.scrollY };
    const editorScroll = { left: editor.scrollLeft, top: editor.scrollTop };
    const range = document.createRange();
    range.setStartBefore(before);
    range.setEndAfter(after);
    range.deleteContents();
    const caret = document.createTextNode(CARET_ANCHOR);
    range.insertNode(caret);
    range.setStart(caret, CARET_ANCHOR.length);
    range.collapse(true);

    editor.focus({ preventScroll: true });
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    setUnlockingId(null);
    setUnlockCode('');
    setUnlockError(false);
    emit(readEditorBlocks(editor, modelRef.current));

    const restoreScroll = () => {
      editor.scrollLeft = editorScroll.left;
      editor.scrollTop = editorScroll.top;
      if (window.scrollX !== pageScroll.x || window.scrollY !== pageScroll.y) window.scrollTo(pageScroll.x, pageScroll.y);
    };
    restoreScroll();
    window.requestAnimationFrame(restoreScroll);
    return true;
  };

  const handleBoundaryDeletion = (direction: 'backward' | 'forward') => {
    const editor = editorRef.current;
    if (!editor) return false;
    const secretId = secretAtDeletionBoundary(editor, direction);
    return secretId ? removeSecretWithoutRemount(secretId) : false;
  };

  const lockSecret = (secretId: string) => {
    const current = readCurrent();
    const next = current.map(block => block.type === 'secret' && block.id === secretId
      ? { ...block, locked: true }
      : block);
    setUnlockingId(null);
    setUnlockCode('');
    setUnlockError(false);
    replaceEditor(next, { secretId, position: 'after' });
  };

  const showUnlock = (secretId: string, control: HTMLElement) => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const wrapperRect = wrapper.getBoundingClientRect();
    const controlRect = control.getBoundingClientRect();
    const width = 148;
    const left = Math.max(4, Math.min(controlRect.left - wrapperRect.left, wrapperRect.width - width - 4));
    setUnlockPosition({ left, top: controlRect.bottom - wrapperRect.top + 4 });
    setUnlockCode('');
    setUnlockError(false);
    setUnlockingId(secretId);
  };

  const unlockSecret = (secretId: string) => {
    const current = readCurrent();
    const next = current.map(block => block.type === 'secret' && block.id === secretId
      ? { ...block, locked: false }
      : block);
    setUnlockingId(null);
    setUnlockCode('');
    setUnlockError(false);
    replaceEditor(next, { secretId, position: 'inside-end' });
  };

  const updateUnlockCode = (raw: string) => {
    const next = raw.replace(/\D/g, '').slice(0, 4);
    setUnlockCode(next);
    setUnlockError(next.length === 4 && next !== SECRET_UNLOCK_CODE);
    if (next === SECRET_UNLOCK_CODE && unlockingId) unlockSecret(unlockingId);
  };

  const handleSecretControl = (event: React.MouseEvent<HTMLElement>, block: EditorSecretBlock) => {
    event.preventDefault();
    event.stopPropagation();
    if (block.locked) showUnlock(block.id, event.currentTarget);
    else lockSecret(block.id);
  };

  const finalizeBlur = (event: React.FocusEvent<HTMLElement>) => {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && wrapperRef.current?.contains(nextTarget)) return;
    typingScrollRef.current = null;
    focusedRef.current = false;
    setUnlockingId(null);
    setUnlockCode('');
    setUnlockError(false);
    const current = readCurrent();
    modelRef.current = current;
    currentValueRef.current = serializeEditorBlocks(current);
    setRenderState(previous => ({ blocks: current, revision: previous.revision + 1 }));
    onChange(currentValueRef.current);
    onBlur?.(event as unknown as React.FocusEvent<HTMLTextAreaElement>);
  };

  const toggleResize = () => setExpanded(current => !current);

  return (
    <div ref={wrapperRef} className="relative min-w-0">
      <div
        key={renderState.revision}
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={placeholder || 'Note'}
        data-placeholder={placeholder}
        data-empty={isEditorEmpty(renderState.blocks) ? 'true' : 'false'}
        className={`${editorClassName} secret-note-editor overflow-auto whitespace-pre-wrap break-words leading-[1.35] outline-none ${canResize ? 'pr-7 sm:pr-3' : ''}`}
        style={{
          ...style,
          minHeight: style?.minHeight ?? `${Math.max(rows, 1) * 1.22 + 0.65}rem`,
          height: editorHeight,
          paddingBlock: style?.paddingBlock ?? '0.375rem',
          fontSize: style?.fontSize ?? 16,
          WebkitUserSelect: 'text',
          userSelect: 'text',
        }}
        spellCheck
        onInput={handleEditorInput}
        onBeforeInput={event => {
          captureScrollBeforeTyping();
          const inputType = (event.nativeEvent as InputEvent).inputType;
          if (inputType === 'deleteContentBackward' && handleBoundaryDeletion('backward')) {
            event.preventDefault();
            typingScrollRef.current = null;
            return;
          }
          if (inputType === 'deleteContentForward' && handleBoundaryDeletion('forward')) {
            event.preventDefault();
            typingScrollRef.current = null;
            return;
          }
          if (inputType !== 'insertParagraph' && inputType !== 'insertLineBreak') return;
          event.preventDefault();
          handlePlainTextInsertion('\n');
          stabilizeScrollAfterTyping();
        }}
        onKeyDown={event => {
          if (!typingScrollRef.current) captureScrollBeforeTyping();
          if (event.key === 'Backspace' && handleBoundaryDeletion('backward')) {
            event.preventDefault();
            typingScrollRef.current = null;
            return;
          }
          if (event.key === 'Delete' && handleBoundaryDeletion('forward')) {
            event.preventDefault();
            typingScrollRef.current = null;
            return;
          }
          if (event.key !== 'Enter') return;
          event.preventDefault();
          handlePlainTextInsertion('\n');
          stabilizeScrollAfterTyping();
        }}
        onPaste={event => {
          captureScrollBeforeTyping();
          event.preventDefault();
          handlePlainTextInsertion(event.clipboardData.getData('text/plain'));
          stabilizeScrollAfterTyping();
        }}
        onDrop={event => event.preventDefault()}
        onCompositionStart={() => {
          composingRef.current = true;
        }}
        onCompositionEnd={() => {
          composingRef.current = false;
          handleEditorInput();
        }}
        onFocus={event => {
          focusedRef.current = true;
          onFocus?.(event as unknown as React.FocusEvent<HTMLTextAreaElement>);
        }}
        onBlur={finalizeBlur}
      >
        {renderState.blocks.map((block, index) => (
          <Fragment key={block.type === 'secret' ? block.id : `text-${index}`}>
            {block.type === 'text' ? block.text : (
              <>
                {CARET_ANCHOR}
                <span
                  data-secret-boundary="before"
                  data-secret-id={block.id}
                  contentEditable={false}
                  aria-hidden="true"
                  className="inline-block w-0 overflow-hidden align-baseline leading-none"
                >
                  {CARET_ANCHOR}
                </span>
                {block.locked ? (
                  <span
                    data-secret="true"
                    data-secret-id={block.id}
                    data-locked="true"
                    data-secret-control="true"
                    contentEditable={false}
                    role="button"
                    tabIndex={0}
                    aria-label="Unlock secret text"
                    title="Unlock secret text"
                    onPointerDown={event => event.preventDefault()}
                    onClick={event => handleSecretControl(event, block)}
                    onKeyDown={event => {
                      if (event.key === 'Backspace' || event.key === 'Delete') {
                        event.preventDefault();
                        removeSecretWithoutRemount(block.id);
                        return;
                      }
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      showUnlock(block.id, event.currentTarget);
                    }}
                    className="mx-0.5 inline-flex h-4 cursor-pointer items-center gap-0.5 border-b border-[#7E9B86]/50 px-0.5 align-[-0.12em] text-[9px] font-semibold uppercase text-[#52695A]"
                  >
                    <LockIcon locked />
                    secret
                  </span>
                ) : (
                  <span data-secret="true" data-secret-id={block.id} data-locked="false" className="secret-note-open">
                    <span
                      data-secret-control="true"
                      contentEditable={false}
                      role="button"
                      tabIndex={0}
                      aria-label="Lock secret text"
                      title="Lock secret text"
                      onPointerDown={event => event.preventDefault()}
                      onClick={event => handleSecretControl(event, block)}
                      onKeyDown={event => {
                        if (event.key === 'Backspace' || event.key === 'Delete') {
                          event.preventDefault();
                          removeSecretWithoutRemount(block.id);
                          return;
                        }
                        if (event.key !== 'Enter' && event.key !== ' ') return;
                        event.preventDefault();
                        lockSecret(block.id);
                      }}
                      className="relative mr-0.5 inline-flex h-4 w-4 cursor-pointer items-center justify-center align-[-0.12em] text-[#6B8974] after:absolute after:-inset-1.5 after:content-['']"
                    >
                      <LockIcon locked={false} />
                    </span>
                    <span
                      data-secret-content="true"
                      className="secret-note-open-content outline-none"
                      style={{ boxShadow: 'inset 0 -0.32em rgb(126 155 134 / 0.16)' }}
                    >
                      {block.text || CARET_ANCHOR}
                    </span>
                  </span>
                )}
                <span
                  data-secret-boundary="after"
                  data-secret-id={block.id}
                  contentEditable={false}
                  aria-hidden="true"
                  className="inline-block w-0 overflow-hidden align-baseline leading-none"
                >
                  {CARET_ANCHOR}
                </span>
                {CARET_ANCHOR}
              </>
            )}
          </Fragment>
        ))}
      </div>

      {unlockingId && (
        <div
          className="absolute z-30 flex h-9 w-[148px] items-center gap-1 rounded-md border border-stone-200 bg-white px-1.5 shadow-lg"
          style={{ left: unlockPosition.left, top: unlockPosition.top }}
        >
          <LockIcon locked />
          <input
            ref={unlockInputRef}
            value={unlockCode}
            onChange={event => updateUnlockCode(event.target.value)}
            onKeyDown={event => {
              if (event.key !== 'Escape') return;
              setUnlockingId(null);
              setUnlockCode('');
              setUnlockError(false);
              editorRef.current?.focus({ preventScroll: true });
            }}
            onBlur={finalizeBlur}
            type="password"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={4}
            placeholder="Code"
            className={`min-w-0 flex-1 border-0 bg-transparent px-1 text-sm font-semibold tracking-[0.2em] text-stone-700 outline-none ${unlockError ? 'text-red-600' : ''}`}
            style={{ fontSize: 16, colorScheme: 'light' }}
            aria-label="Secret unlock code"
            aria-invalid={unlockError}
          />
          <button
            type="button"
            onPointerDown={event => event.preventDefault()}
            onClick={() => {
              setUnlockingId(null);
              setUnlockCode('');
              setUnlockError(false);
              editorRef.current?.focus({ preventScroll: true });
            }}
            className="flex h-6 w-6 items-center justify-center text-base leading-none text-stone-400"
            aria-label="Close unlock prompt"
          >
            ×
          </button>
        </div>
      )}

      {canResize && (
        <button
          type="button"
          onClick={toggleResize}
          className="absolute bottom-1 right-1 flex h-6 w-6 touch-none items-end justify-end rounded-md text-stone-300 hover:bg-stone-100 hover:text-stone-500 sm:hidden"
          aria-label={expanded ? 'Shrink note' : 'Expand note'}
          title={expanded ? 'Shrink note' : 'Expand note'}
        >
          <span className="mb-1 mr-1 block h-3 w-3 border-b-2 border-r-2 border-current" />
        </button>
      )}
    </div>
  );
}
