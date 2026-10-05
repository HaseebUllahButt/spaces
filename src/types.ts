import type { Theme } from "./themes";

export type ItemType = "text" | "image" | "rect" | "arrow" | "connector" | "frame" | "sticky";

/** Attachment side on a rectangle for linked connectors. */
export type PortSide = "n" | "e" | "s" | "w";

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
  /** Connector: source node id */
  fromId?: string;
  /** Connector: target node id */
  toId?: string;
  /** Connector: port on source */
  fromPort?: PortSide;
  /** Connector: port on target */
  toPort?: PortSide;
  /**
   * Connector: optional intermediate bend points as flat [x,y,x,y,...] in world space.
   * Empty / missing → auto orthogonal route between ports.
   */
  waypoints?: number[];
  /** Connector: show an arrowhead when true (default). */
  directed?: boolean;
  /** Frame id for items that move as a persistent group. */
  groupId?: string;
  /** Convex storage id for full-resolution images. */
  storageId?: string;
  /** Image: turned clockwise in 90° steps. */
  rotation?: number;
  /** Image: mirrored left–right / top–bottom on screen. */
  flipX?: boolean;
  flipY?: boolean;
  /** Image: the part of the original picture that's kept, as 0–1 fractions. */
  crop?: ImageCrop;
}

export interface ImageCrop {
  x: number;
  y: number;
  width: number;
  height: number;
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
