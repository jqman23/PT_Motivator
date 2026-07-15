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
  onSubmit?: () => void;
  onFocus?: (event: React.FocusEvent<HTMLTextAreaElement>) => void;
  onBlur?: (event: React.FocusEvent<HTMLTextAreaElement>) => void;
};

type EditorSecretBlock = Extract<SecretNoteBlock, { type: 'secret' }> & { id: string };
type EditorAiBlock = Extract<SecretNoteBlock, { type: 'ai' }> & { id: string };
type EditorCommandBlock = EditorSecretBlock | EditorAiBlock;
type EditorBlock = Extract<SecretNoteBlock, { type: 'text' }> | EditorCommandBlock;
type PendingCaret = { blockId: string; position: 'inside-end' | 'before' | 'after' };
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

function AiIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 2.8l1.15 3.25L14.4 7.2l-3.25 1.15L10 11.6 8.85 8.35 5.6 7.2l3.25-1.15L10 2.8Z" />
      <path d="M15.2 12.1l.62 1.73 1.73.62-1.73.62-.62 1.73-.62-1.73-1.73-.62 1.73-.62.62-1.73Z" />
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
  let commandIndex = 0;
  return mergeEditorText(parseSecretNote(value).map(block => {
    if (block.type === 'text') return block;
    const next = { ...block, id: `${idPrefix}-initial-${commandIndex}` };
    commandIndex += 1;
    return next;
  }));
}

function ensureCommandIds(blocks: readonly SecretNoteBlock[], idPrefix: string): EditorBlock[] {
  let newCommandIndex = 0;
  return mergeEditorText(blocks.map(block => {
    if (block.type === 'text') return block;
    const possibleId = (block as Partial<EditorCommandBlock>).id;
    if (typeof possibleId === 'string') return { ...block, id: possibleId };
    const next = { ...block, id: `${idPrefix}-new-${newCommandIndex}` };
    newCommandIndex += 1;
    return next;
  }));
}

