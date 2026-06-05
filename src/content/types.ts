import type { Capture, RailOrderItem } from "../../shared/types";

export type Point = { x: number; y: number };
export type Rect = { left: number; top: number; width: number; height: number };
export type InternalDrag = { kind: "capture"; captureId: string } | { kind: "group"; groupId: string };
export type DragPayload = { files: File[]; captures: Capture[]; captureIds: string[]; groupId?: string };
export type RailDropIntent =
  | { scope: "rail"; action: "insert-before" | "insert-after"; target: RailOrderItem }
  | { scope: "rail"; action: "create-folder"; target: { kind: "capture"; id: string } }
  | { scope: "rail"; action: "add-to-folder"; target: { kind: "group"; id: string } }
  | { scope: "folder"; action: "insert-before" | "insert-after"; groupId: string; targetCaptureId: string }
  | { scope: "folder"; action: "add-to-folder"; groupId: string; targetCaptureId: string };
