import React, { useEffect, useLayoutEffect, useRef } from "react";
import { Stage, Layer, Text as KonvaText, Rect, Arrow, Transformer, Group, Circle } from "react-konva";
import type Konva from "konva";
import {
  MousePointer2,
  Type,
  Square,
  ArrowUpRight,
  LayoutGrid,
  SlidersHorizontal,
  GitCommitHorizontal,
  Layers,
  Paintbrush,
  Presentation,
  Crop,
  RotateCcw,
  RotateCw,
  FlipHorizontal2,
  FlipVertical2,
} from "lucide-react";
import { useStore } from "./store";
import CanvasImage from "./components/CanvasImage";
import ImageCropper, { type ImageCropperHandle } from "./components/ImageCropper";
import { FULL_CROP, fullImageBox, screenCropToSource } from "./imageEdits";
import ThemePanel from "./components/ThemePanel";
import CheckpointPanel from "./components/CheckpointPanel";
import LayersPanel from "./components/LayersPanel";
import BoardSwitcher from "./components/BoardSwitcher";
import { useBoardBootstrap } from "./hooks/useBoardBootstrap";
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { applyThemeToDocument } from "./themes";
import { defaultViewport, type CanvasItem, type PortSide } from "./types";
import {
  connectorPoints,
  buildConnectorRoutes,
  nearestPort,
  pathMidpoint,
  pointsBounds,
} from "./connectorUtils";

const EMPTY_ARRAY: CanvasItem[] = [];
const DEFAULT_TEXT_WIDTH = 360;
const DEFAULT_TEXT_HEIGHT = 56;
const BASE_FONT_SIZE = 20;

type TextDraft = { _id?: string; x: number; y: number; fontSize?: number; content: string };
const textDraftKey = (boardId: string) => `curate:text-draft:${boardId}`;

/** Text still being typed, kept in this browser so a refresh doesn't lose it. */
const readTextDraft = (boardId: string): TextDraft | null => {
  try {
    const raw = localStorage.getItem(textDraftKey(boardId));
    return raw ? (JSON.parse(raw) as TextDraft) : null;
  } catch {
    return null;
  }
};
const writeTextDraft = (boardId: string, draft: TextDraft | null) => {
  try {
    if (draft) localStorage.setItem(textDraftKey(boardId), JSON.stringify(draft));
    else localStorage.removeItem(textDraftKey(boardId));
  } catch {
    // Storage can be blocked (private mode); typing still works, it just won't survive a refresh.
  }
};

/** Image edits sent in full, so undoing back to "no edit" really clears them. */
const imageEditFields = (item: CanvasItem) =>
  item.type === "image"
    ? { rotation: item.rotation ?? 0, flipX: item.flipX ?? false, flipY: item.flipY ?? false, crop: item.crop ?? FULL_CROP }
    : {};
const DEFAULT_RECT_WIDTH = 220;
const DEFAULT_RECT_HEIGHT = 140;
const DEFAULT_ARROW_LENGTH = 200;

const textMeasureCanvas = document.createElement("canvas");

const measureTextBox = (content: string, fontFamily: string, fontSize: number) => {
  const context = textMeasureCanvas.getContext("2d");
  const lines = content.length > 0 ? content.split("\n") : [""];

  if (!context) {
    return { width: DEFAULT_TEXT_WIDTH, height: DEFAULT_TEXT_HEIGHT };
  }

  context.font = `${fontSize}px ${fontFamily}`;

  let maxLineWidth = 0;
  for (const line of lines) {
    maxLineWidth = Math.max(maxLineWidth, context.measureText(line).width);
  }

  const lineHeight = fontSize * 1.2;
  const width = content.length > 0 ? Math.ceil(maxLineWidth + fontSize * 0.5) : DEFAULT_TEXT_WIDTH;
  const height = content.length > 0 ? Math.ceil(lines.length * lineHeight) : DEFAULT_TEXT_HEIGHT;

  return { width, height };
};