function serializeEditorBlocks(blocks: readonly EditorBlock[]) {
  return serializeSecretNote(blocks.map(block => {
    if (block.type === 'secret') return { type: 'secret', locked: block.locked, text: block.text };
    if (block.type === 'ai') return { type: 'ai', text: block.text };
    return block;
  }));
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
  const aiById = new Map(previous.filter((block): block is EditorAiBlock => block.type === 'ai').map(block => [block.id, block]));
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

    if (node.dataset.ai === 'true') {
      const id = node.dataset.commandId;
      if (!id || !aiById.has(id)) return;
      const content = node.querySelector<HTMLElement>('[data-ai-content="true"]');
      blocks.push({ type: 'ai', id, text: cleanText(content?.textContent ?? '') });
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
  const hasCommand = blocks.some(block => block.type !== 'text');
  const hasTextNodeContent = cleanText(root.textContent ?? '').length > 0;
  if (!hasCommand && !hasTextNodeContent && root.querySelector('br')) return [{ type: 'text', text: '' }];
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

function isCaretScaffolding(node: Node | null) {
  return node?.nodeType === Node.COMMENT_NODE
    || (node?.nodeType === Node.TEXT_NODE && !cleanText(node.textContent ?? ''));
}

function commandAtDeletionBoundary(root: HTMLDivElement, direction: 'backward' | 'forward') {
  const selection = window.getSelection();
  if (!selection?.isCollapsed || !selection.anchorNode) return null;

  const anchorElement = selection.anchorNode instanceof HTMLElement
    ? selection.anchorNode
    : selection.anchorNode.parentElement;
  const commandContent = anchorElement?.closest<HTMLElement>('[data-command-content="true"]');
  if (commandContent && root.contains(commandContent) && !cleanText(commandContent.textContent ?? '')) {
    return commandContent.closest<HTMLElement>('[data-command="true"]')?.dataset.commandId ?? null;
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
  return candidate.dataset.commandBoundary === expectedBoundary ? candidate.dataset.commandId ?? null : null;
}

function openSecretAtCaret(root: HTMLDivElement) {
  const selection = window.getSelection();
  if (!selection?.anchorNode) return null;
  const anchorElement = selection.anchorNode instanceof HTMLElement
    ? selection.anchorNode
    : selection.anchorNode.parentElement;
  const secret = anchorElement?.closest<HTMLElement>('[data-secret="true"][data-locked="false"]');
  return secret && root.contains(secret) ? secret.dataset.secretId ?? null : null;
}

function aiAtCaret(root: HTMLDivElement) {
  const selection = window.getSelection();
  if (!selection?.anchorNode) return null;
  const anchorElement = selection.anchorNode instanceof HTMLElement
    ? selection.anchorNode
    : selection.anchorNode.parentElement;
  const ai = anchorElement?.closest<HTMLElement>('[data-ai="true"]');
  return ai && root.contains(ai) ? ai.dataset.commandId ?? null : null;
}

function emptyCommandAtCaret(root: HTMLDivElement) {
  const selection = window.getSelection();
  if (!selection?.isCollapsed || !selection.anchorNode) return false;
  const anchorElement = selection.anchorNode instanceof HTMLElement
    ? selection.anchorNode
    : selection.anchorNode.parentElement;
  const content = anchorElement?.closest<HTMLElement>('[data-command-content="true"]');
  return Boolean(content && root.contains(content) && !cleanText(content.textContent ?? ''));
}

function commandContentEmptiedByDeletion(root: HTMLDivElement, direction: 'backward' | 'forward') {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !selection.anchorNode) return null;
  const anchorElement = selection.anchorNode instanceof HTMLElement
    ? selection.anchorNode
    : selection.anchorNode.parentElement;
  const content = anchorElement?.closest<HTMLElement>('[data-command-content="true"]');
  const command = content?.closest<HTMLElement>('[data-command="true"]');
  if (!content || !command || !root.contains(command)) return null;

  const fullText = cleanText(content.textContent ?? '');
  if (!fullText) return null;
  const selectedRange = selection.getRangeAt(0);
  if (!selectedRange.collapsed) {
    return cleanText(selectedRange.toString()) === fullText ? content : null;
  }

  const beforeRange = document.createRange();
  beforeRange.selectNodeContents(content);
  beforeRange.setEnd(selection.anchorNode, selection.anchorOffset);
  const afterRange = document.createRange();
  afterRange.selectNodeContents(content);
  afterRange.setStart(selection.anchorNode, selection.anchorOffset);
  const before = cleanText(beforeRange.toString());
  const after = cleanText(afterRange.toString());
  const deletesLastCharacter = direction === 'backward'
    ? Array.from(before).length === 1 && !after
    : !before && Array.from(after).length === 1;
  return deletesLastCharacter ? content : null;
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

export default function SecretTextarea({ value, onChange, placeholder, rows = 2, className = '', style, autoFocus, onSubmit, onFocus, onBlur }: Props) {
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
    const command = editor?.querySelector<HTMLElement>(`[data-command="true"][data-command-id="${pending.blockId}"]`);
    if (!editor || !command) return;

    const target = pending.position === 'inside-end'
      ? command.querySelector<HTMLElement>('[data-command-content="true"]')
      : editor.querySelector<HTMLElement>(`[data-command-boundary="${pending.position}"][data-command-id="${pending.blockId}"]`);
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
      const previousById = new Map(modelRef.current
        .filter((block): block is EditorCommandBlock => block.type !== 'text')
        .map(block => [block.id, block]));
      const separated = current.find(block => block.type !== 'text'
        && /^ /.test(block.text)
        && !previousById.get(block.id)?.text);
      if (separated && separated.type !== 'text') {
        const next = current.map(block => block === separated ? { ...block, text: block.text.slice(1) } : block);
        replaceEditor(next, { blockId: separated.id, position: 'inside-end' });
        return;
      }
      const command = applyNoteSlashCommand(current);
      if (command.changed) {
        const next = ensureCommandIds(command.blocks, `${editorId}-${renderState.revision + 1}`);
        const target = command.insertedBlockIndex === undefined ? undefined : next[command.insertedBlockIndex];
        replaceEditor(next, target && target.type !== 'text' ? { blockId: target.id, position: 'inside-end' } : undefined);
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

  const removeCommandWithoutRemount = (blockId: string) => {
    const editor = editorRef.current;
    if (!editor) return false;
    const before = editor.querySelector<HTMLElement>(`[data-command-boundary="before"][data-command-id="${blockId}"]`);
    const command = editor.querySelector<HTMLElement>(`[data-command="true"][data-command-id="${blockId}"]`);
    const after = editor.querySelector<HTMLElement>(`[data-command-boundary="after"][data-command-id="${blockId}"]`);
    if (!before || !command || !after) return false;

    const pageScroll = { x: window.scrollX, y: window.scrollY };
    const editorScroll = { left: editor.scrollLeft, top: editor.scrollTop };
    let firstRemoved: Node = before;
    while (isCaretScaffolding(firstRemoved.previousSibling)) {
      firstRemoved = firstRemoved.previousSibling!;
    }
    let lastRemoved: Node = after;
    while (isCaretScaffolding(lastRemoved.nextSibling)) {
      lastRemoved = lastRemoved.nextSibling!;
    }
    if (firstRemoved.previousSibling instanceof Text) {
      firstRemoved.previousSibling.data = firstRemoved.previousSibling.data.replace(/\u200b+$/g, '');
    }
    if (lastRemoved.nextSibling instanceof Text) {
      lastRemoved.nextSibling.data = lastRemoved.nextSibling.data.replace(/^\u200b+/g, '');
    }
    const previousText = firstRemoved.previousSibling?.nodeType === Node.TEXT_NODE
      && cleanText(firstRemoved.previousSibling.textContent ?? '')
      ? firstRemoved.previousSibling as Text
      : null;
    const nextText = lastRemoved.nextSibling?.nodeType === Node.TEXT_NODE
      && cleanText(lastRemoved.nextSibling.textContent ?? '')
      ? lastRemoved.nextSibling as Text
      : null;

    const range = document.createRange();
    range.setStartBefore(firstRemoved);
    range.setEndAfter(lastRemoved);
    range.deleteContents();
    if (previousText?.isConnected) {
      range.setStart(previousText, previousText.length);
    } else if (nextText?.isConnected) {
      range.setStart(nextText, 0);
    } else {
      const caret = document.createTextNode(CARET_ANCHOR);
      range.insertNode(caret);
      range.setStart(caret, CARET_ANCHOR.length);
    }
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

  const preserveEmptyCommand = (direction: 'backward' | 'forward') => {
    const editor = editorRef.current;
    if (!editor) return false;
    const content = commandContentEmptiedByDeletion(editor, direction);
    if (!content) return false;

    const pageScroll = { x: window.scrollX, y: window.scrollY };
    const editorScroll = { left: editor.scrollLeft, top: editor.scrollTop };
    const caret = document.createTextNode(CARET_ANCHOR);
    content.replaceChildren(caret);
    const range = document.createRange();
    range.setStart(caret, CARET_ANCHOR.length);
    range.collapse(true);
    editor.focus({ preventScroll: true });
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    emit(readEditorBlocks(editor, modelRef.current));

    const restoreScroll = () => {
      editor.scrollLeft = editorScroll.left;
      editor.scrollTop = editorScroll.top;
      if (window.scrollX !== pageScroll.x || window.scrollY !== pageScroll.y) window.scrollTo(pageScroll.x, pageScroll.y);
    };
    restoreScroll();
    window.requestAnimationFrame(() => {
      restoreScroll();
      window.requestAnimationFrame(restoreScroll);
    });
    return true;
  };

  const handleBoundaryDeletion = (direction: 'backward' | 'forward') => {
    const editor = editorRef.current;
    if (!editor) return false;
    const blockId = commandAtDeletionBoundary(editor, direction);
    return blockId ? removeCommandWithoutRemount(blockId) : false;
  };

  const lockSecret = (secretId: string) => {
    const current = readCurrent();
    const next = current.map(block => block.type === 'secret' && block.id === secretId
      ? { ...block, locked: true }
      : block);
    setUnlockingId(null);
    setUnlockCode('');
    setUnlockError(false);
    replaceEditor(next, { blockId: secretId, position: 'after' });
  };

  const lockOpenSecretAtCaret = () => {
    const editor = editorRef.current;
    if (!editor) return false;
    const secretId = openSecretAtCaret(editor);
    if (!secretId) return false;
    lockSecret(secretId);
    return true;
  };

  const exitAiAtCaret = () => {
    const editor = editorRef.current;
    if (!editor) return false;
    const blockId = aiAtCaret(editor);
    if (!blockId) return false;
    const boundary = editor.querySelector<HTMLElement>(`[data-command-boundary="after"][data-command-id="${blockId}"]`);
    if (!boundary) return false;
    const range = document.createRange();
    range.setStartAfter(boundary);
    range.collapse(true);
    editor.focus({ preventScroll: true });
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    return true;
  };

  const handleEnter = (submit: boolean) => {
    if (lockOpenSecretAtCaret() || exitAiAtCaret()) return;
    if (submit && onSubmit) onSubmit();
    else handlePlainTextInsertion('\n');
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
    replaceEditor(next, { blockId: secretId, position: 'inside-end' });
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
          const nativeEvent = event.nativeEvent as InputEvent;
          const inputType = nativeEvent.inputType;
          if (inputType === 'insertText' && nativeEvent.data === ' ' && editorRef.current && emptyCommandAtCaret(editorRef.current)) {
            event.preventDefault();
            typingScrollRef.current = null;
            return;
          }
          if (inputType === 'deleteContentBackward' && handleBoundaryDeletion('backward')) {
            event.preventDefault();
            typingScrollRef.current = null;
            return;
          }
          if (inputType === 'deleteContentBackward' && preserveEmptyCommand('backward')) {
            event.preventDefault();
            typingScrollRef.current = null;
            return;
          }
          if (inputType === 'deleteContentForward' && handleBoundaryDeletion('forward')) {
            event.preventDefault();
            typingScrollRef.current = null;
            return;
          }
          if (inputType === 'deleteContentForward' && preserveEmptyCommand('forward')) {
            event.preventDefault();
            typingScrollRef.current = null;
            return;
          }
          if (inputType !== 'insertParagraph' && inputType !== 'insertLineBreak') return;
          event.preventDefault();
          handleEnter(inputType === 'insertParagraph');
          stabilizeScrollAfterTyping();
        }}
        onKeyDown={event => {
          if (!typingScrollRef.current) captureScrollBeforeTyping();
          if (event.key === 'Backspace' && handleBoundaryDeletion('backward')) {
            event.preventDefault();
            typingScrollRef.current = null;
            return;
          }
          if (event.key === 'Backspace' && preserveEmptyCommand('backward')) {
            event.preventDefault();
            typingScrollRef.current = null;
            return;
          }
          if (event.key === 'Delete' && handleBoundaryDeletion('forward')) {
            event.preventDefault();
            typingScrollRef.current = null;
            return;
          }
          if (event.key === 'Delete' && preserveEmptyCommand('forward')) {
            event.preventDefault();
            typingScrollRef.current = null;
            return;
          }
          if (event.key !== 'Enter') return;
          event.preventDefault();
          handleEnter(!event.shiftKey);
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
          <Fragment key={block.type !== 'text' ? block.id : `text-${index}`}>
            {block.type === 'text' ? block.text : (
              <>
                {CARET_ANCHOR}
                <span
                  data-command-boundary="before"
                  data-command-id={block.id}
                  data-secret-boundary="before"
                  data-secret-id={block.type === 'secret' ? block.id : undefined}
                  contentEditable={false}
                  aria-hidden="true"
                  className="inline-block w-0 overflow-hidden align-baseline leading-none"
                >
                  {CARET_ANCHOR}
                </span>
                {block.type === 'ai' ? (
                  <span
                    data-command="true"
                    data-command-id={block.id}
                    data-ai="true"
                    className="ai-note-instruction mx-0.5 inline align-baseline text-[#4D6678]"
                  >
                    <span
                      contentEditable={false}
                      aria-hidden="true"
                      className="mr-0.5 inline-flex h-4 w-4 items-center justify-center align-[-0.12em] text-[#648399]"
                    >
                      <AiIcon />
                    </span>
                    <span
                      data-command-content="true"
                      data-ai-content="true"
                      className="ai-note-instruction-content outline-none"
                    >
                      {block.text || CARET_ANCHOR}
                    </span>
                  </span>
                ) : block.locked ? (
                  <span
                    data-command="true"
                    data-command-id={block.id}
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
                        removeCommandWithoutRemount(block.id);
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
                  <span data-command="true" data-command-id={block.id} data-secret="true" data-secret-id={block.id} data-locked="false" className="secret-note-open">
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
                          removeCommandWithoutRemount(block.id);
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
                      data-command-content="true"
                      data-secret-content="true"
                      className="secret-note-open-content outline-none"
                      style={{ boxShadow: 'inset 0 -0.32em rgb(126 155 134 / 0.16)' }}
                    >
                      {block.text || CARET_ANCHOR}
                    </span>
                  </span>
                )}
                <span
                  data-command-boundary="after"
                  data-command-id={block.id}
                  data-secret-boundary="after"
                  data-secret-id={block.type === 'secret' ? block.id : undefined}
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
