import React, { forwardRef } from 'react';
import { Image as KonvaImage } from 'react-konva';
import useImage from 'use-image';

interface Props {
  id: string;
  x: number;
  y: number;
  url: string;
  draggable: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onPointerDown: (e: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onDragEnd: (e: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onTransformEnd: (e: any) => void;
  width?: number;
  height?: number;
}

const CanvasImage = forwardRef<any, Props>(({ id, x, y, url, draggable, onPointerDown, onDragEnd, onTransformEnd, width: storedWidth, height: storedHeight }, ref) => {
  const [image] = useImage(url);

  if (!image) return null;

  const width = storedWidth || image.width;
  const height = storedHeight || image.height;

  return (
    <KonvaImage
      ref={ref}
      id={id}
      x={x}
      y={y}
      image={image}
      width={width}
      height={height}
      draggable={draggable}
      onPointerDown={onPointerDown}
      onDragEnd={onDragEnd}
      onTransformEnd={onTransformEnd}
    />
  );
});

export default CanvasImage;
