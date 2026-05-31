import type { Capture } from "../../shared/types";

export type Point = { x: number; y: number };
export type Rect = { left: number; top: number; width: number; height: number };
export type InternalDrag = { kind: "capture"; captureId: string } | { kind: "group"; groupId: string };
export type DragPayload = { files: File[]; captures: Capture[]; captureIds: string[]; groupId?: string };

