import type { Id } from "../convex/_generated/dataModel";

export type ItemType = 'text' | 'image';

export interface CanvasItem {
  _id: Id<"items">;
  _creationTime: number;
  type: ItemType;
  x: number;
  y: number;
  width?: number;
  height?: number;
  content: string; // text content or image URL base64
  color?: string; // custom color for this specific item
  fontFamily?: string; // custom font for this specific item
}

export interface Theme {
  id: string;
  name: string;
  backgroundColor: string;
  textColor: string;
  accentColor: string;
  fontFamily: string;
}