const App: React.FC = () => {
  // Selective store subscriptions — avoid re-rendering App on unrelated store writes.
  const theme = useStore((s) => s.theme);
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  const activeBoardId = useStore((s) => s.activeBoardId);
  const boardViewports = useStore((s) => s.boardViewports);
  const getViewport = useStore((s) => s.getViewport);
  const setViewportTransform = useStore((s) => s.setViewportTransform);
  const setShowGrid = useStore((s) => s.setShowGrid);
  const setHasInteracted = useStore((s) => s.setHasInteracted);
  const cachedItems = useStore((s) => s.cachedItems);
  const setCachedItems = useStore((s) => s.setCachedItems);
  const pushUndo = useStore((s) => s.pushUndo);
  const popUndo = useStore((s) => s.popUndo);
  const popRedo = useStore((s) => s.popRedo);
  const updateHistoryIds = useStore((s) => s.updateHistoryIds);

  const { boards, ready: boardReady } = useBoardBootstrap();

  const boardId = activeBoardId ?? "";
  const viewport = boardId ? boardViewports[boardId] ?? defaultViewport() : null;
  const showGrid = viewport?.showGrid ?? false;
  const hasInteracted = viewport?.hasInteracted ?? false;

  const toggleGrid = React.useCallback(() => {
    if (!boardId) return;
    const current = getViewport(boardId);
    setShowGrid(boardId, !current.showGrid);
  }, [boardId, getViewport, setShowGrid]);

  // Live camera lives in React state (and is applied directly to the Stage during wheel).
  // Store is only updated on a rAF throttle so pan/zoom never blocks the main thread with persist.
  const [scale, setScaleLocal] = React.useState(viewport?.scale ?? 1);
  const [position, setPositionLocal] = React.useState(viewport?.position ?? { x: 0, y: 0 });
  const scaleRef = useRef(scale);
  const positionRef = useRef(position);
  const viewSyncTimer = useRef(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [canvasSize, setCanvasSize] = React.useState(() => ({
    width: window.innerWidth, height: Math.max(1, window.innerHeight - 48),
  }));
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setCanvasSize({ width, height: Math.max(1, height - 48) });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [boardReady]);


  React.useEffect(() => {
    if (!boardId) return;
    const vp = getViewport(boardId);
    scaleRef.current = vp.scale;
    positionRef.current = vp.position;
    setScaleLocal(vp.scale);
    setPositionLocal(vp.position);
  }, [boardId, getViewport]);

  const flushViewToStore = React.useCallback(() => {
    if (!boardId) return;
    setViewportTransform(boardId, {
      scale: scaleRef.current,
      position: positionRef.current,
    });
  }, [boardId, setViewportTransform]);

  // Set below once the text editor exists; pan/zoom calls it to keep the text box in place.
  const placeTextEditorRef = useRef(() => {});
  const scheduleViewSync = React.useCallback(() => {
    // Per-frame work stays off React: the stage transform is already applied
    // imperatively, and the dot-grid parallax is a direct style write. The
    // full App render (and store persist) runs once when the gesture pauses.
    placeTextEditorRef.current();
    window.clearTimeout(viewSyncTimer.current);
    viewSyncTimer.current = window.setTimeout(() => {
      setScaleLocal(scaleRef.current);
      setPositionLocal(positionRef.current);
      flushViewToStore();
    }, 120);
  }, [flushViewToStore]);

  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [showSettings, setShowSettings] = React.useState(false);
  const [showCheckpoints, setShowCheckpoints] = React.useState(false);
  const [showLayers, setShowLayers] = React.useState(false);
  const [menuCollapsed, setMenuCollapsed] = React.useState(false);
  const [formatStyle, setFormatStyle] = React.useState<Pick<CanvasItem, "color" | "fontFamily" | "fontSize"> | null>(null);
  const [formatPainterActive, setFormatPainterActive] = React.useState(false);
  const [presentationIndex, setPresentationIndex] = React.useState<number | null>(null);
  const [editingText, setEditingText] = React.useState<{
    _id?: string;
    x: number;
    y: number;
    content: string;
    fontSize?: number;
    itemType?: "text";
  } | null>(null);

  const trRef = useRef<any>(null);
  const stageRef = useRef<any>(null);
  const textEditorRef = useRef<HTMLTextAreaElement | null>(null);
  const editorMetrics = useRef<{ width: number; height: number } | null>(null);
  const drawPreviewRectRef = useRef<any>(null);
  const drawPreviewArrowRef = useRef<any>(null);
  const localUpdates = useRef<Map<string, Partial<CanvasItem>>>(new Map());
  // IDs deleted optimistically but not yet confirmed by Convex — filter them out of db merges
  // so concurrent query updates don't briefly resurrect removed items.
  const pendingDeletes = useRef<Set<string>>(new Set());
  const groupDrag = useRef<{ anchorId: string; start: Map<string, { x: number; y: number }>; done?: boolean } | null>(null);
  const drawStart = useRef<{ x: number; y: number; type: "rect" | "arrow" } | null>(null);
  /** Box-select drag on empty canvas (world coords) and the selection it adds to. */
  const marqueeStart = useRef<{ x: number; y: number; base: string[] } | null>(null);
  const marqueeRectRef = useRef<any>(null);
  /** Hand-pan drag (space / middle button / touch), in screen coords. */
  const panStart = useRef<{ px: number; py: number; x: number; y: number; fromTyping?: boolean } | null>(null);
  const [spacePan, setSpacePan] = React.useState(false);
  /** Image currently in crop mode. */
  const [croppingId, setCroppingId] = React.useState<string | null>(null);
  const cropperRef = useRef<ImageCropperHandle>(null);
  /** Live node positions while dragging (so linked connectors follow before dragEnd). */
  const livePos = useRef<Map<string, { x: number; y: number; width?: number; height?: number }>>(new Map());
  const connectorRouteRaf = useRef(0);
  const suppressClick = useRef(false);
  // Ignore blur right after opening the editor (mouseup/click after draw steals focus from the textarea).
  const ignoreBlurUntil = useRef(0);
  // Latest values for stable event listeners (avoids rebinding window handlers every render).
  const itemsRef = useRef<CanvasItem[]>([]);
  const selectedIdsRef = useRef<string[]>([]);
  const editingTextRef = useRef(editingText);
  const croppingRef = useRef<string | null>(null);
  const modeRef = useRef(mode);
  const actionRefs = useRef({
    deleteItems: (_ids: string[]) => {},
    reconcileHistory: async (_target: CanvasItem[]) => {},
    adjustFontSize: (_delta: number) => {},
    finishCrop: (_apply: boolean) => {},
    wheel: (_e: { evt: WheelEvent }) => {},
  });

  useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  const resizeTextEditor = (textarea = textEditorRef.current, value = editingText?.content ?? "") => {
    if (!textarea || !editingText) return;
    editorMetrics.current = measureTextBox(value, theme.fontFamily, editingText.fontSize ?? BASE_FONT_SIZE);
    placeTextEditor();
  };

  /** Keep the open text box pinned to its spot on the canvas at the live pan/zoom. */
  const placeTextEditor = () => {
    const textarea = textEditorRef.current;
    const editing = editingTextRef.current;
    if (!textarea || !editing) return;
    const s = scaleRef.current;
    const pos = positionRef.current;
    textarea.style.left = `${editing.x * s + pos.x}px`;
    textarea.style.top = `${editing.y * s + pos.y}px`;
    textarea.style.fontSize = `${(editing.fontSize ?? BASE_FONT_SIZE) * s}px`;
    const m = editorMetrics.current;
    if (m) {
      textarea.style.width = `${m.width * s}px`;
      textarea.style.height = `${m.height * s}px`;
    }
  };
  placeTextEditorRef.current = placeTextEditor;

  const saveTextDraft = () => {
    const editing = editingTextRef.current;
    if (!boardId || !editing) return;
    writeTextDraft(boardId, {
      _id: editing._id,
      x: editing.x,
      y: editing.y,
      fontSize: editing.fontSize,
      content: textEditorRef.current?.value ?? editing.content,
    });
  };

  useLayoutEffect(() => {
    if (editingText) {
      resizeTextEditor(textEditorRef.current, textEditorRef.current?.value ?? editingText.content);
      saveTextDraft();
    }
  }, [editingText?.x, editingText?.y, editingText?.fontSize, scale, theme.fontFamily]);

  /** Place a free-floating text cursor at world coords (works on empty canvas or inside a rect). */
  const startFreeTextAt = (x: number, y: number, existing?: CanvasItem) => {
    ignoreBlurUntil.current = Date.now() + 400;
    setSelectedIds([]);
    trRef.current?.nodes?.([]);
    setEditingText(
      existing
        ? {
            _id: existing._id,
            x: existing.x,
            y: existing.y,
            content: existing.content,
            fontSize: existing.fontSize ?? BASE_FONT_SIZE,
            itemType: "text",
          }
        : {
            x,
            y,
            content: "",
            fontSize: BASE_FONT_SIZE,
            itemType: "text",
          },
    );
    if (boardId && !hasInteracted) setHasInteracted(boardId, true);
    window.setTimeout(() => {
      const el = textEditorRef.current;
      if (!el) return;
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
    }, 10);
  };

  const dbItems = useQuery(api.board.getItems, boardId ? { boardId } : "skip");
  const saveItemDb = useMutation(api.board.saveItem);
  const deleteItemDb = useMutation(api.board.deleteItem);
  const clearItemGroupDb = useMutation(api.board.clearItemGroup);
  const generateImageUploadUrl = useMutation(api.board.generateImageUploadUrl);

  useEffect(() => {
    localUpdates.current.clear();
    pendingDeletes.current.clear();
    setSelectedIds([]);
    setEditingText(null);
    setShowSettings(false);
    setShowCheckpoints(false);
    setShowLayers(false);
  }, [boardId]);

  useEffect(() => {
    if (!dbItems) return;

    // Drop pending deletes that Convex has confirmed (no longer in the query result).
    for (const id of [...pendingDeletes.current]) {
      if (!dbItems.some((item) => item._id === id)) pendingDeletes.current.delete(id);
    }
    const deleted = pendingDeletes.current;

    const merged = dbItems
      .filter((item) => !deleted.has(item._id))
      .map((item) => {
        const local = localUpdates.current.get(item._id);
        if (local) {
          const allMatch = Object.entries(local).every(([key, value]) => {
            const remote = item[key as keyof typeof item];
            return typeof value === "object" && value !== null
              ? JSON.stringify(remote) === JSON.stringify(value)
              : remote === value;
          });
          if (allMatch) localUpdates.current.delete(item._id);
          else return { ...item, ...local };
        }
        return item;
      });

    // Keep optimistic temp items that haven't been assigned a real Convex id yet.
    const dbIds = new Set(dbItems.map((item) => String(item._id)));
    const temps = useStore
      .getState()
      .cachedItems.filter(
        (item) => String(item._id).startsWith("temp-") && !dbIds.has(String(item._id)),
      );

    setCachedItems([...merged, ...temps] as CanvasItem[]);
  }, [dbItems, setCachedItems]);

  const items = cachedItems.length > 0 || dbItems !== undefined ? cachedItems : EMPTY_ARRAY;

  const draftRestoredFor = useRef<string | null>(null);
  useEffect(() => {
    if (!boardId || dbItems === undefined || draftRestoredFor.current === boardId) return;
    draftRestoredFor.current = boardId;
    const draft = readTextDraft(boardId);
    if (!draft) return;
    // Reopen as new text if the original was never saved or has since been removed.
    const stillThere = draft._id && dbItems.some((item) => item._id === draft._id);
    ignoreBlurUntil.current = Date.now() + 400;
    setEditingText({
      _id: stillThere ? draft._id : undefined,
      x: draft.x,
      y: draft.y,
      content: draft.content,
      fontSize: draft.fontSize ?? BASE_FONT_SIZE,
      itemType: "text",
    });
    window.setTimeout(() => {
      const el = textEditorRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }, 10);
  }, [boardId, dbItems]);
  itemsRef.current = items;
  selectedIdsRef.current = selectedIds;
  editingTextRef.current = editingText;
  croppingRef.current = croppingId;
  modeRef.current = mode;

  // Stable render order: ascending zIndex (front-most drawn last), ties keep insertion order.
  const orderedItems = React.useMemo(
    () =>
      items
        .map((item, i) => ({ item, i }))
        .sort((a, b) => {
          // Structural edges stay behind nodes even when their layer values are newer.
          const rank = (item: CanvasItem) => item.type === "frame" ? 0 : item.type === "connector" ? 1 : 2;
          const edgeOrder = rank(a.item) - rank(b.item);
          return edgeOrder || (a.item.zIndex ?? 0) - (b.item.zIndex ?? 0) || a.i - b.i;
        })
        .map(({ item }) => item),
    [items],
  );

  const nextZIndex = () => items.reduce((m, i) => Math.max(m, i.zIndex ?? 0), 0) + 1;

  useEffect(() => {
    if (!trRef.current || !stageRef.current) return;
    // Arrows/connectors use custom handles, not the box transformer.
    const nodes = selectedIds
      .map((id) => {
        const item = items.find((i) => i._id === id);
        if (!item || item.type === "arrow" || item.type === "connector" || item.type === "frame") return null;
        return stageRef.current.findOne("#" + id);
      })
      .filter(Boolean);
    trRef.current.nodes(nodes);
    trRef.current.getLayer()?.batchDraw();
  }, [selectedIds, items]);

  const itemsById = React.useMemo(() => {
    const m = new Map<string, CanvasItem>();
    for (const it of items) m.set(it._id, it);
    return m;
  }, [items]);
  const connectorRoutes = React.useMemo(() => buildConnectorRoutes(items), [items]);

  /** Resolve an item with any in-flight drag position applied. */
  const itemWithLivePos = React.useCallback(
    (id: string | undefined): CanvasItem | undefined => {
      if (!id) return undefined;
      const base = itemsById.get(id);
      if (!base) return undefined;
      const live = livePos.current.get(id);
      return live ? { ...base, ...live } : base;
    },
    [itemsById],
  );

  const refreshConnectorNodes = React.useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const liveItems = items.map((item) => itemWithLivePos(item._id) ?? item);
    const liveRoutes = buildConnectorRoutes(liveItems);
    for (const c of items) {
      if (c.type !== "connector" || !c.fromId || !c.toId || !c.fromPort || !c.toPort) continue;
      const pts = liveRoutes.get(c._id);
      const node = stage.findOne("#" + c._id);
      if (node && pts) {
        node.points(pts);
        node.position({ x: 0, y: 0 });
        const label = stage.findOne("#connector-label-" + c._id);
        if (label) {
          const midpoint = pathMidpoint(pts);
          label.position({ x: midpoint.x - label.width() / 2, y: midpoint.y - 11 });
        }
      }
    }
    stage.batchDraw();
  }, [items, itemWithLivePos]);

  const scheduleConnectorRefresh = React.useCallback(() => {
    if (connectorRouteRaf.current) return;
    connectorRouteRaf.current = requestAnimationFrame(() => {
      connectorRouteRaf.current = 0;
      refreshConnectorNodes();
    });
  }, [refreshConnectorNodes]);

  const cancelConnectorRefresh = () => {
    if (!connectorRouteRaf.current) return;
    cancelAnimationFrame(connectorRouteRaf.current);
    connectorRouteRaf.current = 0;
  };

  const handleWheel = (e: any) => {
    if (!boardId) return;
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const evt: WheelEvent = e.evt;
    // Line-mode wheels (Firefox mouse) report ~3 per notch; normalise to pixels.
    const unit = evt.deltaMode === 1 ? 16 : 1;
    let deltaX = evt.deltaX * unit;
    let deltaY = evt.deltaY * unit;
    // Two-finger scroll / mouse wheel pans; pinch (sent as ctrl+wheel) or ctrl+wheel zooms.
    if (!evt.ctrlKey && !evt.metaKey) {
      if (evt.shiftKey && deltaX === 0) {
        deltaX = deltaY;
        deltaY = 0;
      }
      const newPos = { x: stage.x() - deltaX, y: stage.y() - deltaY };
      stage.position(newPos);
      stage.batchDraw();
      positionRef.current = newPos;
      scheduleViewSync();
      if (!hasInteracted) setHasInteracted(boardId, true);
      return;
    }
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };
    // Small pinch deltas give smooth zoom; big mouse-wheel notches are capped to one step.
    const step = Math.max(-10, Math.min(10, deltaY));
    const newScale = Math.min(Math.max(oldScale * Math.exp(-step * 0.02), 0.1), 5);
    const newPos = {
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    };
    // Apply to Konva immediately (no React re-render per wheel tick).
    stage.scale({ x: newScale, y: newScale });
    stage.position(newPos);
    stage.batchDraw();
    scaleRef.current = newScale;
    positionRef.current = newPos;
    scheduleViewSync();
    if (!hasInteracted) setHasInteracted(boardId, true);
  };

  const handleStageClick = (e: any) => {
    // Swallow the click that trails a shape-drawing drag so it doesn't clear the new selection.
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (!boardId) return;

    // Clicking off the picture while cropping keeps the crop.
    if (croppingId) {
      if (e.target === stageRef.current) finishCrop(true);
      return;
    }

    // Text tool: place free text at the click — including when the click lands on a rectangle.
    if (mode === "text") {
      const p = worldPointer();
      if (!p) return;
      e.cancelBubble = true;
      setShowSettings(false);
      startFreeTextAt(p.x, p.y);
      return;
    }

    // Select tool: empty-canvas click clears selection.
    if (e.target !== stageRef.current) return;
    setShowSettings(false);
    setSelectedIds([]);
    if (!hasInteracted) setHasInteracted(boardId, true);
  };

  const handleStageDblClick = (e: any) => {
    if (!boardId) return;
    e.cancelBubble = true;
    // Double-click on existing text → edit it.
    const hit = items.find((i) => i._id === e.target?.id?.());
    if (hit?.type === "text") {
      startFreeTextAt(hit.x, hit.y, hit);
      return;
    }
    // Double-click on a picture → crop it.
    if (hit?.type === "image" && mode === "select") {
      startCrop(hit._id);
      return;
    }
    if (croppingId) return;
    // Double-click anywhere else (canvas or inside a shape) → free text at that point.
    const p = worldPointer();
    if (!p) return;
    startFreeTextAt(p.x, p.y);
  };

  const worldPointer = () => {
    const stage = stageRef.current;
    const p = stage?.getPointerPosition();
    if (!p) return null;
    return { x: (p.x - stage.x()) / stage.scaleX(), y: (p.y - stage.y()) / stage.scaleY() };
  };

  const hideDrawPreview = () => {
    const rect = drawPreviewRectRef.current;
    const arrow = drawPreviewArrowRef.current;
    if (rect) {
      rect.visible(false);
      rect.getLayer()?.batchDraw();
    }
    if (arrow) {
      arrow.visible(false);
      arrow.getLayer()?.batchDraw();
    }
  };

  const handleStageMouseDown = (e: any) => {
    suppressClick.current = false;
    const stage = stageRef.current;
    const evt = e?.evt;
    const isTouch = typeof TouchEvent !== "undefined" && evt instanceof TouchEvent;
    const onEmpty = e?.target === stage;
    // Hand pan: middle button, space held, or a finger on empty canvas.
    if (stage && (evt?.button === 1 || spacePan || (isTouch && onEmpty && mode === "select"))) {
      evt?.preventDefault?.();
      const p = stage.getPointerPosition();
      if (p) panStart.current = { px: p.x, py: p.y, x: stage.x(), y: stage.y() };
      return;
    }
    // While typing, dragging empty canvas looks around without closing the text.
    if (stage && editingTextRef.current && onEmpty && evt?.button === 0) {
      evt.preventDefault();
      const p = stage.getPointerPosition();
      if (p) panStart.current = { px: p.x, py: p.y, x: stage.x(), y: stage.y(), fromTyping: true };
      return;
    }
    // Drag on empty canvas with the select tool draws a selection box.
    if (mode === "select" && onEmpty && evt?.button === 0 && !croppingId) {
      const p = worldPointer();
      if (!p) return;
      const additive = Boolean(evt.shiftKey || evt.ctrlKey || evt.metaKey);
      marqueeStart.current = { ...p, base: additive ? selectedIds : [] };
      return;
    }
    if (mode !== "rect" && mode !== "arrow") return;
    const p = worldPointer();
    if (!p) return;
    drawStart.current = { ...p, type: mode };
    // Show the matching preview shape without a React re-render.
    if (mode === "rect" && drawPreviewRectRef.current) {
      const r = drawPreviewRectRef.current;
      r.visible(true);
      r.position({ x: p.x, y: p.y });
      r.size({ width: 0, height: 0 });
      r.getLayer()?.batchDraw();
    } else if (mode === "arrow" && drawPreviewArrowRef.current) {
      const a = drawPreviewArrowRef.current;
      a.visible(true);
      a.position({ x: p.x, y: p.y });
      a.points([0, 0, 0, 0]);
      a.getLayer()?.batchDraw();
    }
  };

  const handleStageMouseMove = (e: any) => {
    const stage = stageRef.current;
    const pan = panStart.current;
    if (pan && stage) {
      // Button released outside the canvas — stop panning.
      if (e?.evt?.buttons === 0) {
        panStart.current = null;
        return;
      }
      const p = stage.getPointerPosition();
      if (!p) return;
      const newPos = { x: pan.x + p.x - pan.px, y: pan.y + p.y - pan.py };
      stage.position(newPos);
      stage.batchDraw();
      positionRef.current = newPos;
      scheduleViewSync();
      return;
    }
    const box = marqueeStart.current;
    if (box && marqueeRectRef.current) {
      if (e?.evt?.buttons === 0) {
        marqueeStart.current = null;
        marqueeRectRef.current.visible(false);
        marqueeRectRef.current.getLayer()?.batchDraw();
        return;
      }
      const p = worldPointer();
      if (!p) return;
      const r = marqueeRectRef.current;
      r.visible(true);
      r.position({ x: Math.min(box.x, p.x), y: Math.min(box.y, p.y) });
      r.size({ width: Math.abs(p.x - box.x), height: Math.abs(p.y - box.y) });
      r.getLayer()?.batchDraw();
      return;
    }
    const start = drawStart.current;
    if (!start) return;
    const p = worldPointer();
    if (!p) return;
    const dx = p.x - start.x;
    const dy = p.y - start.y;
    // Mutate Konva nodes directly — no setState on every pointer move.
    if (start.type === "rect" && drawPreviewRectRef.current) {
      const r = drawPreviewRectRef.current;
      r.position({ x: Math.min(start.x, p.x), y: Math.min(start.y, p.y) });
      r.size({ width: Math.abs(dx), height: Math.abs(dy) });
      r.getLayer()?.batchDraw();
    } else if (start.type === "arrow" && drawPreviewArrowRef.current) {
      const a = drawPreviewArrowRef.current;
      a.position({ x: start.x, y: start.y });
      a.points([0, 0, dx, dy]);
      a.getLayer()?.batchDraw();
    }
  };

  /** Topmost rectangle under a world point (small forgiving margin). */
  const rectAtPoint = (point: { x: number; y: number }): CanvasItem | undefined => {
    const margin = 12 / scale;
    let best: CanvasItem | undefined;
    let bestZ = -Infinity;
    for (const item of items) {
      if (item.type !== "rect") continue;
      const w = item.width ?? DEFAULT_RECT_WIDTH;
      const h = item.height ?? DEFAULT_RECT_HEIGHT;
      const inside =
        point.x >= item.x - margin && point.x <= item.x + w + margin &&
        point.y >= item.y - margin && point.y <= item.y + h + margin;
      if (inside && (item.zIndex ?? 0) >= bestZ) {
        bestZ = item.zIndex ?? 0;
        best = item;
      }
    }
    return best;
  };

  /** Select everything that sits fully inside the box drawn on the canvas. */
  const finishMarquee = () => {
    const box = marqueeStart.current;
    marqueeStart.current = null;
    const r = marqueeRectRef.current;
    const stage = stageRef.current;
    if (!box || !r || !stage) return;
    const wasVisible = r.visible();
    // Barely moved: treat as a plain click (clears selection via the click handler).
    const tiny = r.width() * scaleRef.current < 4 && r.height() * scaleRef.current < 4;
    if (!wasVisible || tiny) {
      r.visible(false);
      r.getLayer()?.batchDraw();
      return;
    }
    suppressClick.current = true;
    // Measure the box and items the same way so zoom/pan never skews the match.
    const area = r.getClientRect({ skipStroke: true });
    const left = area.x;
    const top = area.y;
    const right = area.x + area.width;
    const bottom = area.y + area.height;
    const picked = new Set(box.base);
    // Measure before hiding: a hidden node reports an empty box.
    r.visible(false);
    r.getLayer()?.batchDraw();
    for (const item of items) {
      const node = stage.findOne("#" + item._id);
      if (!node) continue;
      const b = node.getClientRect();
      if (b.x >= left && b.y >= top && b.x + b.width <= right && b.y + b.height <= bottom) {
        picked.add(item._id);
        // A boxed frame brings its contents along, like clicking it does.
        if (item.type === "frame") {
          for (const child of items) if (child.groupId === item._id) picked.add(child._id);
        }
      }
    }
    setSelectedIds([...picked]);
    if (boardId && !hasInteracted) setHasInteracted(boardId, true);
  };

  const handleStageMouseUp = () => {
    const pan = panStart.current;
    if (pan) {
      panStart.current = null;
      if (pan.fromTyping) {
        // The trailing click mustn't start new text or clear anything.
        suppressClick.current = true;
        // A click (not a drag) on the canvas while typing finishes the text, as before.
        const stage = stageRef.current;
        if (stage && Math.abs(stage.x() - pan.x) < 3 && Math.abs(stage.y() - pan.y) < 3) {
          textEditorRef.current?.blur();
          return;
        }
      }
      if (boardId && !hasInteracted) setHasInteracted(boardId, true);
      return;
    }
    if (marqueeStart.current) {
      finishMarquee();
      return;
    }
    const start = drawStart.current;
    if (!start) return;
    drawStart.current = null;
    hideDrawPreview();
    const shape = start.type;
    if (shape !== "rect" && shape !== "arrow") return;
    const p = worldPointer();
    if (!p) {
      setMode("select");
      return;
    }
    const dx = p.x - start.x;
    const dy = p.y - start.y;
    // Ignore an accidental click with no real drag.
    if (Math.abs(dx) < 3 && Math.abs(dy) < 3) {
      setMode("select");
      return;
    }
    suppressClick.current = true;
    if (shape === "rect") {
      commitShape("rect", {
        x: Math.min(start.x, p.x),
        y: Math.min(start.y, p.y),
        width: Math.max(5, Math.abs(dx)),
        height: Math.max(5, Math.abs(dy)),
      });
      return;
    }
    // Arrow drawn box-to-box becomes a linked connector (Excalidraw-style);
    // anywhere else it stays a free arrow.
    const from = rectAtPoint(start);
    const to = rectAtPoint(p);
    if (from && to && from._id !== to._id) {
      commitConnector(from._id, nearestPort(from, start), to._id, nearestPort(to, p));
      return;
    }
    commitShape("arrow", { x: start.x, y: start.y, width: dx, height: dy });
  };

  const resetView = () => {
    if (!boardId) return;
    scaleRef.current = 1;
    positionRef.current = { x: 0, y: 0 };
    setScaleLocal(1);
    setPositionLocal({ x: 0, y: 0 });
    const stage = stageRef.current;
    if (stage) {
      stage.scale({ x: 1, y: 1 });
      stage.position({ x: 0, y: 0 });
      stage.batchDraw();
    }
    setViewportTransform(boardId, { scale: 1, position: { x: 0, y: 0 } });
  };

  const navigateToWorld = React.useCallback((worldX: number, worldY: number, nextScale?: number) => {
    if (!boardId) return;
    nextScale = nextScale ?? scaleRef.current;
    const nextPosition = {
      x: window.innerWidth / 2 - worldX * nextScale,
      y: (window.innerHeight - 48) / 2 - worldY * nextScale,
    };
    scaleRef.current = nextScale;
    positionRef.current = nextPosition;
    setScaleLocal(nextScale);
    setPositionLocal(nextPosition);
    stageRef.current?.scale({ x: nextScale, y: nextScale });
    stageRef.current?.position(nextPosition);
    stageRef.current?.batchDraw();
    setViewportTransform(boardId, { scale: nextScale, position: nextPosition });
  }, [boardId, setViewportTransform]);

  const jumpToItem = (item: CanvasItem, fit = false) => {
    const width = item.width ?? 120;
    const height = item.height ?? 80;
    const fitScale = fit
      ? Math.min(2, Math.max(0.15, Math.min((window.innerWidth - 160) / width, (window.innerHeight - 160) / height)))
      : scaleRef.current;
    navigateToWorld(item.x + width / 2, item.y + height / 2, fitScale);
    setSelectedIds([item._id]);
  };

  // Persist a full item (used for layer reordering + group moves + connectors).
  const persistItem = (item: CanvasItem) => {
    if (!boardId || String(item._id).startsWith("temp-")) return;
    saveItemDb({
      id: item._id as Id<"items">,
      type: item.type,
      content: item.content,
      boardId,
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
      color: item.color,
      fontFamily: item.fontFamily,
      fontSize: item.fontSize,
      zIndex: item.zIndex,
      fromId: item.fromId,
      toId: item.toId,
      fromPort: item.fromPort,
      toPort: item.toPort,
      waypoints: item.type === "connector" ? [] : item.waypoints,
      directed: item.directed,
      groupId: item.groupId,
      storageId: item.storageId as Id<"_storage"> | undefined,
      ...imageEditFields(item),
    });
  };

  // Use the same jointly planned paths for stored bounds and rendering. Moving
  // an obstacle can reroute edges even when neither endpoint was selected.
  const updateConnectorBounds = (nextItems: CanvasItem[]) => {
    const routes = buildConnectorRoutes(nextItems);
    return nextItems.map((item) => {
      const points = routes.get(item._id);
      if (!points) return item;
      const bounds = pointsBounds(points);
      if (item.x === bounds.x && item.y === bounds.y &&
        item.width === bounds.width && item.height === bounds.height) return item;
      const patched = { ...item, ...bounds };
      localUpdates.current.set(item._id, { ...(localUpdates.current.get(item._id) ?? {}), ...bounds });
      persistItem(patched);
      return patched;
    });
  };

  // Reassign zIndex from an ascending (back → front) ordering and persist changes.
  const applyLayerOrder = (ascending: CanvasItem[]) => {
    if (!boardId) return;
    pushUndo(boardId, items);
    const withZ = ascending.map((it, idx) => ({ ...it, zIndex: idx }));
    const byId = new Map(withZ.map((it) => [it._id, it]));
    setCachedItems(items.map((it) => byId.get(it._id) ?? it));
    withZ.forEach((it) => {
      const prev = items.find((i) => i._id === it._id);
      if (prev && prev.zIndex !== it.zIndex) persistItem(it);
    });
  };

  const moveLayer = (id: string, dir: 1 | -1) => {
    const asc = [...orderedItems];
    const idx = asc.findIndex((i) => i._id === id);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= asc.length) return;
    [asc[idx], asc[target]] = [asc[target], asc[idx]];
    applyLayerOrder(asc);
  };
  // +1 in ascending array = closer to front.
  const bringForward = (id: string) => moveLayer(id, 1);
  const sendBackward = (id: string) => moveLayer(id, -1);

  const deleteItems = (ids: string[]) => {
    if (!boardId || ids.length === 0) return;
    const del = new Set(ids);
    const deletedFrameIds = new Set(
      items.filter((item) => del.has(item._id) && item.type === "frame").map((item) => item._id),
    );
    // Also remove connectors attached to deleted nodes.
    for (const it of items) {
      if (
        it.type === "connector" &&
        ((it.fromId && del.has(it.fromId)) || (it.toId && del.has(it.toId)))
      ) {
        del.add(it._id);
      }
    }
    pushUndo(boardId, items);
    for (const id of del) {
      if (!String(id).startsWith("temp-")) pendingDeletes.current.add(id);
    }
    setCachedItems(
      items
        .filter((i) => !del.has(i._id))
        .map((item) =>
          item.groupId && deletedFrameIds.has(item.groupId) ? { ...item, groupId: undefined } : item,
        ),
    );
    for (const child of items) {
      if (!child.groupId || !deletedFrameIds.has(child.groupId) || del.has(child._id)) continue;
      localUpdates.current.set(child._id, {
        ...(localUpdates.current.get(child._id) ?? {}),
        groupId: undefined,
      });
      if (!String(child._id).startsWith("temp-")) {
        clearItemGroupDb({ id: child._id as Id<"items"> });
      }
    }
    del.forEach((id) => {
      if (!String(id).startsWith("temp-")) deleteItemDb({ id: id as Id<"items"> });
    });
    setSelectedIds((prev) => prev.filter((id) => !del.has(id)));
  };

  const commitConnector = (
    fromId: string,
    fromPort: PortSide,
    toId: string,
    toPort: PortSide,
  ) => {
    if (!boardId || fromId === toId) return;
    const from = itemsById.get(fromId);
    const to = itemsById.get(toId);
    if (!from || !to || from.type !== "rect" || to.type !== "rect") return;

    const pts = connectorPoints(from, to, fromPort, toPort, undefined, items) ?? [0, 0, 1, 1];
    const bounds = pointsBounds(pts);
    const zIndex = nextZIndex();
    const color = theme.accentColor;
    const tempId = `temp-${Date.now()}`;
    const newItem: CanvasItem = {
      _id: tempId,
      _creationTime: Date.now(),
      type: "connector",
      ...bounds,
      content: "",
      color,
      zIndex,
      fromId,
      toId,
      fromPort,
      toPort,
      waypoints: [],
      directed: true,
    };

    pushUndo(boardId, items);
    if (!hasInteracted) setHasInteracted(boardId, true);
    setCachedItems([...items, newItem]);
    setMode("select");
    setSelectedIds([tempId]);

    saveItemDb({
      type: "connector",
      ...bounds,
      content: "",
      color,
      zIndex,
      boardId,
      fromId,
      toId,
      fromPort,
      toPort,
      waypoints: [],
      directed: true,
    }).then((newId) => {
      updateHistoryIds(boardId, tempId, newId);
      setSelectedIds((prev) => prev.map((id) => (id === tempId ? newId : id)));
    });
  };

  // Persist a freshly drawn rectangle or arrow, then select it (do not auto-enter text edit).
  const commitShape = (
    shape: "rect" | "arrow",
    geom: { x: number; y: number; width: number; height: number },
  ) => {
    if (!boardId) return;
    const zIndex = nextZIndex();
    const color = theme.accentColor;
    const tempId = `temp-${Date.now()}`;
    const newItem: CanvasItem = {
      _id: tempId,
      _creationTime: Date.now(),
      type: shape,
      ...geom,
      content: "",
      color,
      fontFamily: shape === "rect" ? theme.fontFamily : undefined,
      fontSize: shape === "rect" ? BASE_FONT_SIZE : undefined,
      zIndex,
    };

    pushUndo(boardId, items);
    if (!hasInteracted) setHasInteracted(boardId, true);
    setCachedItems([...items, newItem]);
    setMode("select");
    setSelectedIds([tempId]);

    saveItemDb({
      type: shape,
      ...geom,
      content: "",
      color,
      fontFamily: newItem.fontFamily,
      fontSize: newItem.fontSize,
      zIndex,
      boardId,
    }).then((newId) => {
      const local = localUpdates.current.get(tempId);
      if (local) {
        localUpdates.current.delete(tempId);
        localUpdates.current.set(newId, local);
      }
      updateHistoryIds(boardId, tempId, newId);
      setSelectedIds((prev) => prev.map((id) => (id === tempId ? newId : id)));
      setEditingText((prev) => (prev?._id === tempId ? { ...prev, _id: newId } : prev));
    });
  };

  const createFrameFromSelection = async () => {
    if (!boardId) return;
    const children = items.filter(
      (item) =>
        selectedIds.includes(item._id) &&
        item.type !== "connector" &&
        item.type !== "frame" &&
        !item.groupId,
    );
    if (children.length < 2) return;
    const minX = Math.min(...children.map((item) => item.x));
    const minY = Math.min(...children.map((item) => item.y));
    const maxX = Math.max(...children.map((item) => item.x + (item.width ?? DEFAULT_RECT_WIDTH)));
    const maxY = Math.max(...children.map((item) => item.y + (item.height ?? DEFAULT_RECT_HEIGHT)));
    const frame: Omit<CanvasItem, "_id" | "_creationTime"> = {
      type: "frame",
      x: minX - 28,
      y: minY - 52,
      width: maxX - minX + 56,
      height: maxY - minY + 80,
      content: "",
      color: theme.accentColor,
      fontFamily: theme.fontFamily,
      fontSize: 14,
      zIndex: Math.min(...children.map((item) => item.zIndex ?? 0)) - 1,
    };
    pushUndo(boardId, items);
    const frameId = await saveItemDb({
      ...frame,
      storageId: frame.storageId as Id<"_storage"> | undefined,
      boardId,
    });
    const next = items.map((item) =>
      children.some((child) => child._id === item._id) ? { ...item, groupId: frameId } : item,
    );
    const savedFrame: CanvasItem = {
      ...frame,
      _id: frameId,
      _creationTime: Date.now(),
    };
    setCachedItems([...next, savedFrame]);
    for (const child of children) {
      localUpdates.current.set(child._id, {
        ...(localUpdates.current.get(child._id) ?? {}),
        groupId: frameId,
      });
      persistItem({ ...child, groupId: frameId });
    }
    setSelectedIds([frameId, ...children.map((item) => item._id)]);
    if (!hasInteracted) setHasInteracted(boardId, true);
  };

  const ungroupSelection = () => {
    if (!boardId) return;
    const frameIds = new Set<string>();
    for (const id of selectedIds) {
      const item = itemsById.get(id);
      if (item?.type === "frame") frameIds.add(item._id);
      else if (item?.groupId) frameIds.add(item.groupId);
    }
    if (frameIds.size === 0) return;
    pushUndo(boardId, items);
    const children = items.filter((item) => item.groupId && frameIds.has(item.groupId));
    setCachedItems(items.filter((item) => !frameIds.has(item._id)).map((item) =>
      item.groupId && frameIds.has(item.groupId) ? { ...item, groupId: undefined } : item,
    ));
    for (const child of children) {
      localUpdates.current.set(child._id, {
        ...(localUpdates.current.get(child._id) ?? {}),
        groupId: undefined,
      });
      if (!String(child._id).startsWith("temp-")) {
        clearItemGroupDb({ id: child._id as Id<"items"> });
      }
    }
    for (const frameId of frameIds) {
      pendingDeletes.current.add(frameId);
      deleteItemDb({ id: frameId as Id<"items"> });
    }
    setSelectedIds(children.map((item) => item._id));
  };

  const setShapeColor = (item: CanvasItem, color: string) => {
    if (!boardId) return;
    pushUndo(boardId, items);
    setCachedItems(items.map((i) => (i._id === item._id ? { ...i, color } : i)));
    persistItem({ ...item, color });
  };

  /** Resize the text being typed, or every selected text. */
  const adjustSelectedFontSize = (delta: number) => {
    if (!boardId) return;
    const clamp = (size: number) => Math.max(6, Math.min(160, Math.round(size)));
    if (editingTextRef.current) {
      setEditingText((prev) => prev && { ...prev, fontSize: clamp((prev.fontSize ?? BASE_FONT_SIZE) + delta) });
      return;
    }
    const targets = items.filter(
      (item) => selectedIdsRef.current.includes(item._id) &&
        item.type === "text",
    );
    if (targets.length === 0) return;
    pushUndo(boardId, items);
    const patchedById = new Map<string, CanvasItem>();
    for (const item of targets) {
      const fontSize = clamp((item.fontSize ?? BASE_FONT_SIZE) + delta);
      const patch: Partial<CanvasItem> = { fontSize };
      if (item.type === "text") {
        const metrics = measureTextBox(item.content, item.fontFamily || theme.fontFamily, fontSize);
        patch.width = metrics.width;
        patch.height = metrics.height;
      }
      const patched = { ...item, ...patch };
      patchedById.set(item._id, patched);
      localUpdates.current.set(item._id, {
        ...(localUpdates.current.get(item._id) ?? {}),
        ...patch,
      });
      persistItem(patched);
    }
    setCachedItems(items.map((item) => patchedById.get(item._id) ?? item));
  };

  const reconcileHistory = async (target: CanvasItem[]) => {
    if (!boardId) return;
    const currentReal = items.filter((i) => !String(i._id).startsWith("temp-"));
    const targetReal = target.filter((i) => !String(i._id).startsWith("temp-"));
    const targetIds = new Set(targetReal.map((i) => i._id));
    const currentIds = new Set(currentReal.map((i) => i._id));

    for (const item of currentReal) {
      if (!targetIds.has(item._id)) {
        pendingDeletes.current.add(item._id);
        deleteItemDb({ id: item._id as Id<"items"> });
      }
    }

    const idMap = new Map<string, string>(currentReal.map((item) => [item._id, item._id]));
    const missing = targetReal
      .filter((item) => !currentIds.has(item._id))
      .sort((a, b) => {
        const rank = (item: CanvasItem) => item.type === "frame" ? 0 : item.type === "connector" ? 2 : 1;
        return rank(a) - rank(b);
      });
    for (const item of missing) {
      const mappedFrom = item.fromId ? idMap.get(item.fromId) : undefined;
      const mappedTo = item.toId ? idMap.get(item.toId) : undefined;
      if (item.type === "connector" && (!mappedFrom || !mappedTo)) continue;
      const newId = await saveItemDb({
          type: item.type,
          x: item.x,
          y: item.y,
          width: item.width,
          height: item.height,
          content: item.content,
          color: item.color,
          fontFamily: item.fontFamily,
          fontSize: item.fontSize,
          zIndex: item.zIndex,
          fromId: mappedFrom,
          toId: mappedTo,
          fromPort: item.fromPort,
          toPort: item.toPort,
          waypoints: item.waypoints,
          directed: item.directed,
          groupId: item.groupId ? idMap.get(item.groupId) : undefined,
          storageId: item.storageId as Id<"_storage"> | undefined,
          ...imageEditFields(item),
          boardId,
      });
      idMap.set(item._id, newId);
    }

    for (const item of targetReal) {
      if (currentIds.has(item._id)) {
        const cur = currentReal.find((i) => i._id === item._id);
        if (
          cur &&
          (cur.x !== item.x ||
            cur.y !== item.y ||
            cur.content !== item.content ||
            cur.width !== item.width ||
            cur.height !== item.height ||
            cur.color !== item.color ||
            cur.fontSize !== item.fontSize ||
            cur.fontFamily !== item.fontFamily ||
            cur.zIndex !== item.zIndex ||
            cur.fromId !== item.fromId ||
            cur.toId !== item.toId ||
            cur.fromPort !== item.fromPort ||
            cur.toPort !== item.toPort ||
            cur.directed !== item.directed ||
            cur.groupId !== item.groupId ||
            JSON.stringify(imageEditFields(cur)) !== JSON.stringify(imageEditFields(item)) ||
            JSON.stringify(cur.waypoints) !== JSON.stringify(item.waypoints))
        ) {
          saveItemDb({
            id: item._id as Id<"items">,
            type: item.type,
            x: item.x,
            y: item.y,
            content: item.content,
            color: item.color,
            fontFamily: item.fontFamily,
            fontSize: item.fontSize,
            width: item.width,
            height: item.height,
            zIndex: item.zIndex,
            fromId: item.fromId ? (idMap.get(item.fromId) ?? item.fromId) : undefined,
            toId: item.toId ? (idMap.get(item.toId) ?? item.toId) : undefined,
            fromPort: item.fromPort,
            toPort: item.toPort,
            waypoints: item.waypoints,
            directed: item.directed,
            groupId: item.groupId ? (idMap.get(item.groupId) ?? item.groupId) : undefined,
            storageId: item.storageId as Id<"_storage"> | undefined,
            ...imageEditFields(item),
            boardId,
          });
        }
      }
    }

    const mapped = target.flatMap((item) => {
      const mappedId = idMap.get(item._id);
      return mappedId
        ? [{
            ...item,
            _id: mappedId,
            fromId: item.fromId ? idMap.get(item.fromId) : undefined,
            toId: item.toId ? idMap.get(item.toId) : undefined,
            groupId: item.groupId ? idMap.get(item.groupId) : undefined,
          }]
        : [];
    });
    setCachedItems(mapped.filter((i) => !String(i._id).startsWith("temp-")));
    idMap.forEach((newId, oldId) => updateHistoryIds(boardId, oldId, newId));
  };

  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA")
        return;
      if (!boardId) return;
      if (e.code === "Space") {
        e.preventDefault();
        if (!e.repeat) setSpacePan(true);
        return;
      }
      // Crop mode only listens for Enter (keep) and Escape (cancel).
      if (croppingRef.current) {
        if (e.key === "Enter" || e.key === "Escape") {
          e.preventDefault();
          actionRefs.current.finishCrop(e.key === "Enter");
        }
        return;
      }
      const itemsNow = itemsRef.current;
      const selectedNow = selectedIdsRef.current;

      if (
        ((e.ctrlKey || e.metaKey) && ["[", "]", "<", ">"].includes(e.key)) ||
        (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key === "]" || e.key === "["))
      ) {
        e.preventDefault();
        actionRefs.current.adjustFontSize(e.key === ">" || e.key === "]" ? 2 : -2);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === "z") {
        e.preventDefault();
        const prev = popUndo(boardId, itemsNow);
        if (prev) await actionRefs.current.reconcileHistory(prev);
        return;
      }

      const isRedo =
        ((e.ctrlKey || e.metaKey) && e.key === "y") ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "z");
      if (isRedo) {
        e.preventDefault();
        const next = popRedo(boardId, itemsNow);
        if (next) await actionRefs.current.reconcileHistory(next);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setMode("select");
        setSelectedIds(itemsNow.map((i) => i._id));
        return;
      }

      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key.toLowerCase() === "s") setMode("select");
        if (e.key === ",") {
          setShowSettings((v) => !v);
          setShowCheckpoints(false);
          setShowLayers(false);
        }
        if (e.key.toLowerCase() === "t") setMode("text");
        if (e.key.toLowerCase() === "r") setMode("rect");
        if (e.key.toLowerCase() === "a") setMode("arrow");
        if (e.key.toLowerCase() === "l") {
          setShowLayers((v) => !v);
          setShowSettings(false);
          setShowCheckpoints(false);
        }
        if (e.key.toLowerCase() === "m") setMenuCollapsed((v) => !v);
        if (e.code === "KeyG" || e.key.toLowerCase() === "g") {
          e.preventDefault();
          toggleGrid();
        }
      }

      if (e.key === "Escape") {
        setShowSettings(false);
        setShowCheckpoints(false);
        setShowLayers(false);
        setFormatPainterActive(false);
        setPresentationIndex(null);
        setSelectedIds([]);
        setMode("select");
      }
      if ((e.key === "Backspace" || e.key === "Delete") && selectedNow.length > 0) {
        actionRefs.current.deleteItems(selectedNow);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpacePan(false);
    };
    const handleBlur = () => setSpacePan(false);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
    // Stable listener: reads latest values via refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId, toggleGrid]);

  const handleExportPDF = async () => {
    if (items.length === 0) return alert("Board is empty!");
    const { default: jsPDF } = await import("jspdf");
    if (useStore.getState().activeBoardId !== boardId || !stageRef.current) return;
    // A4 at 96dpi logical size; 2× capture keeps it crisp while JPEG keeps the file small.
    const PAGE_W = 794;
    const PAGE_H = 1123;
    const PDF_PIXEL_RATIO = 2;
    const PDF_JPEG_QUALITY = 0.82;

    const pdf = new jsPDF({ orientation: "p", unit: "px", format: [PAGE_W, PAGE_H], compress: true });
    const populatedPages = new Set<string>();
    items.forEach((item) =>
      populatedPages.add(`${Math.floor(item.x / PAGE_W)},${Math.floor(item.y / PAGE_H)}`),
    );
    const pages = Array.from(populatedPages)
      .map((p) => {
        const [x, y] = p.split(",").map(Number);
        return { x, y };
      })
      .sort((a, b) => a.y - b.y || a.x - b.x);

    const stage = stageRef.current;
    const originalPos = { x: stage.x(), y: stage.y() };
    const originalScale = stage.scaleX();
    // Hide selection handles so they don't bake into the export.
    const selectedNodes = trRef.current?.nodes?.() ?? [];
    trRef.current?.nodes?.([]);

    for (let i = 0; i < pages.length; i++) {
      if (i > 0) pdf.addPage([PAGE_W, PAGE_H]);
      const page = pages[i];
      stage.position({ x: -page.x * PAGE_W, y: -page.y * PAGE_H });
      stage.scale({ x: 1, y: 1 });
      stage.batchDraw();
      // Composite the (transparent) stage onto the theme background, then encode as
      // JPEG — an order of magnitude smaller than lossless PNG at no visible cost.
      const stageCanvas = stage.toCanvas({
        x: 0,
        y: 0,
        width: PAGE_W,
        height: PAGE_H,
        pixelRatio: PDF_PIXEL_RATIO,
      });
      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = stageCanvas.width;
      pageCanvas.height = stageCanvas.height;
      const ctx = pageCanvas.getContext("2d")!;
      ctx.fillStyle = theme.backgroundColor;
      ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      ctx.drawImage(stageCanvas, 0, 0);
      const dataUrl = pageCanvas.toDataURL("image/jpeg", PDF_JPEG_QUALITY);
      pdf.addImage(dataUrl, "JPEG", 0, 0, PAGE_W, PAGE_H, undefined, "FAST");
    }

    stage.position(originalPos);
    stage.scale({ x: originalScale, y: originalScale });
    trRef.current?.nodes?.(selectedNodes);
    trRef.current?.getLayer()?.batchDraw();
    stage.batchDraw();
    pdf.save("spaces-export.pdf");
  };

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (!boardId || !stageRef.current) return;
      const stage = stageRef.current;
      const pointer = stage.getPointerPosition() || { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      const x = (pointer.x - stage.x()) / stage.scaleX();
      const y = (pointer.y - stage.y()) / stage.scaleY();
      const topZ = () =>
        useStore.getState().cachedItems.reduce((m, i) => Math.max(m, i.zIndex ?? 0), 0) + 1;
      const text = e.clipboardData?.getData("text");
      if (text) {
        if (!hasInteracted) setHasInteracted(boardId, true);
        saveItemDb({
          type: "text",
          x,
          y,
          content: text,
          fontFamily: theme.fontFamily,
          color: theme.textColor,
          zIndex: topZ(),
          boardId,
        });
        return;
      }
      const clipboardItems = e.clipboardData?.items;
      if (clipboardItems) {
        for (let i = 0; i < clipboardItems.length; i++) {
          if (clipboardItems[i].type.indexOf("image") !== -1) {
            const blob = clipboardItems[i].getAsFile();
            if (blob) {
              if (!hasInteracted) setHasInteracted(boardId, true);
              const img = new Image();
              const objectUrl = URL.createObjectURL(blob);
              img.src = objectUrl;
              img.onload = async () => {
                let w = img.width,
                  h = img.height;
                let bw = w,
                  bh = h;
                if (bw > 600 || bh > 600) {
                  const r = Math.min(600 / bw, 600 / bh);
                  bw *= r;
                  bh *= r;
                }
                const curScale = stageRef.current?.scaleX() || 1;
                if (curScale > 1) {
                  bw /= curScale;
                  bh /= curScale;
                }
                try {
                  const uploadUrl = await generateImageUploadUrl({});
                  const response = await fetch(uploadUrl, {
                    method: "POST",
                    headers: { "Content-Type": blob.type || "application/octet-stream" },
                    body: blob,
                  });
                  if (!response.ok) throw new Error(`Image upload failed (${response.status})`);
                  const { storageId } = await response.json() as { storageId: string };
                  await saveItemDb({
                    type: "image",
                    x,
                    y,
                    width: bw,
                    height: bh,
                    content: "",
                    storageId: storageId as Id<"_storage">,
                    zIndex: topZ(),
                    boardId,
                  });
                } catch (error) {
                  // Keep paste usable offline: only the fallback is resized/compressed into the item.
                  console.warn("Full-resolution upload unavailable; using local image fallback", error);
                  const canvas = document.createElement("canvas");
                  const maxDim = 1200;
                  const ratio = Math.min(1, maxDim / w, maxDim / h);
                  canvas.width = Math.round(w * ratio);
                  canvas.height = Math.round(h * ratio);
                  canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
                  await saveItemDb({
                    type: "image",
                    x,
                    y,
                    width: bw,
                    height: bh,
                    content: canvas.toDataURL("image/jpeg", 0.82),
                    zIndex: topZ(),
                    boardId,
                  });
                } finally {
                  URL.revokeObjectURL(objectUrl);
                }
              };
            }
          }
        }
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [saveItemDb, generateImageUploadUrl, theme, boardId, hasInteracted, setHasInteracted]);

  const handleTextBlur = () => {
    if (!editingText || !boardId) return;
    // Residual canvas pointer events can steal focus right after opening — re-focus.
    if (Date.now() < ignoreBlurUntil.current) {
      window.setTimeout(() => textEditorRef.current?.focus(), 0);
      return;
    }
    writeTextDraft(boardId, null);
    // Prefer live DOM value so the last keystroke is never lost to a stale render.
    const content = textEditorRef.current?.value ?? editingText.content;
    const isTemp = editingText._id && String(editingText._id).startsWith("temp-");
    const isReal = editingText._id && !isTemp;
    const fontSize = editingText.fontSize ?? BASE_FONT_SIZE;
    const metrics = measureTextBox(content, theme.fontFamily, fontSize);
    if (content.trim().length > 0) {
      if (isReal) {
        const existing = items.find((i) => i._id === editingText._id);
        // A size change while typing re-fits the box; otherwise it only grows.
        const fontChanged = (existing?.fontSize ?? BASE_FONT_SIZE) !== fontSize;
        const width = fontChanged ? metrics.width : Math.max(existing?.width || 0, metrics.width);
        const height = fontChanged ? metrics.height : Math.max(existing?.height || 0, metrics.height);
        pushUndo(boardId, items);
        localUpdates.current.set(editingText._id!, { content, fontSize, width, height });
        setCachedItems(
          items.map((i) =>
            i._id === editingText._id ? { ...i, content, fontSize, width, height } : i,
          ),
        );
        saveItemDb({
          id: editingText._id as Id<"items">,
          type: "text",
          content,
          boardId,
          x: editingText.x,
          y: editingText.y,
          width,
          height,
          fontSize,
        });
      } else {
        const tempId = `temp-${Date.now()}`;
        const zIndex = nextZIndex();
        pushUndo(boardId, items);
        setCachedItems([
          ...items.filter((i) => i._id !== editingText._id),
          {
            _id: tempId,
            _creationTime: Date.now(),
            type: "text",
            x: editingText.x,
            y: editingText.y,
            width: metrics.width,
            height: metrics.height,
            content,
            fontFamily: theme.fontFamily,
            fontSize,
            color: theme.textColor,
            zIndex,
          },
        ]);
        saveItemDb({
          type: "text",
          x: editingText.x,
          y: editingText.y,
          width: metrics.width,
          height: metrics.height,
          content,
          fontFamily: theme.fontFamily,
          fontSize,
          color: theme.textColor,
          zIndex,
          boardId,
        }).then((newId) => {
          const local = localUpdates.current.get(tempId);
          if (local) {
            localUpdates.current.delete(tempId);
            localUpdates.current.set(newId, local);
          }
          updateHistoryIds(boardId, tempId, newId);
          setSelectedIds((previous) =>
            previous.map((id) => id === tempId ? newId : id),
          );
        });
      }
    } else if (isReal) {
      pushUndo(boardId, items);
      pendingDeletes.current.add(editingText._id!);
      setCachedItems(items.filter((i) => i._id !== editingText._id));
      deleteItemDb({ id: editingText._id as Id<"items"> });
    } else if (isTemp) {
      setCachedItems(items.filter((i) => i._id !== editingText._id));
    }
    setEditingText(null);
    setMode("select");
  };

  const itemPointerDown = (id: string, e?: any) => {
    if (croppingId && id !== croppingId) finishCrop(true);
    if (formatPainterActive && formatStyle && boardId) {
      if (e) e.cancelBubble = true;
      const target = itemsById.get(id);
      if (!target || target.type === "connector" || target.type === "frame") return;
      const patch = {
        color: formatStyle.color,
        fontFamily: formatStyle.fontFamily,
        fontSize: formatStyle.fontSize,
      };
      pushUndo(boardId, items);
      localUpdates.current.set(id, { ...(localUpdates.current.get(id) ?? {}), ...patch });
      setCachedItems(items.map((item) => item._id === id ? { ...item, ...patch } : item));
      persistItem({ ...target, ...patch });
      setSelectedIds([id]);
      setFormatPainterActive(false);
      return;
    }
    // In text/draw modes, clicks on items shouldn't select them (they belong to the active tool).
    if (mode !== "select") return;
    const item = itemsById.get(id);
    // Clicking the frame selects/moves the full group; clicking a child edits that child directly.
    const frameId = item?.type === "frame" ? item._id : undefined;
    const targetIds = frameId
      ? items.filter((candidate) => candidate._id === frameId || candidate.groupId === frameId).map((candidate) => candidate._id)
      : [id];
    const additive = Boolean(e?.evt?.shiftKey || e?.evt?.ctrlKey || e?.evt?.metaKey);
    setSelectedIds((prev) => {
      if (!additive) return targetIds.every((targetId) => prev.includes(targetId)) ? prev : targetIds;
      const allSelected = targetIds.every((targetId) => prev.includes(targetId));
      return allSelected
        ? prev.filter((selectedId) => !targetIds.includes(selectedId))
        : [...new Set([...prev, ...targetIds])];
    });
  };

  const nodeDragStart = (item: CanvasItem) => {
    // The selection box starts drags on the other selected items too; they're
    // already part of the move the first item kicked off.
    if (groupDrag.current?.start.has(item._id)) return;
    livePos.current.set(item._id, { x: item.x, y: item.y });
    const frameId = item.type === "frame" ? item._id : undefined;
    const dragIds = frameId
      ? items.filter((candidate) => candidate._id === frameId || candidate.groupId === frameId).map((candidate) => candidate._id)
      : selectedIds;
    if (dragIds.length > 1 && dragIds.includes(item._id)) {
      const start = new Map<string, { x: number; y: number }>();
      for (const id of dragIds) {
        const it = itemsById.get(id);
        if (it && it.type !== "connector") {
          start.set(id, { x: it.x, y: it.y });
          livePos.current.set(id, { x: it.x, y: it.y });
        }
      }
      groupDrag.current = { anchorId: item._id, start };
    } else {
      groupDrag.current = null;
    }
  };

  const syncArrowHandles = (id: string, x: number, y: number, w: number, h: number) => {
    const stage = stageRef.current;
    if (!stage) return;
    const start = stage.findOne("#ah-start-" + id);
    const end = stage.findOne("#ah-end-" + id);
    if (start) start.position({ x, y });
    if (end) end.position({ x: x + w, y: y + h });
  };

  const nodeDragMove = (e: any, item: CanvasItem) => {
    const g = groupDrag.current;
    const stage = stageRef.current;
    // Followers are positioned by the item that started the group move.
    if (g && g.anchorId !== item._id && g.start.has(item._id)) return;
    if (g && g.anchorId === item._id) {
      const anchorStart = g.start.get(item._id);
      if (!anchorStart) return;
      const dx = e.target.x() - anchorStart.x;
      const dy = e.target.y() - anchorStart.y;
      g.start.forEach((s, id) => {
        livePos.current.set(id, { x: s.x + dx, y: s.y + dy });
        if (id === item._id) return;
        const other = stage?.findOne("#" + id);
        if (other) other.position({ x: s.x + dx, y: s.y + dy });
        const it = itemsById.get(id);
        if (it?.type === "arrow") {
          syncArrowHandles(id, s.x + dx, s.y + dy, it.width ?? DEFAULT_ARROW_LENGTH, it.height ?? 0);
        }
      });
      livePos.current.set(item._id, { x: e.target.x(), y: e.target.y() });
      if (item.type === "arrow") {
        syncArrowHandles(item._id, e.target.x(), e.target.y(), item.width ?? DEFAULT_ARROW_LENGTH, item.height ?? 0);
      }
      scheduleConnectorRefresh();
      trRef.current?.forceUpdate();
      stage?.batchDraw();
      return;
    }
    livePos.current.set(item._id, { x: e.target.x(), y: e.target.y() });
    // Solo arrow drag: keep endpoint dots glued to the shaft
    if (item.type === "arrow") {
      syncArrowHandles(item._id, e.target.x(), e.target.y(), item.width ?? DEFAULT_ARROW_LENGTH, item.height ?? 0);
    }
    if (item.type === "rect") scheduleConnectorRefresh();
    stage?.batchDraw();
  };

  const nodeDragEnd = (e: any, item: CanvasItem) => {
    cancelConnectorRefresh();
    const g = groupDrag.current;
    if (g && g.start.has(item._id) && boardId) {
      // Every moved item reports its own drag end; save the whole group once.
      if (g.done) return;
      g.done = true;
      window.setTimeout(() => {
        if (groupDrag.current === g) groupDrag.current = null;
      }, 0);
      const anchorNode = item._id === g.anchorId ? e.target : stageRef.current?.findOne("#" + g.anchorId);
      const refNode = anchorNode ?? e.target;
      const refStart = g.start.get(anchorNode ? g.anchorId : item._id)!;
      const dx = refNode.x() - refStart.x;
      const dy = refNode.y() - refStart.y;
      pushUndo(boardId, items);
      if (!hasInteracted) setHasInteracted(boardId, true);
      const moved = new Map<string, { x: number; y: number }>();
      g.start.forEach((s, id) => moved.set(id, { x: s.x + dx, y: s.y + dy }));
      moved.forEach((pos, id) => {
        const prev = localUpdates.current.get(id) ?? {};
        localUpdates.current.set(id, { ...prev, ...pos });
      });
      const nextItems = items.map((i) => (moved.has(i._id) ? { ...i, ...moved.get(i._id)! } : i));
      const withConnectors = updateConnectorBounds(nextItems);
      setCachedItems(withConnectors);
      moved.forEach((pos, id) => {
        const it = withConnectors.find((i) => i._id === id);
        if (it) persistItem({ ...it, x: pos.x, y: pos.y });
      });
      livePos.current.clear();
      return;
    }
    groupDrag.current = null;
    itemDragEnd(e, item);
  };

  const itemDragEnd = (e: any, item: CanvasItem) => {
    if (!boardId) return;
    const newX = e.target.x(),
      newY = e.target.y();
    pushUndo(boardId, items);
    if (!hasInteracted) setHasInteracted(boardId, true);
    const prev = localUpdates.current.get(item._id) ?? {};
    localUpdates.current.set(item._id, { ...prev, x: newX, y: newY });
    const movedItem = { ...item, x: newX, y: newY };
    const nextItems = items.map((i) => (i._id === item._id ? movedItem : i));
    const withConnectors = updateConnectorBounds(nextItems);
    setCachedItems(withConnectors);
    livePos.current.clear();
    saveItemDb({
      id: item._id as Id<"items">,
      type: item.type,
      content: item.content,
      boardId,
      x: newX,
      y: newY,
    });
  };

  const patchConnector = (connector: CanvasItem, patch: Partial<CanvasItem>) => {
    if (!boardId) return;
    const patched = { ...connector, waypoints: [], ...patch };
    if (patched.fromId && patched.toId && patched.fromPort && patched.toPort) {
      const pts = connectorPoints(
        itemsById.get(patched.fromId),
        itemsById.get(patched.toId),
        patched.fromPort,
        patched.toPort,
        undefined,
        items,
      );
      if (pts) Object.assign(patched, pointsBounds(pts));
    }
    pushUndo(boardId, items);
    localUpdates.current.set(connector._id, {
      ...(localUpdates.current.get(connector._id) ?? {}),
      ...patch,
    });
    setCachedItems(items.map((item) => item._id === connector._id ? patched : item));
    persistItem(patched);
  };

  // Commit a multi-selection resize as one edit. Per-node handlers otherwise
  // overwrite each other using the same pre-transform React snapshot.
  const transformedItems = (): CanvasItem[] => {
    const nodes: Konva.Node[] = trRef.current?.nodes() ?? [];
    return nodes.flatMap((node) => {
      const item = itemsById.get(node.id());
      if (!item) return [];
      const sx = node.scaleX();
      const sy = node.scaleY();
      if (item.type === "text") {
        const fontSize = Math.max(6, Math.round((item.fontSize ?? BASE_FONT_SIZE) * Math.max(sx, sy)));
        return [{ ...item, x: node.x(), y: node.y(), fontSize,
          ...measureTextBox(item.content, item.fontFamily || theme.fontFamily, fontSize) }];
      }
      const width = item.width ?? (item.type === "rect" ? DEFAULT_RECT_WIDTH : node.width());
      const height = item.height ?? (item.type === "rect" ? DEFAULT_RECT_HEIGHT : node.height());
      return [{ ...item, x: node.x(), y: node.y(),
        width: Math.max(5, width * sx), height: Math.max(5, height * sy) }];
    });
  };

  const selectionTransformMove = () => {
    for (const item of transformedItems()) {
      livePos.current.set(item._id, {
        x: item.x, y: item.y, width: item.width, height: item.height,
      });
    }
    scheduleConnectorRefresh();
  };

  const selectionTransformEnd = () => {
    if (!boardId) return;
    cancelConnectorRefresh();
    const resized = transformedItems();
    if (resized.length === 0) return;
    const currentItems = useStore.getState().cachedItems;
    pushUndo(boardId, currentItems);
    if (!hasInteracted) setHasInteracted(boardId, true);
    const byId = new Map(resized.map((item) => [item._id, item]));
    const nodes: Konva.Node[] = trRef.current?.nodes() ?? [];
    nodes.forEach((node) => node.scale({ x: 1, y: 1 }));
    for (const item of resized) {
      const patch = { x: item.x, y: item.y, width: item.width, height: item.height,
        ...(item.type === "text" ? { fontSize: item.fontSize } : {}) };
      localUpdates.current.set(item._id, { ...(localUpdates.current.get(item._id) ?? {}), ...patch });
      persistItem(item);
    }
    livePos.current.clear();
    setCachedItems(updateConnectorBounds(currentItems.map((item) => byId.get(item._id) ?? item)));
  };

  // Keep keyboard/action handlers pointing at the latest implementations.
  actionRefs.current.deleteItems = deleteItems;
  actionRefs.current.reconcileHistory = reconcileHistory;
  /** Apply an edit to each selected picture as one undo step. */
  const editSelectedImages = (edit: (item: CanvasItem) => Partial<CanvasItem>) => {
    if (!boardId) return;
    const targets = items.filter((item) => selectedIds.includes(item._id) && item.type === "image");
    if (targets.length === 0) return;
    pushUndo(boardId, items);
    if (!hasInteracted) setHasInteracted(boardId, true);
    const patchedById = new Map<string, CanvasItem>();
    for (const item of targets) {
      const patch = edit(item);
      patchedById.set(item._id, { ...item, ...patch });
      localUpdates.current.set(item._id, { ...(localUpdates.current.get(item._id) ?? {}), ...patch });
      persistItem({ ...item, ...patch });
    }
    setCachedItems(items.map((item) => patchedById.get(item._id) ?? item));
  };

  /** Turn pictures a quarter turn (1 = clockwise), keeping each centred. */
  const rotateSelectedImages = (direction: 1 | -1) =>
    editSelectedImages((item) => {
      // A picture mirrored on one axis turns the other way underneath.
      const step = item.flipX !== item.flipY ? -direction : direction;
      const w = item.width ?? 0;
      const h = item.height ?? 0;
      return {
        rotation: (((item.rotation ?? 0) + step * 90) % 360 + 360) % 360,
        x: item.x + (w - h) / 2,
        y: item.y + (h - w) / 2,
        width: h,
        height: w,
      };
    });

  const flipSelectedImages = (axis: "x" | "y") =>
    editSelectedImages((item) => (axis === "x" ? { flipX: !item.flipX } : { flipY: !item.flipY }));

  const startCrop = (id: string) => {
    setSelectedIds([id]);
    setCroppingId(id);
  };

  /** Leave crop mode, saving the new crop unless cancelled. */
  const finishCrop = (apply: boolean) => {
    const item = croppingId ? itemsById.get(croppingId) : undefined;
    const box = cropperRef.current?.getBox();
    setCroppingId(null);
    if (!apply || !item || !box || !boardId) return;
    const area = fullImageBox(item);
    const onScreen = {
      x: (box.x - area.x) / area.width,
      y: (box.y - area.y) / area.height,
      width: box.width / area.width,
      height: box.height / area.height,
    };
    const patch: Partial<CanvasItem> = {
      crop: screenCropToSource(onScreen, item),
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
    };
    pushUndo(boardId, items);
    localUpdates.current.set(item._id, { ...(localUpdates.current.get(item._id) ?? {}), ...patch });
    setCachedItems(items.map((i) => (i._id === item._id ? { ...i, ...patch } : i)));
    persistItem({ ...item, ...patch });
  };

  actionRefs.current.adjustFontSize = adjustSelectedFontSize;
  actionRefs.current.finishCrop = finishCrop;
  actionRefs.current.wheel = handleWheel;

  // Scrolling or pinching over the open text box moves the canvas like anywhere else.
  const editorKey = editingText ? (editingText._id ?? `new-${editingText.x}-${editingText.y}`) : null;
  useEffect(() => {
    const el = textEditorRef.current;
    if (!el || !editorKey) return;
    const onWheel = (e: WheelEvent) => {
      stageRef.current?.setPointersPositions(e);
      actionRefs.current.wheel({ evt: e });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [editorKey]);

  const zoomPct = Math.round(scale * 100);
  const selectedIsText =
    selectedIds.length === 1 && items.some((i) => i._id === selectedIds[0] && i.type === "text");
  const selectedArrows = items.filter((i) => i.type === "arrow" && selectedIds.includes(i._id));
  const selectedConnectors = items.filter(
    (i) => i.type === "connector" && selectedIds.includes(i._id),
  );
  const selectedConnector = selectedConnectors.length === 1 ? selectedConnectors[0] : undefined;
  const selectedOnlyLines =
    selectedIds.length > 0 &&
    selectedIds.every((id) => {
      const t = itemsById.get(id)?.type;
      return t === "arrow" || t === "connector";
    });
  const selectedShape =
    selectedIds.length === 1
      ? items.find(
          (i) =>
            i._id === selectedIds[0] &&
            (i.type === "rect" || i.type === "arrow" || i.type === "connector" || i.type === "frame"),
        )
      : undefined;
  const selectedFrame = items.find(
    (item) => selectedIds.includes(item._id) && item.type === "frame",
  );
  const canCreateFrame = selectedIds.filter((id) => {
    const item = itemsById.get(id);
    return item && item.type !== "connector" && item.type !== "frame" && !item.groupId;
  }).length >= 2;
  const canUngroup = selectedIds.some((id) => {
    const item = itemsById.get(id);
    return item?.type === "frame" || Boolean(item?.groupId);
  });
  const singleSelectedItem = selectedIds.length === 1 ? itemsById.get(selectedIds[0]) : undefined;
  const selectedImageCount = selectedIds.filter((id) => itemsById.get(id)?.type === "image").length;
  const canCopyStyle = Boolean(
    singleSelectedItem && singleSelectedItem.type !== "connector" && singleSelectedItem.type !== "frame",
  );
  const presentationFrames = items
    .filter((item) => item.type === "frame")
    .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0) || a._creationTime - b._creationTime);

  const showPresentationFrame = (index: number) => {
    const normalized = Math.max(0, Math.min(index, presentationFrames.length - 1));
    const frame = presentationFrames[normalized];
    if (!frame) return;
    setPresentationIndex(normalized);
    jumpToItem(frame, true);
    setSelectedIds([]);
  };

  // Drag an arrow endpoint; `which: "start"` keeps the tip fixed, `"end"` keeps the tail fixed.
  const arrowEndpointDrag = (
    item: CanvasItem,
    which: "start" | "end",
    nx: number,
    ny: number,
    commit: boolean,
  ) => {
    if (!boardId) return;
    let patch: { x: number; y: number; width: number; height: number };
    if (which === "start") {
      const endX = item.x + (item.width ?? DEFAULT_ARROW_LENGTH);
      const endY = item.y + (item.height ?? 0);
      patch = { x: nx, y: ny, width: endX - nx, height: endY - ny };
    } else {
      patch = { x: item.x, y: item.y, width: nx - item.x, height: ny - item.y };
    }
    const arrowNode = stageRef.current?.findOne("#" + item._id);
    if (arrowNode) {
      arrowNode.position({ x: patch.x, y: patch.y });
      arrowNode.points([0, 0, patch.width, patch.height]);
      arrowNode.getLayer()?.batchDraw();
    }
    if (!commit) return;
    pushUndo(boardId, items);
    if (!hasInteracted) setHasInteracted(boardId, true);
    localUpdates.current.set(item._id, { ...(localUpdates.current.get(item._id) ?? {}), ...patch });
    setCachedItems(items.map((i) => (i._id === item._id ? { ...i, ...patch } : i)));
    if (!String(item._id).startsWith("temp-")) {
      saveItemDb({
        id: item._id as Id<"items">,
        type: "arrow",
        content: item.content,
        color: item.color,
        boardId,
        ...patch,
      });
    }
  };
  useEffect(() => () => {
    window.clearTimeout(viewSyncTimer.current);
    cancelAnimationFrame(connectorRouteRaf.current);
    connectorRouteRaf.current = 0;
    livePos.current.clear();
    groupDrag.current = null;
  }, [boardId]);

  const editingFontSize = editingText?.fontSize ?? BASE_FONT_SIZE;
  const editingMetrics = editingText
    ? measureTextBox(editingText.content, theme.fontFamily, editingFontSize)
    : null;
  const pageGridStartX = Math.floor((-position.x / scale) / 794) - 1;
  const pageGridEndX = Math.ceil((canvasSize.width - position.x) / scale / 794) + 1;
  const pageGridStartY = Math.floor((-position.y / scale) / 1123) - 1;
  const pageGridEndY = Math.ceil((canvasSize.height - position.y) / scale / 1123) + 1;

  return (
    <div
      ref={containerRef}
      style={{
        width: "100vw",
        height: "100vh",
        backgroundColor: theme.backgroundColor,
        overflow: "hidden",
        transition: "background-color 0.4s ease",
        cursor: spacePan
          ? "grab"
          : formatPainterActive || mode === "text" || mode === "rect" || mode === "arrow"
            ? "crosshair"
            : "default",
      }}
    >
      <BoardSwitcher
        boards={boards}
        onBoardChange={() => {
          localUpdates.current.clear();
          pendingDeletes.current.clear();
        }}
      />

      {!boardReady ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            top: 48,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: theme.mutedColor,
            fontFamily: theme.fontFamily,
            fontSize: 13,
          }}
        >
          Loading board…
        </div>
      ) : (
        <>
      {menuCollapsed ? (
        <button
          className="toolbar-shell"
          onClick={() => setMenuCollapsed(false)}
          title="Expand menu · M"
          style={{ minWidth: 84, padding: "10px 14px", gap: 8, cursor: "pointer", border: "1px solid var(--border)" }}
        >
          <SlidersHorizontal size={15} />
          <span style={{ fontSize: 12, fontWeight: 600 }}>Menu</span>
        </button>
      ) : (
        <div className="toolbar-shell">
          <button
            className={`tool-btn icon-only${mode === "select" ? " active" : ""}`}
            onClick={() => setMode("select")}
            title="Select · S"
          >
            <MousePointer2 size={15} />
          </button>
          <button
            className={`tool-btn icon-only${mode === "text" ? " active" : ""}`}
            onClick={() => setMode("text")}
            title="Text · T"
          >
            <Type size={15} />
          </button>
          <button
            className={`tool-btn icon-only${mode === "rect" ? " active" : ""}`}
            onClick={() => setMode("rect")}
            title="Rectangle · R — drag to draw"
          >
            <Square size={15} />
          </button>
          <button
            className={`tool-btn icon-only${mode === "arrow" ? " active" : ""}`}
            onClick={() => setMode("arrow")}
            title="Arrow · A — drag box to box to link them"
          >
            <ArrowUpRight size={15} />
          </button>
          {selectedShape && (
            <label
              className="tool-btn icon-only"
              title="Shape color"
              style={{ padding: 0, position: "relative", overflow: "hidden" }}
            >
              <span
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 5,
                  background: selectedShape.color || theme.accentColor,
                  border: "1px solid var(--border-strong)",
                }}
              />
              <input
                type="color"
                value={selectedShape.color || theme.accentColor}
                onChange={(e) => setShapeColor(selectedShape, e.target.value)}
                style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}
              />
            </label>
          )}

          {selectedConnector && (
            <>
              <input
                key={`${selectedConnector._id}-${selectedConnector.content}`}
                defaultValue={selectedConnector.content}
                placeholder="Edge label"
                aria-label="Connector label"
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
                onBlur={(event) => {
                  if (event.currentTarget.value !== selectedConnector.content) {
                    patchConnector(selectedConnector, { content: event.currentTarget.value });
                  }
                }}
                style={{
                  width: 92,
                  height: 28,
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "0 8px",
                  background: "var(--surface)",
                  color: "var(--text)",
                  font: "inherit",
                  fontSize: 11,
                }}
              />
              <button
                className="tool-btn"
                onClick={() => patchConnector(selectedConnector, { directed: selectedConnector.directed === false })}
                title="Toggle one-way / undirected"
                style={{ minWidth: 32, paddingInline: 8 }}
              >
                {selectedConnector.directed === false ? "—" : "→"}
              </button>
            </>
          )}

          {selectedFrame && (
            <input
              key={`${selectedFrame._id}-${selectedFrame.content}`}
              defaultValue={selectedFrame.content === "Frame" ? "" : selectedFrame.content}
              placeholder="Frame title"
              aria-label="Frame title"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Enter") event.currentTarget.blur();
              }}
              onBlur={(event) => {
                if (event.currentTarget.value !== (selectedFrame.content === "Frame" ? "" : selectedFrame.content)) {
                  const content = event.currentTarget.value;
                  pushUndo(boardId, items);
                  localUpdates.current.set(selectedFrame._id, {
                    ...(localUpdates.current.get(selectedFrame._id) ?? {}),
                    content,
                  });
                  setCachedItems(items.map((item) => item._id === selectedFrame._id ? { ...item, content } : item));
                  persistItem({ ...selectedFrame, content });
                }
              }}
              style={{
                width: 92,
                height: 28,
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "0 8px",
                background: "var(--surface)",
                color: "var(--text)",
                font: "inherit",
                fontSize: 11,
              }}
            />
          )}

          {croppingId ? (
            <>
              <button className="tool-btn" onClick={() => cropperRef.current?.reset()} title="Show the whole picture again">
                reset
              </button>
              <button className="tool-btn" onClick={() => finishCrop(false)} title="Cancel · Esc">
                cancel
              </button>
              <button className="tool-btn active" onClick={() => finishCrop(true)} title="Keep this crop · Enter">
                done
              </button>
              <div className="toolbar-divider" />
            </>
          ) : selectedImageCount > 0 && (
            <>
              {selectedImageCount === 1 && selectedIds.length === 1 && (
                <button
                  className="tool-btn icon-only"
                  onClick={() => startCrop(selectedIds[0])}
                  title="Crop · or double-click the picture"
                  aria-label="Crop"
                >
                  <Crop size={15} />
                </button>
              )}
              <button className="tool-btn icon-only" onClick={() => rotateSelectedImages(-1)} title="Turn left" aria-label="Turn left">
                <RotateCcw size={15} />
              </button>
              <button className="tool-btn icon-only" onClick={() => rotateSelectedImages(1)} title="Turn right" aria-label="Turn right">
                <RotateCw size={15} />
              </button>
              <button className="tool-btn icon-only" onClick={() => flipSelectedImages("x")} title="Mirror left–right" aria-label="Mirror left to right">
                <FlipHorizontal2 size={15} />
              </button>
              <button className="tool-btn icon-only" onClick={() => flipSelectedImages("y")} title="Mirror top–bottom" aria-label="Mirror top to bottom">
                <FlipVertical2 size={15} />
              </button>
              <div className="toolbar-divider" />
            </>
          )}

          {canCreateFrame && (
            <button
              className="tool-btn"
              onClick={createFrameFromSelection}
              title="Group selection in a titled frame"
              style={{ paddingInline: 9, fontSize: 11 }}
            >
              frame
            </button>
          )}
          {canUngroup && (
            <button
              className="tool-btn"
              onClick={ungroupSelection}
              title="Remove frame and keep its contents"
              style={{ paddingInline: 9, fontSize: 11 }}
            >
              ungroup
            </button>
          )}
          <div className="toolbar-divider" />

          <button
            className={`tool-btn icon-only${showGrid ? " active-subtle" : ""}`}
            onClick={toggleGrid}
            title="Grid · G"
            aria-label="Toggle page grid"
            aria-pressed={showGrid}
          >
            <LayoutGrid size={15} />
          </button>

          {canCopyStyle && (
            <button
              className={`tool-btn icon-only${formatPainterActive ? " active" : ""}`}
              onClick={() => {
                setFormatStyle({
                  color: singleSelectedItem?.color,
                  fontFamily: singleSelectedItem?.fontFamily,
                  fontSize: singleSelectedItem?.fontSize,
                });
                setFormatPainterActive(true);
              }}
              title="Copy style, then click another item"
            >
              <Paintbrush size={15} />
            </button>
          )}
          {presentationFrames.length > 0 && (
            <button
              className="tool-btn icon-only"
              onClick={() => showPresentationFrame(0)}
              title="Present frames in layer order"
            >
              <Presentation size={15} />
            </button>
          )}
          <button
            className={`tool-btn icon-only${showLayers ? " active-subtle" : ""}`}
            onClick={() => {
              setShowLayers(!showLayers);
              setShowSettings(false);
              setShowCheckpoints(false);
            }}
            title="Layers · L"
          >
            <Layers size={15} />
          </button>
          <button
            className={`tool-btn icon-only${showCheckpoints ? " active-subtle" : ""}`}
            onClick={() => {
              setShowCheckpoints(!showCheckpoints);
              setShowSettings(false);
              setShowLayers(false);
            }}
            title="Checkpoints"
          >
            <GitCommitHorizontal size={15} />
          </button>
          <button
            className={`tool-btn icon-only${showSettings ? " active-subtle" : ""}`}
            onClick={() => {
              setShowSettings(!showSettings);
              setShowCheckpoints(false);
              setShowLayers(false);
            }}
            title="Settings · ,"
          >
            <SlidersHorizontal size={15} />
          </button>

          <div className="toolbar-divider" />

          <button className="zoom-reset" onClick={resetView} title="Reset view to 100%">
            {zoomPct}%
          </button>
        </div>
      )}

      <ThemePanel
        visible={showSettings}
        onClose={() => setShowSettings(false)}
        boardId={boardId}
        onExportPDF={handleExportPDF}
        showGrid={showGrid}
        onToggleGrid={toggleGrid}
      />

      <CheckpointPanel
        visible={showCheckpoints}
        onClose={() => setShowCheckpoints(false)}
        boardId={boardId}
        onRestored={() => {
          setSelectedIds([]);
          setEditingText(null);
          setShowCheckpoints(false);
        }}
      />

      <LayersPanel
        visible={showLayers}
        onClose={() => setShowLayers(false)}
        layers={[...orderedItems].reverse()}
        selectedIds={selectedIds}
        onSelect={(id) => {
          setMode("select");
          setSelectedIds([id]);
        }}
        onBringForward={bringForward}
        onSendBackward={sendBackward}
        onDelete={(id) => deleteItems([id])}
      />

      {presentationIndex !== null && presentationFrames[presentationIndex] && (
        <div
          style={{
            position: "absolute",
            right: 20,
            top: 66,
            zIndex: 55,
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: 6,
            border: "1px solid var(--border)",
            borderRadius: 12,
            background: "var(--surface)",
            boxShadow: "0 12px 35px rgba(0,0,0,.14)",
          }}
        >
          <button className="tool-btn" disabled={presentationIndex === 0} onClick={() => showPresentationFrame(presentationIndex - 1)}>←</button>
          <span style={{ fontSize: 11, color: "var(--muted)", minWidth: 105, textAlign: "center" }}>
            {presentationFrames[presentationIndex].content && presentationFrames[presentationIndex].content !== "Frame"
              ? presentationFrames[presentationIndex].content
              : "Untitled frame"} · {presentationIndex + 1}/{presentationFrames.length}
          </span>
          <button className="tool-btn" disabled={presentationIndex === presentationFrames.length - 1} onClick={() => showPresentationFrame(presentationIndex + 1)}>→</button>
          <button className="tool-btn" onClick={() => setPresentationIndex(null)}>Exit</button>
        </div>
      )}

      {items.length === 0 && !editingText && !hasInteracted && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            textAlign: "center",
            pointerEvents: "none",
            userSelect: "none",
            color: theme.textColor,
            fontFamily: theme.fontFamily,
          }}
        >
          <div style={{ fontSize: 48, opacity: 0.06, marginBottom: 16 }}>✦</div>
          <p style={{ fontSize: 13, color: theme.mutedColor, margin: 0, lineHeight: 1.8, fontWeight: 500 }}>
            Ctrl+V to paste · T or double-click for text
            <br />
            R rect · A arrow (box to box links them) · Del to remove
          </p>
        </div>
      )}

      <div style={{ position: "absolute", top: 48, left: 0, right: 0, bottom: 0 }}>
      <Stage
        width={canvasSize.width}
        height={canvasSize.height}
        onWheel={handleWheel}
        scaleX={scale}
        scaleY={scale}
        x={position.x}
        y={position.y}
        ref={stageRef}
        onClick={handleStageClick}
        onDblClick={handleStageDblClick}
        onMouseDown={handleStageMouseDown}
        onMouseMove={handleStageMouseMove}
        onMouseUp={handleStageMouseUp}
        onTouchStart={handleStageMouseDown}
        onTouchMove={handleStageMouseMove}
        onTouchEnd={handleStageMouseUp}
      >
        <Layer perfectDrawEnabled={false}>
          {showGrid &&
            Array.from({ length: Math.max(0, pageGridEndX - pageGridStartX) }).map((_, i) =>
              Array.from({ length: Math.max(0, pageGridEndY - pageGridStartY) }).map((_, j) => (
                <Rect
                  key={`g-${pageGridStartX + i}-${pageGridStartY + j}`}
                  x={(pageGridStartX + i) * 794}
                  y={(pageGridStartY + j) * 1123}
                  width={794}
                  height={1123}
                  stroke={theme.textColor}
                  opacity={0.2}
                  strokeWidth={1 / scale}
                  dash={[6 / scale, 6 / scale]}
                  listening={false}
                  perfectDrawEnabled={false}
                  shadowForStrokeEnabled={false}
                />
              )),
            )}

          {orderedItems.map((item) => {
            if (item.type === "frame") {
              const width = item.width ?? 320;
              const height = item.height ?? 220;
              const color = item.color || theme.accentColor;
              const selected = selectedIds.includes(item._id);
              return (
                <Group
                  key={item._id}
                  id={item._id}
                  x={item.x}
                  y={item.y}
                  draggable={mode === "select" && !spacePan}
                  onPointerDown={(e: any) => itemPointerDown(item._id, e)}
                  onDragStart={() => nodeDragStart(item)}
                  onDragMove={(e: any) => nodeDragMove(e, item)}
                  onDragEnd={(e: any) => nodeDragEnd(e, item)}
                >
                  <Rect
                    width={width}
                    height={height}
                    cornerRadius={14}
                    fill={theme.surfaceColor}
                    opacity={0.58}
                    stroke={color}
                    strokeWidth={selected ? 2.5 : 1.5}
                    dash={selected ? [] : [8, 6]}
                    perfectDrawEnabled={false}
                    shadowForStrokeEnabled={false}
                  />
                  {item.content && item.content !== "Frame" && (
                    <KonvaText
                      x={14}
                      y={12}
                      width={Math.max(20, width - 28)}
                      text={item.content}
                      fontSize={item.fontSize ?? 14}
                      fontStyle="bold"
                      fontFamily={item.fontFamily || theme.fontFamily}
                      fill={theme.textColor}
                      listening={false}
                    />
                  )}
                </Group>
              );
            }

            if (item.type === "text") {
              if (editingText?._id === item._id) return null;

              const itemFontSize = item.fontSize ?? BASE_FONT_SIZE;
              // Prefer stored box size — avoid measureTextBox on every frame.
              const width = item.width || DEFAULT_TEXT_WIDTH;
              const height = item.height || DEFAULT_TEXT_HEIGHT;

              return (
                <KonvaText
                  key={item._id}
                  id={item._id}
                  x={item.x}
                  y={item.y}
                  text={item.content}
                  width={width}
                  height={height}
                  fontSize={itemFontSize}
                  lineHeight={1.2}
                  fontFamily={item.fontFamily || theme.fontFamily}
                  fill={item.color || theme.textColor}
                  wrap="none"
                  perfectDrawEnabled={false}
                  shadowForStrokeEnabled={false}
                  hitStrokeWidth={0}
                  draggable={mode === "select" && !spacePan}
                  onPointerDown={(e: any) => itemPointerDown(item._id, e)}
                  onDragStart={() => nodeDragStart(item)}
                  onDragMove={(e: any) => nodeDragMove(e, item)}
                  onDragEnd={(e: any) => nodeDragEnd(e, item)}
                />
              );
            }

            if (item.type === "rect") {
              const color = item.color || theme.accentColor;
              const w = item.width ?? DEFAULT_RECT_WIDTH;
              const h = item.height ?? DEFAULT_RECT_HEIGHT;
              // In arrow mode, ports are passive hints that arrows snap to boxes.
              const showPorts = mode === "arrow";
              const portR = 5 / scale;
              const ports: PortSide[] = ["n", "e", "s", "w"];
              return (
                <Group
                  key={item._id}
                  id={item._id}
                  x={item.x}
                  y={item.y}
                  draggable={mode === "select" && !spacePan}
                  onPointerDown={(e: any) => itemPointerDown(item._id, e)}
                  onDragStart={() => nodeDragStart(item)}
                  onDragMove={(e: any) => nodeDragMove(e, item)}
                  onDragEnd={(e: any) => nodeDragEnd(e, item)}
                >
                  {/* Outline only; free text is placed as separate items inside the box. */}
                  <Rect
                    width={w}
                    height={h}
                    stroke={color}
                    strokeWidth={2}
                    cornerRadius={8}
                    fill="rgba(0,0,0,0)"
                    perfectDrawEnabled={false}
                    shadowForStrokeEnabled={false}
                  />
                  {showPorts &&
                    ports.map((port) => {
                      // Ports are in local group coords (0,0 = rect top-left).
                      const local = {
                        n: { x: w / 2, y: 0 },
                        s: { x: w / 2, y: h },
                        e: { x: w, y: h / 2 },
                        w: { x: 0, y: h / 2 },
                      }[port];
                      return (
                        <Circle
                          key={port}
                          x={local.x}
                          y={local.y}
                          radius={portR}
                          fill={theme.surfaceColor}
                          stroke={theme.accentColor}
                          strokeWidth={1.5 / scale}
                          perfectDrawEnabled={false}
                          listening={false}
                        />
                      );
                    })}
                </Group>
              );
            }

            if (item.type === "connector") {
              const from = itemWithLivePos(item.fromId);
              const to = itemWithLivePos(item.toId);
              if (!from || !to || !item.fromPort || !item.toPort) return null;
              const pts = connectorRoutes.get(item._id);
              if (!pts || pts.length < 4) return null;
              const color = item.color || theme.accentColor;
              const isSelected = selectedIds.includes(item._id);
              const labelPoint = pathMidpoint(pts);
              const labelWidth = Math.max(36, item.content.length * 7.2 + 16);
              return (
                <React.Fragment key={item._id}>
                  <Arrow
                    id={item._id}
                    x={0}
                    y={0}
                    points={pts}
                    stroke={color}
                    fill={color}
                    strokeWidth={isSelected ? 2.5 : 2}
                    pointerAtEnding={item.directed !== false}
                    pointerLength={8}
                    pointerWidth={8}
                    lineCap="round"
                    lineJoin="round"
                    hitStrokeWidth={22}
                    perfectDrawEnabled={false}
                    shadowForStrokeEnabled={false}
                    draggable={false}
                    onPointerDown={(e: any) => itemPointerDown(item._id, e)}
                  />
                  {item.content && (
                    <Group id={`connector-label-${item._id}`} width={labelWidth} x={labelPoint.x - labelWidth / 2} y={labelPoint.y - 11} listening={false}>
                      <Rect
                        width={labelWidth}
                        height={22}
                        cornerRadius={6}
                        fill={theme.surfaceColor}
                        stroke={`${color}55`}
                        strokeWidth={1 / scale}
                      />
                      <KonvaText
                        text={item.content}
                        width={labelWidth}
                        height={22}
                        align="center"
                        verticalAlign="middle"
                        fontSize={12}
                        fontFamily={theme.fontFamily}
                        fill={theme.textColor}
                      />
                    </Group>
                  )}
                </React.Fragment>
              );
            }

            if (item.type === "arrow") {
              const color = item.color || theme.accentColor;
              const isSelected = selectedIds.includes(item._id);
              const dx = item.width ?? DEFAULT_ARROW_LENGTH;
              const dy = item.height ?? 0;
              return (
                <Arrow
                  key={item._id}
                  id={item._id}
                  x={item.x}
                  y={item.y}
                  points={[0, 0, dx, dy]}
                  stroke={color}
                  fill={color}
                  strokeWidth={isSelected ? 2.5 : 2.25}
                  pointerLength={11}
                  pointerWidth={11}
                  lineCap="round"
                  lineJoin="round"
                  hitStrokeWidth={22}
                  perfectDrawEnabled={false}
                  shadowForStrokeEnabled={false}
                  draggable={mode === "select" && !spacePan}
                  onPointerDown={(e: any) => itemPointerDown(item._id, e)}
                  onDragStart={() => nodeDragStart(item)}
                  onDragMove={(e: any) => nodeDragMove(e, item)}
                  onDragEnd={(e: any) => nodeDragEnd(e, item)}
                />
              );
            }

            // Sticky notes were removed; skip any legacy items instead of
            // letting them fall through to the image renderer.
            if (item.type !== "image") return null;

            if (croppingId === item._id) {
              return (
                <ImageCropper
                  key={item._id}
                  ref={cropperRef}
                  item={item}
                  accentColor={theme.accentColor}
                  surfaceColor={theme.surfaceColor}
                  scale={scale}
                />
              );
            }

            return (
              <CanvasImage
                key={item._id}
                id={item._id}
                x={item.x}
                y={item.y}
                url={item.content}
                width={item.width}
                height={item.height}
                rotation={item.rotation}
                flipX={item.flipX}
                flipY={item.flipY}
                crop={item.crop}
                draggable={mode === "select" && !spacePan}
                onPointerDown={(e: any) => itemPointerDown(item._id, e)}
                onDragStart={() => nodeDragStart(item)}
                onDragMove={(e: any) => nodeDragMove(e, item)}
                onDragEnd={(e: any) => nodeDragEnd(e, item)}
              />
            );
          })}

          {/* Always-mounted draw previews — toggled via ref, never re-render on pointer move */}
          <Rect
            ref={drawPreviewRectRef}
            visible={false}
            listening={false}
            stroke={theme.accentColor}
            strokeWidth={2}
            cornerRadius={8}
            fill="rgba(0,0,0,0)"
            dash={[6, 6]}
            perfectDrawEnabled={false}
          />
          <Arrow
            ref={drawPreviewArrowRef}
            visible={false}
            listening={false}
            points={[0, 0, 0, 0]}
            stroke={theme.accentColor}
            fill={theme.accentColor}
            strokeWidth={2.25}
            pointerLength={11}
            pointerWidth={11}
            lineCap="round"
            lineJoin="round"
            perfectDrawEnabled={false}
          />
          <Rect
            ref={marqueeRectRef}
            visible={false}
            listening={false}
            stroke={theme.accentColor}
            strokeWidth={1 / scale}
            fill={`${theme.accentColor}14`}
            perfectDrawEnabled={false}
          />
          {/* Free-arrow endpoint handles — two small dots instead of a cluttered resize box */}
          {mode === "select" &&
            selectedArrows.map((arrow) => {
              const color = arrow.color || theme.accentColor;
              const endX = arrow.x + (arrow.width ?? DEFAULT_ARROW_LENGTH);
              const endY = arrow.y + (arrow.height ?? 0);
              const r = 5.5 / scale;
              const strokeW = 1.5 / scale;
              const handle = (which: "start" | "end", hx: number, hy: number) => (
                <Circle
                  key={`${arrow._id}-${which}`}
                  id={which === "start" ? `ah-start-${arrow._id}` : `ah-end-${arrow._id}`}
                  x={hx}
                  y={hy}
                  radius={r}
                  fill={theme.surfaceColor}
                  stroke={color}
                  strokeWidth={strokeW}
                  perfectDrawEnabled={false}
                  shadowEnabled={false}
                  draggable
                  onMouseEnter={(e: any) => {
                    const stage = e.target.getStage();
                    if (stage) stage.container().style.cursor = "grab";
                  }}
                  onMouseLeave={(e: any) => {
                    const stage = e.target.getStage();
                    if (stage) stage.container().style.cursor = "default";
                  }}
                  onDragStart={(e: any) => {
                    e.cancelBubble = true;
                    const stage = e.target.getStage();
                    if (stage) stage.container().style.cursor = "grabbing";
                  }}
                  onDragMove={(e: any) => {
                    e.cancelBubble = true;
                    arrowEndpointDrag(arrow, which, e.target.x(), e.target.y(), false);
                  }}
                  onDragEnd={(e: any) => {
                    e.cancelBubble = true;
                    const stage = e.target.getStage();
                    if (stage) stage.container().style.cursor = "default";
                    arrowEndpointDrag(arrow, which, e.target.x(), e.target.y(), true);
                  }}
                />
              );
              return (
                <Group key={`arrow-handles-${arrow._id}`}>
                  {handle("start", arrow.x, arrow.y)}
                  {handle("end", endX, endY)}
                </Group>
              );
            })}

          {mode === "select" && selectedIds.length > 0 && !croppingId && (
            <Transformer
              ref={trRef}
              borderStroke={theme.accentColor}
              borderStrokeWidth={1}
              borderDash={[4 / scale, 4 / scale]}
              anchorStroke={theme.accentColor}
              anchorFill={theme.surfaceColor}
              anchorSize={8}
              anchorCornerRadius={2}
              rotateEnabled={false}
              flipEnabled={false}
              onTransform={selectionTransformMove}
              onTransformEnd={selectionTransformEnd}
              resizeEnabled={!selectedOnlyLines}
              borderEnabled={!selectedOnlyLines}
              keepRatio={selectedIsText}
              enabledAnchors={
                selectedOnlyLines
                  ? []
                  : selectedIsText
                    ? ["top-left", "top-right", "bottom-left", "bottom-right"]
                    : [
                        "top-left",
                        "top-right",
                        "bottom-left",
                        "bottom-right",
                        "middle-left",
                        "middle-right",
                        "top-center",
                        "bottom-center",
                      ]
              }
              boundBoxFunc={(oldBox, newBox) =>
                newBox.width < 5 || newBox.height < 5 ? oldBox : newBox
              }
            />
          )}
        </Layer>
      </Stage>

      {/* Free-floating HTML text editor — placed at the click, including inside rectangles. */}
      {editingText && (
        <textarea
          key={editorKey ?? undefined}
          ref={textEditorRef}
          autoFocus
          wrap="off"
          style={{
            position: "absolute",
            top: editingText.y * scale + position.y,
            left: editingText.x * scale + position.x,
            width: `${(editingMetrics?.width || DEFAULT_TEXT_WIDTH) * scale}px`,
            height: `${(editingMetrics?.height || DEFAULT_TEXT_HEIGHT) * scale}px`,
            zIndex: 100,
            border: "none",
            borderRadius: 0,
            padding: 0,
            margin: 0,
            resize: "none",
            background: "transparent",
            color: theme.textColor,
            fontFamily: theme.fontFamily,
            fontSize: `${editingFontSize * scale}px`,
            lineHeight: 1.2,
            whiteSpace: "pre",
            outline: "none",
            overflow: "hidden",
            boxSizing: "border-box",
            caretColor: theme.accentColor,
            pointerEvents: "auto",
          }}
          defaultValue={editingText.content}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onBlur={handleTextBlur}
          onKeyDown={(e) => {
            e.stopPropagation();
            // Ctrl+[ / Ctrl+] or Ctrl+Shift+< / > resize while typing.
            if ((e.ctrlKey || e.metaKey) && ["[", "]", "<", ">"].includes(e.key)) {
              e.preventDefault();
              adjustSelectedFontSize(e.key === "]" || e.key === ">" ? 2 : -2);
              return;
            }
            if (e.key === "Escape") {
              ignoreBlurUntil.current = 0;
              e.currentTarget.blur();
            }
          }}
          onInput={(e) => {
            resizeTextEditor(e.currentTarget, e.currentTarget.value);
            saveTextDraft();
          }}
        />
      )}
      </div>
        </>
      )}
    </div>
  );
};

export default App;
