import React, { useEffect, useLayoutEffect, useRef } from "react";
import { Stage, Layer, Text as KonvaText, Rect, Arrow, Transformer, Group, Circle } from "react-konva";
import jsPDF from "jspdf";
import {
  MousePointer2,
  Type,
  Square,
  ArrowUpRight,
  LayoutGrid,
  SlidersHorizontal,
  GitCommitHorizontal,
  Layers,
} from "lucide-react";
import { useStore } from "./store";
import CanvasImage from "./components/CanvasImage";
import ThemePanel from "./components/ThemePanel";
import CheckpointPanel from "./components/CheckpointPanel";
import LayersPanel from "./components/LayersPanel";
import BoardSwitcher from "./components/BoardSwitcher";
import { useBoardBootstrap } from "./hooks/useBoardBootstrap";
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { applyThemeToDocument } from "./themes";
import type { CanvasItem } from "./types";

const EMPTY_ARRAY: CanvasItem[] = [];
const DEFAULT_TEXT_WIDTH = 360;
const DEFAULT_TEXT_HEIGHT = 56;
const BASE_FONT_SIZE = 20;
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
  const viewport = boardId ? getViewport(boardId) : null;
  const showGrid = viewport?.showGrid ?? false;
  const hasInteracted = viewport?.hasInteracted ?? false;

  // Live camera lives in React state (and is applied directly to the Stage during wheel).
  // Store is only updated on a rAF throttle so pan/zoom never blocks the main thread with persist.
  const [scale, setScaleLocal] = React.useState(viewport?.scale ?? 1);
  const [position, setPositionLocal] = React.useState(viewport?.position ?? { x: 0, y: 0 });
  const scaleRef = useRef(scale);
  const positionRef = useRef(position);
  const viewSyncRaf = useRef(0);

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

  const scheduleViewSync = React.useCallback(() => {
    if (viewSyncRaf.current) return;
    viewSyncRaf.current = requestAnimationFrame(() => {
      viewSyncRaf.current = 0;
      setScaleLocal(scaleRef.current);
      setPositionLocal(positionRef.current);
      flushViewToStore();
    });
  }, [flushViewToStore]);

  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [showSettings, setShowSettings] = React.useState(false);
  const [showCheckpoints, setShowCheckpoints] = React.useState(false);
  const [showLayers, setShowLayers] = React.useState(false);
  const [menuCollapsed, setMenuCollapsed] = React.useState(false);
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
  const drawPreviewRectRef = useRef<any>(null);
  const drawPreviewArrowRef = useRef<any>(null);
  const localUpdates = useRef<Map<string, Partial<CanvasItem>>>(new Map());
  // IDs deleted optimistically but not yet confirmed by Convex — filter them out of db merges
  // so concurrent query updates don't briefly resurrect removed items.
  const pendingDeletes = useRef<Set<string>>(new Set());
  const groupDrag = useRef<{ anchorId: string; start: Map<string, { x: number; y: number }> } | null>(null);
  const drawStart = useRef<{ x: number; y: number; type: "rect" | "arrow" } | null>(null);
  const suppressClick = useRef(false);
  // Ignore blur right after opening the editor (mouseup/click after draw steals focus from the textarea).
  const ignoreBlurUntil = useRef(0);
  // Latest values for stable event listeners (avoids rebinding window handlers every render).
  const itemsRef = useRef<CanvasItem[]>([]);
  const selectedIdsRef = useRef<string[]>([]);
  const editingTextRef = useRef(editingText);
  const modeRef = useRef(mode);
  const actionRefs = useRef({
    deleteItems: (_ids: string[]) => {},
    reconcileHistory: async (_target: CanvasItem[]) => {},
  });

  useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  const resizeTextEditor = (textarea = textEditorRef.current, value = editingText?.content ?? "") => {
    if (!textarea || !editingText) return;
    const metrics = measureTextBox(value, theme.fontFamily, editingText.fontSize ?? BASE_FONT_SIZE);
    textarea.style.width = `${metrics.width * scale}px`;
    textarea.style.height = `${metrics.height * scale}px`;
  };

  useLayoutEffect(() => {
    if (editingText) resizeTextEditor();
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
          const allMatch = Object.entries(local).every(([k, v]) => (item as any)[k] === v);
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
  itemsRef.current = items;
  selectedIdsRef.current = selectedIds;
  editingTextRef.current = editingText;
  modeRef.current = mode;

  // Stable render order: ascending zIndex (front-most drawn last), ties keep insertion order.
  const orderedItems = React.useMemo(
    () =>
      items
        .map((item, i) => ({ item, i }))
        .sort((a, b) => (a.item.zIndex ?? 0) - (b.item.zIndex ?? 0) || a.i - b.i)
        .map(({ item }) => item),
    [items],
  );

  const nextZIndex = () => items.reduce((m, i) => Math.max(m, i.zIndex ?? 0), 0) + 1;

  useEffect(() => {
    if (!trRef.current || !stageRef.current) return;
    // Arrows use endpoint handles instead of the box transformer (which looks awful on thin lines).
    const nodes = selectedIds
      .map((id) => {
        const item = items.find((i) => i._id === id);
        if (!item || item.type === "arrow") return null;
        return stageRef.current.findOne("#" + id);
      })
      .filter(Boolean);
    trRef.current.nodes(nodes);
    trRef.current.getLayer()?.batchDraw();
  }, [selectedIds, items]);

  const handleWheel = (e: any) => {
    if (!boardId) return;
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };
    const newScale = Math.min(Math.max(e.evt.deltaY < 0 ? oldScale * 1.08 : oldScale / 1.08, 0.1), 5);
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
    // Double-click anywhere (canvas or inside a shape) → free text at that point.
    const p = worldPointer();
    if (!p) return;
    e.cancelBubble = true;
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

  const handleStageMouseDown = () => {
    suppressClick.current = false;
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

  const handleStageMouseMove = () => {
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

  const handleStageMouseUp = () => {
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
        width: Math.abs(dx),
        height: Math.abs(dy),
      });
    } else {
      commitShape("arrow", { x: start.x, y: start.y, width: dx, height: dy });
    }
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

  // Persist a full item (used for layer reordering + group moves).
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
    pushUndo(boardId, items);
    for (const id of ids) {
      if (!String(id).startsWith("temp-")) pendingDeletes.current.add(id);
    }
    setCachedItems(items.filter((i) => !del.has(i._id)));
    ids.forEach((id) => {
      if (!String(id).startsWith("temp-")) deleteItemDb({ id: id as Id<"items"> });
    });
    setSelectedIds((prev) => prev.filter((id) => !del.has(id)));
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

  const setShapeColor = (item: CanvasItem, color: string) => {
    if (!boardId) return;
    pushUndo(boardId, items);
    setCachedItems(items.map((i) => (i._id === item._id ? { ...i, color } : i)));
    persistItem({ ...item, color });
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

    const idMap = new Map<string, string>();
    for (const item of targetReal) {
      if (!currentIds.has(item._id)) {
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
          boardId,
        });
        idMap.set(item._id, newId);
      }
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
            cur.height !== item.height)
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
            boardId,
          });
        }
      }
    }

    const mapped = target.map((item) => {
      const mappedId = idMap.get(item._id);
      return mappedId ? { ...item, _id: mappedId } : item;
    });
    setCachedItems(mapped.filter((i) => !String(i._id).startsWith("temp-")));
    idMap.forEach((newId, oldId) => updateHistoryIds(boardId, oldId, newId));
  };

  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA")
        return;
      if (!boardId) return;
      const itemsNow = itemsRef.current;
      const selectedNow = selectedIdsRef.current;

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
        if (e.key.toLowerCase() === "g") {
          const vp = getViewport(boardId);
          setShowGrid(boardId, !vp.showGrid);
        }
      }

      if (e.key === "Escape") {
        setShowSettings(false);
        setShowCheckpoints(false);
        setShowLayers(false);
        setSelectedIds([]);
        setMode("select");
      }
      if ((e.key === "Backspace" || e.key === "Delete") && selectedNow.length > 0) {
        actionRefs.current.deleteItems(selectedNow);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // Stable listener: reads latest values via refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId]);

  const handleExportPDF = () => {
    if (items.length === 0) return alert("Board is empty!");
    // A4 at 96dpi logical size; capture at high pixelRatio so the PDF is full-res.
    const PAGE_W = 794;
    const PAGE_H = 1123;
    const PDF_PIXEL_RATIO = Math.max(window.devicePixelRatio || 1, 3);

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
      pdf.setFillColor(theme.backgroundColor);
      pdf.rect(0, 0, PAGE_W, PAGE_H, "F");
      // Full-res raster: 3×+ pixel density, lossless PNG, no FAST compression.
      const dataUrl = stage.toDataURL({
        x: 0,
        y: 0,
        width: PAGE_W,
        height: PAGE_H,
        pixelRatio: PDF_PIXEL_RATIO,
        mimeType: "image/png",
      });
      pdf.addImage(dataUrl, "PNG", 0, 0, PAGE_W, PAGE_H, undefined, "NONE");
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
              img.onload = () => {
                const canvas = document.createElement("canvas");
                let w = img.width,
                  h = img.height;
                const maxDim = 1200;
                if (w > maxDim || h > maxDim) {
                  const r = Math.min(maxDim / w, maxDim / h);
                  w *= r;
                  h *= r;
                }
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext("2d");
                if (ctx) ctx.drawImage(img, 0, 0, w, h);
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
                saveItemDb({
                  type: "image",
                  x,
                  y,
                  width: bw,
                  height: bh,
                  content: canvas.toDataURL("image/jpeg", 0.8),
                  zIndex: topZ(),
                  boardId,
                });
                URL.revokeObjectURL(objectUrl);
              };
            }
          }
        }
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [saveItemDb, theme, boardId, hasInteracted, setHasInteracted]);

  const handleTextBlur = () => {
    if (!editingText || !boardId) return;
    // Residual canvas pointer events can steal focus right after opening — re-focus.
    if (Date.now() < ignoreBlurUntil.current) {
      window.setTimeout(() => textEditorRef.current?.focus(), 0);
      return;
    }
    // Prefer live DOM value so the last keystroke is never lost to a stale render.
    const content = textEditorRef.current?.value ?? editingText.content;
    const isTemp = editingText._id && String(editingText._id).startsWith("temp-");
    const isReal = editingText._id && !isTemp;
    const metrics = measureTextBox(content, theme.fontFamily, editingText.fontSize ?? BASE_FONT_SIZE);
    if (content.trim().length > 0) {
      if (isReal) {
        pushUndo(boardId, items);
        localUpdates.current.set(editingText._id!, { content });
        setCachedItems(
          items.map((i) =>
            i._id === editingText._id
              ? {
                  ...i,
                  content,
                  width: Math.max(i.width || 0, metrics.width),
                  height: Math.max(i.height || 0, metrics.height),
                }
              : i,
          ),
        );
        saveItemDb({
          id: editingText._id as Id<"items">,
          type: "text",
          content,
          boardId,
          x: editingText.x,
          y: editingText.y,
          width: Math.max(items.find((i) => i._id === editingText._id)?.width || 0, metrics.width),
          height: Math.max(items.find((i) => i._id === editingText._id)?.height || 0, metrics.height),
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
          color: theme.textColor,
          zIndex,
          boardId,
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

  const itemPointerDown = (id: string) => {
    // In text/draw modes, clicks on items shouldn't select them (they belong to the active tool).
    if (mode !== "select") return;
    // Keep an existing multi-selection if the clicked item is part of it (so it can be group-dragged).
    setSelectedIds((prev) => (prev.includes(id) ? prev : [id]));
  };

  const nodeDragStart = (item: CanvasItem) => {
    if (selectedIds.length > 1 && selectedIds.includes(item._id)) {
      const start = new Map<string, { x: number; y: number }>();
      for (const id of selectedIds) {
        const it = items.find((i) => i._id === id);
        if (it) start.set(id, { x: it.x, y: it.y });
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
    if (g && g.anchorId === item._id) {
      const anchorStart = g.start.get(item._id);
      if (!anchorStart) return;
      const dx = e.target.x() - anchorStart.x;
      const dy = e.target.y() - anchorStart.y;
      g.start.forEach((s, id) => {
        if (id === item._id) return;
        const other = stage?.findOne("#" + id);
        if (other) other.position({ x: s.x + dx, y: s.y + dy });
        const it = items.find((i) => i._id === id);
        if (it?.type === "arrow") {
          syncArrowHandles(id, s.x + dx, s.y + dy, it.width ?? 0, it.height ?? 0);
        }
      });
      if (item.type === "arrow") {
        syncArrowHandles(item._id, e.target.x(), e.target.y(), item.width ?? 0, item.height ?? 0);
      }
      trRef.current?.forceUpdate();
      stage?.batchDraw();
      return;
    }
    // Solo arrow drag: keep endpoint dots glued to the shaft
    if (item.type === "arrow") {
      syncArrowHandles(item._id, e.target.x(), e.target.y(), item.width ?? 0, item.height ?? 0);
      stage?.batchDraw();
    }
  };

  const nodeDragEnd = (e: any, item: CanvasItem) => {
    const g = groupDrag.current;
    if (g && g.anchorId === item._id && boardId) {
      const anchorStart = g.start.get(item._id)!;
      const dx = e.target.x() - anchorStart.x;
      const dy = e.target.y() - anchorStart.y;
      pushUndo(boardId, items);
      if (!hasInteracted) setHasInteracted(boardId, true);
      const moved = new Map<string, { x: number; y: number }>();
      g.start.forEach((s, id) => moved.set(id, { x: s.x + dx, y: s.y + dy }));
      moved.forEach((pos, id) => {
        const prev = localUpdates.current.get(id) ?? {};
        localUpdates.current.set(id, { ...prev, ...pos });
      });
      setCachedItems(
        items.map((i) => (moved.has(i._id) ? { ...i, ...moved.get(i._id)! } : i)),
      );
      moved.forEach((pos, id) => {
        const it = items.find((i) => i._id === id);
        if (it) persistItem({ ...it, x: pos.x, y: pos.y });
      });
      groupDrag.current = null;
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
    setCachedItems(items.map((i) => (i._id === item._id ? { ...i, x: newX, y: newY } : i)));
    saveItemDb({
      id: item._id as Id<"items">,
      type: item.type,
      content: item.content,
      boardId,
      x: newX,
      y: newY,
    });
  };

  const itemTransformEnd = (e: any, item: CanvasItem) => {
    if (!boardId) return;
    const node = e.target;
    const sX = node.scaleX(),
      sY = node.scaleY();
    node.scaleX(1);
    node.scaleY(1);
    const newX = node.x(),
      newY = node.y();
    pushUndo(boardId, items);
    if (!hasInteracted) setHasInteracted(boardId, true);

    if (item.type === "text") {
      // Scale the font itself, then let the box hug the text at its new size.
      const factor = Math.max(sX, sY);
      const newFontSize = Math.max(6, Math.round((item.fontSize ?? BASE_FONT_SIZE) * factor));
      const metrics = measureTextBox(item.content, item.fontFamily || theme.fontFamily, newFontSize);
      const patch = {
        x: newX,
        y: newY,
        width: metrics.width,
        height: metrics.height,
        fontSize: newFontSize,
      };
      localUpdates.current.set(item._id, { ...(localUpdates.current.get(item._id) ?? {}), ...patch });
      setCachedItems(items.map((i) => (i._id === item._id ? { ...i, ...patch } : i)));
      saveItemDb({
        id: item._id as Id<"items">,
        type: "text",
        content: item.content,
        boardId,
        ...patch,
      });
      return;
    }

    if (item.type === "arrow") {
      // Scale the stored vector so the arrow keeps its direction (node.width() would drop the sign).
      const newWidth = (item.width ?? node.width()) * sX;
      const newHeight = (item.height ?? node.height()) * sY;
      const patch = { x: newX, y: newY, width: newWidth, height: newHeight };
      localUpdates.current.set(item._id, { ...(localUpdates.current.get(item._id) ?? {}), ...patch });
      setCachedItems(items.map((i) => (i._id === item._id ? { ...i, ...patch } : i)));
      saveItemDb({
        id: item._id as Id<"items">,
        type: item.type,
        content: item.content,
        color: item.color,
        boardId,
        ...patch,
      });
      return;
    }

    // Groups (rects) don't always report reliable node.width(); prefer stored geometry.
    const baseW = item.width ?? (item.type === "rect" ? DEFAULT_RECT_WIDTH : node.width());
    const baseH = item.height ?? (item.type === "rect" ? DEFAULT_RECT_HEIGHT : node.height());
    const newWidth = Math.max(5, baseW * sX);
    const newHeight = Math.max(5, baseH * sY);
    const patch = { x: newX, y: newY, width: newWidth, height: newHeight };
    localUpdates.current.set(item._id, { ...(localUpdates.current.get(item._id) ?? {}), ...patch });
    setCachedItems(items.map((i) => (i._id === item._id ? { ...i, ...patch } : i)));
    saveItemDb({
      id: item._id as Id<"items">,
      type: item.type,
      content: item.content,
      color: item.color,
      fontFamily: item.fontFamily,
      fontSize: item.fontSize,
      boardId,
      ...patch,
    });
  };

  // Keep keyboard/action handlers pointing at the latest implementations.
  actionRefs.current.deleteItems = deleteItems;
  actionRefs.current.reconcileHistory = reconcileHistory;

  const zoomPct = Math.round(scale * 100);
  const selectedIsText =
    selectedIds.length === 1 && items.some((i) => i._id === selectedIds[0] && i.type === "text");
  const selectedArrows = items.filter((i) => i.type === "arrow" && selectedIds.includes(i._id));
  const selectedOnlyArrows =
    selectedIds.length > 0 && selectedArrows.length === selectedIds.length;
  const selectedShape =
    selectedIds.length === 1
      ? items.find(
          (i) => i._id === selectedIds[0] && (i.type === "rect" || i.type === "arrow"),
        )
      : undefined;

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
      const endX = item.x + (item.width ?? 0);
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
  const editingFontSize = editingText?.fontSize ?? BASE_FONT_SIZE;
  const editingMetrics = editingText
    ? measureTextBox(editingText.content, theme.fontFamily, editingFontSize)
    : null;
  const dotGrid = theme.isDark ? `${theme.textColor}10` : `${theme.textColor}0D`;

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        backgroundColor: theme.backgroundColor,
        overflow: "hidden",
        backgroundImage: boardReady ? `radial-gradient(${dotGrid} 1px, transparent 0)` : undefined,
        backgroundSize: "24px 24px",
        backgroundPosition: `${position.x % 24}px ${position.y % 24}px`,
        transition: "background-color 0.4s ease",
        cursor: mode === "text" || mode === "rect" || mode === "arrow" ? "crosshair" : "default",
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
            title="Arrow · A — drag to draw"
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

          <div className="toolbar-divider" />

          <button
            className={`tool-btn icon-only${showGrid ? " active-subtle" : ""}`}
            onClick={() => setShowGrid(boardId, !showGrid)}
            title="Grid · G"
          >
            <LayoutGrid size={15} />
          </button>
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
        onToggleGrid={() => setShowGrid(boardId, !showGrid)}
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
            Ctrl+V to paste · T or double-click to add text
            <br />
            T or double-click to place text anywhere · R for box · Del to remove
          </p>
        </div>
      )}

      <div style={{ position: "absolute", top: 48, left: 0, right: 0, bottom: 0 }}>
      <Stage
        width={window.innerWidth}
        height={window.innerHeight - 48}
        onWheel={handleWheel}
        scaleX={scale}
        scaleY={scale}
        x={position.x}
        y={position.y}
        draggable={mode === "select" && !editingText}
        ref={stageRef}
        onClick={handleStageClick}
        onDblClick={handleStageDblClick}
        onMouseDown={handleStageMouseDown}
        onMouseMove={handleStageMouseMove}
        onMouseUp={handleStageMouseUp}
        onTouchStart={handleStageMouseDown}
        onTouchMove={handleStageMouseMove}
        onTouchEnd={handleStageMouseUp}
        onDragEnd={(e: any) => {
          if (e.target === stageRef.current) {
            const pos = { x: e.target.x(), y: e.target.y() };
            positionRef.current = pos;
            setPositionLocal(pos);
            flushViewToStore();
            if (!hasInteracted) setHasInteracted(boardId, true);
          }
        }}
      >
        <Layer perfectDrawEnabled={false}>
          {showGrid &&
            Array.from({ length: 9 }).map((_, i) =>
              Array.from({ length: 9 }).map((_, j) => (
                <Rect
                  key={`g-${i}-${j}`}
                  x={(i - 3) * 794}
                  y={(j - 3) * 1123}
                  width={794}
                  height={1123}
                  stroke={`${theme.textColor}18`}
                  strokeWidth={1 / scale}
                  dash={[6 / scale, 6 / scale]}
                  listening={false}
                  perfectDrawEnabled={false}
                  shadowForStrokeEnabled={false}
                />
              )),
            )}

          {orderedItems.map((item) => {
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
                  draggable={mode === "select"}
                  onPointerDown={() => itemPointerDown(item._id)}
                  onDragStart={() => nodeDragStart(item)}
                  onDragMove={(e: any) => nodeDragMove(e, item)}
                  onDragEnd={(e: any) => nodeDragEnd(e, item)}
                  onTransformEnd={(e: any) => itemTransformEnd(e, item)}
                  onDblClick={() => {
                    if (mode === "select") startFreeTextAt(item.x, item.y, item);
                  }}
                />
              );
            }

            if (item.type === "rect") {
              const color = item.color || theme.accentColor;
              const w = item.width ?? DEFAULT_RECT_WIDTH;
              const h = item.height ?? DEFAULT_RECT_HEIGHT;
              return (
                <Group
                  key={item._id}
                  id={item._id}
                  x={item.x}
                  y={item.y}
                  draggable={mode === "select"}
                  onPointerDown={() => itemPointerDown(item._id)}
                  onDragStart={() => nodeDragStart(item)}
                  onDragMove={(e: any) => nodeDragMove(e, item)}
                  onDragEnd={(e: any) => nodeDragEnd(e, item)}
                  onTransformEnd={(e: any) => itemTransformEnd(e, item)}
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
                </Group>
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
                  draggable={mode === "select"}
                  onPointerDown={() => itemPointerDown(item._id)}
                  onDragStart={() => nodeDragStart(item)}
                  onDragMove={(e: any) => nodeDragMove(e, item)}
                  onDragEnd={(e: any) => nodeDragEnd(e, item)}
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
                draggable={mode === "select"}
                onPointerDown={() => itemPointerDown(item._id)}
                onDragStart={() => nodeDragStart(item)}
                onDragMove={(e: any) => nodeDragMove(e, item)}
                onDragEnd={(e: any) => nodeDragEnd(e, item)}
                onTransformEnd={(e: any) => itemTransformEnd(e, item)}
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

          {/* Arrow endpoint handles — two small dots instead of a cluttered resize box */}
          {mode === "select" &&
            selectedArrows.map((arrow) => {
              const color = arrow.color || theme.accentColor;
              const endX = arrow.x + (arrow.width ?? 0);
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

          {selectedIds.length > 0 && (
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
              resizeEnabled={!selectedOnlyArrows}
              borderEnabled={!selectedOnlyArrows}
              keepRatio={selectedIsText}
              enabledAnchors={
                selectedOnlyArrows
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
          key={editingText._id ?? `new-${editingText.x}-${editingText.y}`}
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
            if (e.key === "Escape") {
              ignoreBlurUntil.current = 0;
              e.currentTarget.blur();
            }
          }}
          onInput={(e) => resizeTextEditor(e.currentTarget, e.currentTarget.value)}
        />
      )}
      </div>
        </>
      )}
    </div>
  );
};

export default App;
