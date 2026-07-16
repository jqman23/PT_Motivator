export const SECRET_UNLOCK_CODE = '9334';

const SECRET_START = '\u27e6secret:';
const SECRET_END = '\u27e6/secret\u27e7';
const AI_START = '\u27e6ai\u27e7';
const AI_END = '\u27e6/ai\u27e7';
const NOTE_BLOCK_RE = /\u27e6secret:(locked|open)\u27e7([\s\S]*?)\u27e6\/secret\u27e7|\u27e6ai\u27e7([\s\S]*?)\u27e6\/ai\u27e7/g;

export type SecretNoteBlock =
  | { type: 'text'; text: string }
  | { type: 'secret'; locked: boolean; text: string }
  | { type: 'ai'; text: string };

export function makeSecretBlock(text = '', locked = true) {
  return `${SECRET_START}${locked ? 'locked' : 'open'}\u27e7${text}${SECRET_END}`;
}

export function makeAiInstructionBlock(text = '') {
  return `${AI_START}${text}${AI_END}`;
}

export function parseSecretNote(value: string): SecretNoteBlock[] {
  const blocks: SecretNoteBlock[] = [];
  let index = 0;
  for (const match of value.matchAll(NOTE_BLOCK_RE)) {
    const start = match.index ?? 0;
    if (start > index) blocks.push({ type: 'text', text: value.slice(index, start) });
    if (match[3] !== undefined) blocks.push({ type: 'ai', text: match[3] });
    else blocks.push({ type: 'secret', locked: match[1] === 'locked', text: match[2] ?? '' });
    index = start + match[0].length;
  }
  if (index < value.length || blocks.length === 0) blocks.push({ type: 'text', text: value.slice(index) });
  return blocks;
}

export function serializeSecretNote(blocks: SecretNoteBlock[]) {
  return blocks.map(block => {
    if (block.type === 'secret') return makeSecretBlock(block.text, block.locked);
    if (block.type === 'ai') return makeAiInstructionBlock(block.text);
    return block.text;
  }).join('');
}

export function stripSecretNotes(value: string | null | undefined) {
  if (!value) return '';
  // Inline command payloads are metadata, not visible note prose. Secret payloads remain private,
  // while AI guidance is exposed only through extractAiInstructions().
  return value.replace(NOTE_BLOCK_RE, '').replace(/\n{3,}/g, '\n\n').trim();
}

export function noteTextForAi(value: string | null | undefined, options?: { includeSecrets?: boolean }) {
  if (!value) return '';
  return parseSecretNote(value).map(block => {
    if (block.type === 'ai') return '';
    if (block.type === 'secret') return options?.includeSecrets ? block.text : '';
    return block.text;
  }).join('').replace(/\n{3,}/g, '\n\n').trim();
}

export function extractAiInstructions(value: string | null | undefined) {
  if (!value) return [];
  return parseSecretNote(value)
    .filter((block): block is Extract<SecretNoteBlock, { type: 'ai' }> => block.type === 'ai')
    .map(block => block.text.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

export function aiInstructionsAllowSecretNotes(instructions: string[]) {
  return instructions.some(instruction => {
    const clean = instruction.toLowerCase().replace(/\s+/g, ' ').trim();
    const mentionsSecret = /\b(?:secret|private|hidden|locked)\b/.test(clean);
    const allowsUse = /\b(?:include|use|look at|read|access|consider|permission|allow|allowed|may|can)\b/.test(clean);
    const deniesUse = /\b(?:do not|don't|dont|never|without|exclude|ignore|redact)\b.{0,40}\b(?:secret|private|hidden|locked)\b/.test(clean)
      || /\b(?:not|don't|dont|never)\b.{0,30}\b(?:include|use|look at|read|access|consider)\b.{0,40}\b(?:secret|private|hidden|locked)\b/.test(clean)
      || /\b(?:secret|private|hidden|locked)\b.{0,40}\b(?:off|exclude|ignore|redact)\b/.test(clean);
    return mentionsSecret && allowsUse && !deniesUse;
  });
}

export function hasSecretNotes(value: string | null | undefined) {
  return Boolean(value && value.includes(SECRET_START));
}

export function hasAiInstructions(value: string | null | undefined) {
  return Boolean(value && value.includes(AI_START));
}
