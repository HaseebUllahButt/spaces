import type { CanvasItem, ImageCrop } from "./types";

/**
 * Image edits are applied in a fixed order: crop the original picture, turn it,
 * then mirror what's on screen. The item's x/y/width/height always describe the
 * finished picture, so moving, resizing and selecting never need to know about edits.
 */

export const FULL_CROP: ImageCrop = { x: 0, y: 0, width: 1, height: 1 };

// Very large edited copies cost a lot of memory; this is plenty for a canvas.
const MAX_EDIT_SIZE = 4096;

type Edits = Pick<CanvasItem, "rotation" | "flipX" | "flipY" | "crop">;

const turns = (rotation = 0) => (((Math.round(rotation / 90) % 4) + 4) % 4);

export const hasImageEdits = (edits: Edits) =>
  turns(edits.rotation) !== 0 || Boolean(edits.flipX) || Boolean(edits.flipY) ||
  Boolean(edits.crop && (edits.crop.x > 0 || edits.crop.y > 0 || edits.crop.width < 1 || edits.crop.height < 1));

/** Original-picture point (0–1) → where it shows on screen (0–1). */
const orientPoint = (u: number, v: number, edits: Edits): [number, number] => {
  for (let i = 0; i < turns(edits.rotation); i++) [u, v] = [1 - v, u];
  if (edits.flipX) u = 1 - u;
  if (edits.flipY) v = 1 - v;
  return [u, v];
};

/** On-screen point (0–1) → point on the original picture (0–1). */
const unorientPoint = (u: number, v: number, edits: Edits): [number, number] => {
  if (edits.flipX) u = 1 - u;
  if (edits.flipY) v = 1 - v;
  for (let i = 0; i < turns(edits.rotation); i++) [u, v] = [v, 1 - u];
  return [u, v];
};

const mapRect = (rect: ImageCrop, map: (u: number, v: number) => [number, number]): ImageCrop => {
  const [ax, ay] = map(rect.x, rect.y);
  const [bx, by] = map(rect.x + rect.width, rect.y + rect.height);
  return { x: Math.min(ax, bx), y: Math.min(ay, by), width: Math.abs(bx - ax), height: Math.abs(by - ay) };
};

/** On-screen crop box (0–1 of the turned, uncropped picture) → crop on the original. */
export const screenCropToSource = (rect: ImageCrop, edits: Edits) =>
  mapRect(rect, (u, v) => unorientPoint(u, v, edits));

/** Where the whole, uncropped picture sits on the canvas for an image item. */
export const fullImageBox = (item: CanvasItem) => {
  const shown = mapRect(item.crop ?? FULL_CROP, (u, v) => orientPoint(u, v, item));
  const width = (item.width ?? 0) / shown.width;
  const height = (item.height ?? 0) / shown.height;
  return { x: item.x - shown.x * width, y: item.y - shown.y * height, width, height };
};

/** Draw the picture with its crop, turn and mirror baked in. Unedited pictures pass through. */
export const renderEditedImage = (image: HTMLImageElement, edits: Edits): HTMLImageElement | HTMLCanvasElement => {
  if (!hasImageEdits(edits)) return image;
  const crop = edits.crop ?? FULL_CROP;
  const sx = crop.x * image.naturalWidth;
  const sy = crop.y * image.naturalHeight;
  const sw = Math.max(1, crop.width * image.naturalWidth);
  const sh = Math.max(1, crop.height * image.naturalHeight);
  const fit = Math.min(1, MAX_EDIT_SIZE / Math.max(sw, sh));
  const dw = Math.round(sw * fit);
  const dh = Math.round(sh * fit);
  const sideways = turns(edits.rotation) % 2 === 1;
  const canvas = document.createElement("canvas");
  canvas.width = sideways ? dh : dw;
  canvas.height = sideways ? dw : dh;
  const ctx = canvas.getContext("2d");
  if (!ctx) return image;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.scale(edits.flipX ? -1 : 1, edits.flipY ? -1 : 1);
  ctx.rotate((turns(edits.rotation) * Math.PI) / 2);
  ctx.drawImage(image, sx, sy, sw, sh, -dw / 2, -dh / 2, dw, dh);
  return canvas;
};
