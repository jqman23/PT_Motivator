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
];

const commandByName = new Map(NOTE_SLASH_COMMANDS.map(command => [command.name, command]));
const commandPattern = /(^|\n)\/([a-z][a-z0-9-]*)(?:[\t ]+([^\n]*))?$/i;

export function applyNoteSlashCommand(blocks: readonly SecretNoteBlock[]): NoteSlashCommandResult {
  for (let blockIndex = blocks.length - 1; blockIndex >= 0; blockIndex -= 1) {
    const block = blocks[blockIndex];
    if (block.type !== 'text') continue;

    const match = commandPattern.exec(block.text);
    if (!match || match.index === undefined) continue;

    const commandName = match[2].toLowerCase();
    const command = commandByName.get(commandName);
    if (!command) return { blocks: [...blocks], changed: false };

    const commandStart = match.index + match[1].length;
    const textBeforeCommand = block.text.slice(0, commandStart);
    const inserted = command.createBlocks(match[3] ?? '');
    const replacement: SecretNoteBlock[] = [
      ...(textBeforeCommand ? [{ type: 'text' as const, text: textBeforeCommand }] : []),
      ...inserted,
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
