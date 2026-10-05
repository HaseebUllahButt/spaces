import { forwardRef, useMemo } from 'react';
import { Image as KonvaImage } from 'react-konva';
import useImage from 'use-image';
import { renderEditedImage } from '../imageEdits';
import type { ImageCrop } from '../types';

interface Props {
  id: string;
  x: number;
  y: number;
  url: string;
  draggable: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onPointerDown: (e: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onDragStart?: (e: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onDragMove?: (e: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onDragEnd: (e: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onTransformEnd?: (e: any) => void;
  width?: number;
  height?: number;
  rotation?: number;
  flipX?: boolean;
  flipY?: boolean;
  crop?: ImageCrop;
}

const CanvasImage = forwardRef<any, Props>(({ id, x, y, url, draggable, onPointerDown, onDragStart, onDragMove, onDragEnd, onTransformEnd, width: storedWidth, height: storedHeight, rotation, flipX, flipY, crop }, ref) => {
  const [image] = useImage(url);
  // Rebuild the edited picture only when the image or its edits change.
  const shown = useMemo(
    () => image && renderEditedImage(image, { rotation, flipX, flipY, crop }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [image, rotation, flipX, flipY, crop?.x, crop?.y, crop?.width, crop?.height],
  );

  if (!shown) return null;

  const width = storedWidth || shown.width;
  const height = storedHeight || shown.height;

  return (
    <KonvaImage
      ref={ref}
      id={id}
      x={x}
      y={y}
      image={shown}
      width={width}
      height={height}
      draggable={draggable}
      onPointerDown={onPointerDown}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onTransformEnd={onTransformEnd}
    />
  );
});

export default CanvasImage;
