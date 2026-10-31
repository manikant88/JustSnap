import { FOLDER_COLOR_SLOT_COUNT } from "../../shared/folderColor";

export type FolderTone = {
  surface: string;
  border: string;
};

// Six strongly differentiated primary colors followed by six overflow colors.
// The order is adapted from IBM Carbon's categorical palette for neighboring
// contrast while keeping Docksnip's resting surfaces quieter than its borders.
export const FOLDER_TONE_NAMES = [
  "purple",
  "cyan",
  "teal",
  "magenta",
  "coral-red",
  "green",
  "blue",
  "gold",
  "pink",
  "deep-red",
  "aqua",
  "orange"
] as const;

const FOLDER_TONES: readonly FolderTone[] = [
  { surface: "#563e7f", border: "#a56eff" },
  { surface: "#235c7f", border: "#33b1ff" },
  { surface: "#106160", border: "#08bdba" },
  { surface: "#773150", border: "#ee5396" },
  { surface: "#7f474a", border: "#ff8389" },
  { surface: "#2a623a", border: "#42be65" },
  { surface: "#2b4a7f", border: "#4589ff" },
  { surface: "#796318", border: "#f1c21b" },
  { surface: "#7f455e", border: "#ff7eb6" },
  { surface: "#75272c", border: "#fa4d56" },
  { surface: "#286f6e", border: "#3ddbd9" },
  { surface: "#75401f", border: "#ff832b" }
];

if (FOLDER_TONES.length !== FOLDER_COLOR_SLOT_COUNT || FOLDER_TONE_NAMES.length !== FOLDER_COLOR_SLOT_COUNT) {
  throw new Error("Folder color palette must match the domain color-slot count.");
}

export function folderToneForSlot(colorSlot: number): FolderTone {
  const normalizedSlot = Number.isInteger(colorSlot)
    ? ((colorSlot % FOLDER_TONES.length) + FOLDER_TONES.length) % FOLDER_TONES.length
    : 0;
  return FOLDER_TONES[normalizedSlot];
}

export function folderToneForId(id: string): FolderTone {
  return folderToneForSlot(stableHash(id));
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
