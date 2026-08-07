import type { Theme } from "./themes";

export type ItemType = "text" | "image" | "rect" | "arrow";

export interface CanvasItem {
  _id: string;
  _creationTime: number;
  type: ItemType;
  x: number;
  y: number;
  width?: number;
  height?: number;
  content: string;
  color?: string;
  fontFamily?: string;
  fontSize?: number;
  zIndex?: number;
}

export type { Theme };

export interface BoardViewport {
  scale: number;
  position: { x: number; y: number };
  showGrid: boolean;
  hasInteracted: boolean;
  undoStack: CanvasItem[][];
  redoStack: CanvasItem[][];
}

export const defaultViewport = (): BoardViewport => ({
  scale: 1,
  position: { x: 0, y: 0 },
  showGrid: false,
  hasInteracted: false,
  undoStack: [],
  redoStack: [],
});
