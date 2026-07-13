export const SECRET_UNLOCK_CODE = '9334';

const SECRET_START = '\u27e6secret:';
const SECRET_END = '\u27e6/secret\u27e7';
const SECRET_BLOCK_RE = /\u27e6secret:(locked|open)\u27e7([\s\S]*?)\u27e6\/secret\u27e7/g;

export type SecretNoteBlock =
  | { type: 'text'; text: string }
  | { type: 'secret'; locked: boolean; text: string };

export function makeSecretBlock(text = '', locked = true) {
  return `${SECRET_START}${locked ? 'locked' : 'open'}\u27e7${text}${SECRET_END}`;
}

export function parseSecretNote(value: string): SecretNoteBlock[] {
  const blocks: SecretNoteBlock[] = [];
  let index = 0;
  for (const match of value.matchAll(SECRET_BLOCK_RE)) {
    const start = match.index ?? 0;
    if (start > index) blocks.push({ type: 'text', text: value.slice(index, start) });
    blocks.push({ type: 'secret', locked: match[1] === 'locked', text: match[2] ?? '' });
    index = start + match[0].length;
  }
  if (index < value.length || blocks.length === 0) blocks.push({ type: 'text', text: value.slice(index) });
  return blocks;
}

export function serializeSecretNote(blocks: SecretNoteBlock[]) {
  return blocks.map(block => block.type === 'secret' ? makeSecretBlock(block.text, block.locked) : block.text).join('');
}

export function stripSecretNotes(value: string | null | undefined) {
  if (!value) return '';
  return value.replace(SECRET_BLOCK_RE, '').replace(/\n{3,}/g, '\n\n').trim();
}

export function hasSecretNotes(value: string | null | undefined) {
  return Boolean(value && value.includes(SECRET_START));
}
