import type { SecretNoteBlock } from './secretNotes';

type NoteSlashCommand = {
  name: string;
  createBlocks: (argument: string) => SecretNoteBlock[];
};

export type NoteSlashCommandResult = {
  blocks: SecretNoteBlock[];
  changed: boolean;
  commandName?: string;
  insertedBlockIndex?: number;
};

// New inline commands belong here so every note editor shares one parser and trigger shape.
export const NOTE_SLASH_COMMANDS: readonly NoteSlashCommand[] = [
  {
    name: 'secret',
    createBlocks: argument => [{ type: 'secret', locked: false, text: argument }],
  },
  {
    name: 'ai',
    createBlocks: argument => [{ type: 'ai', text: argument }],
  },
];

const commandByName = new Map(NOTE_SLASH_COMMANDS.map(command => [command.name, command]));
const commandNames = NOTE_SLASH_COMMANDS.map(command => command.name).sort((a, b) => b.length - a.length).join('|');
const commandPattern = new RegExp(`(^|[^a-z0-9_/])\\/(${commandNames})(?=$|[\\t \\n])`, 'i');

export function applyNoteSlashCommand(blocks: readonly SecretNoteBlock[]): NoteSlashCommandResult {
  for (let blockIndex = blocks.length - 1; blockIndex >= 0; blockIndex -= 1) {
    const block = blocks[blockIndex];
    if (block.type !== 'text') continue;

    const match = commandPattern.exec(block.text);
    if (!match || match.index === undefined) continue;

    const commandName = match[2].toLowerCase();
    const command = commandByName.get(commandName)!;

    const commandStart = match.index + match[1].length;
    const commandEnd = match.index + match[0].length;
    const textBeforeCommand = block.text.slice(0, commandStart);
    const suffix = block.text.slice(commandEnd);
    const separator = suffix.match(/^[\t ]+/)?.[0] ?? '';
    const argumentAndAfter = suffix.slice(separator.length);
    const lineEnd = argumentAndAfter.indexOf('\n');
    const argument = separator ? argumentAndAfter.slice(0, lineEnd < 0 ? undefined : lineEnd) : '';
    const textAfterCommand = separator
      ? lineEnd < 0 ? '' : argumentAndAfter.slice(lineEnd)
      : suffix;
    const inserted = command.createBlocks(argument);
    const replacement: SecretNoteBlock[] = [
      ...(textBeforeCommand ? [{ type: 'text' as const, text: textBeforeCommand }] : []),
      ...inserted,
      ...(textAfterCommand ? [{ type: 'text' as const, text: textAfterCommand }] : []),
    ];
    const insertedBlockIndex = blockIndex + (textBeforeCommand ? 1 : 0);

    return {
      blocks: [
        ...blocks.slice(0, blockIndex),
        ...replacement,
        ...blocks.slice(blockIndex + 1),
      ],
      changed: true,
      commandName,
      insertedBlockIndex,
    };
  }

  return { blocks: [...blocks], changed: false };
}
