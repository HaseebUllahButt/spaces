import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Group, Image as KonvaImage, Rect, Transformer } from 'react-konva';
import type Konva from 'konva';
import useImage from 'use-image';
import { FULL_CROP, fullImageBox, renderEditedImage } from '../imageEdits';
import type { CanvasItem } from '../types';

export interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ImageCropperHandle {
  /** The kept area, in canvas coordinates. */
  getBox: () => CropBox;
  /** Go back to the whole picture. */
  reset: () => void;
}

interface Props {
  item: CanvasItem;
  accentColor: string;
  surfaceColor: string;
  scale: number;
}

const MIN_SIZE = 8;

/**
 * Crop mode for one image: the whole picture is shown faded, and a box you can
 * move and resize marks the part that's kept.
 */
const ImageCropper = forwardRef<ImageCropperHandle, Props>(({ item, accentColor, surfaceColor, scale }, ref) => {
  const [image] = useImage(item.content);
  // The turned and mirrored picture, without its current crop.
  const full = useMemo(
    () => image && renderEditedImage(image, { rotation: item.rotation, flipX: item.flipX, flipY: item.flipY, crop: FULL_CROP }),
    [image, item.rotation, item.flipX, item.flipY],
  );
  const area = fullImageBox(item);
  const [box, setBox] = useState<CropBox>({
    x: item.x, y: item.y, width: item.width ?? area.width, height: item.height ?? area.height,
  });
  const rectRef = useRef<Konva.Rect>(null);
  const trRef = useRef<Konva.Transformer>(null);

  useImperativeHandle(ref, () => ({
    getBox: () => box,
    reset: () => setBox({ ...area }),
  }));

  useEffect(() => {
    if (trRef.current && rectRef.current) {
      trRef.current.nodes([rectRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [full]);

  if (!full) return null;

  // Keep the box on the picture while it's dragged.
  const syncFromDrag = () => {
    const node = rectRef.current;
    if (!node) return;
    const x = Math.min(Math.max(node.x(), area.x), area.x + area.width - box.width);
    const y = Math.min(Math.max(node.y(), area.y), area.y + area.height - box.height);
    node.position({ x, y });
    setBox({ ...box, x, y });
  };

  // Turn the resize handles' stretch into a real size.
  const syncFromResize = () => {
    const node = rectRef.current;
    if (!node) return;
    const width = node.width() * node.scaleX();
    const height = node.height() * node.scaleY();
    node.scale({ x: 1, y: 1 });
    node.size({ width, height });
    setBox({ x: node.x(), y: node.y(), width, height });
  };

  return (
    <Group>
      <KonvaImage image={full} {...area} opacity={0.35} listening={false} />
      <Group clipX={box.x} clipY={box.y} clipWidth={box.width} clipHeight={box.height} listening={false}>
        <KonvaImage image={full} {...area} />
      </Group>
      <Rect
        ref={rectRef}
        {...box}
        fill="rgba(0,0,0,0.001)"
        stroke={accentColor}
        strokeWidth={1.5 / scale}
        draggable
        onPointerDown={(e) => { e.cancelBubble = true; }}
        onClick={(e) => { e.cancelBubble = true; }}
        onDragMove={(e) => { e.cancelBubble = true; syncFromDrag(); }}
        onDragEnd={(e) => { e.cancelBubble = true; syncFromDrag(); }}
        onTransform={syncFromResize}
        onTransformEnd={syncFromResize}
      />
      <Transformer
        ref={trRef}
        rotateEnabled={false}
        flipEnabled={false}
        keepRatio={false}
        borderEnabled={false}
        anchorSize={10}
        anchorCornerRadius={2}
        anchorStroke={accentColor}
        anchorFill={surfaceColor}
        boundBoxFunc={(oldBox, newBox) => {
          // Boxes here are in screen pixels; clamp them to the picture's edges.
          const layer = rectRef.current?.getLayer();
          if (!layer) return oldBox;
          const t = layer.getAbsoluteTransform();
          const tl = t.point({ x: area.x, y: area.y });
          const br = t.point({ x: area.x + area.width, y: area.y + area.height });
          const left = Math.max(newBox.x, tl.x);
          const top = Math.max(newBox.y, tl.y);
          const right = Math.min(newBox.x + newBox.width, br.x);
          const bottom = Math.min(newBox.y + newBox.height, br.y);
          if (right - left < MIN_SIZE || bottom - top < MIN_SIZE) return oldBox;
          return { ...newBox, x: left, y: top, width: right - left, height: bottom - top };
        }}
      />
    </Group>
  );
});

export default ImageCropper;
