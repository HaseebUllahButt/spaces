import React, { useEffect, useRef } from 'react';
import { Stage, Layer, Text as KonvaText, Rect, Transformer } from 'react-konva';
import jsPDF from 'jspdf';
import { MousePointer2, Type, LayoutGrid, FileDown, SlidersHorizontal } from 'lucide-react';
import { useStore } from './store';
import CanvasImage from './components/CanvasImage';
import ThemePanel from './components/ThemePanel';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';

const EMPTY_ARRAY: any[] = [];

const App: React.FC = () => {
  const { theme, mode, setMode, scale, setScale, position, setPosition, cachedItems, setCachedItems, showGrid, setShowGrid, pushUndo, popUndo } = useStore();

  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [showSettings, setShowSettings] = React.useState(false);
  const [editingText, setEditingText] = React.useState<{ _id?: string; x: number; y: number; content: string } | null>(null);

  const trRef = useRef<any>(null);
  const stageRef = useRef<any>(null);
  // Tracks locally-edited content so stale Convex subscription data doesn't overwrite it
  const localUpdates = useRef<Map<string, Partial<any>>>(new Map());

  const boardId = 'main';
  const dbItems = useQuery(api.board.getItems, { boardId });
  const saveItemDb = useMutation(api.board.saveItem);
  const deleteItemDb = useMutation(api.board.deleteItem);

  useEffect(() => {
    if (!dbItems) return;
    // Merge server data with any pending local updates
    const merged = (dbItems as any[]).map(item => {
      const local = localUpdates.current.get(item._id);
      if (local) {
        // If server has caught up to our local version, clear the pending entry
        const allMatch = Object.entries(local).every(([k, v]) => (item as any)[k] === v);
        if (allMatch) localUpdates.current.delete(item._id);
        else return { ...item, ...local }; // server still behind — keep local
      }
      return item;
    });
    setCachedItems(merged);
  }, [dbItems, setCachedItems]);

  const items = cachedItems || EMPTY_ARRAY;

  // Sync transformer with selected node
  useEffect(() => {
    if (selectedId && trRef.current && stageRef.current) {
      const node = stageRef.current.findOne('#' + selectedId);
      if (node) { trRef.current.nodes([node]); trRef.current.getLayer().batchDraw(); }
    } else if (trRef.current) {
      trRef.current.nodes([]); trRef.current.getLayer().batchDraw();
    }
  }, [selectedId, items]);

  const handleWheel = (e: any) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();
    const mousePointTo = { x: (pointer.x - stage.x()) / oldScale, y: (pointer.y - stage.y()) / oldScale };
    const newScale = Math.min(Math.max(e.evt.deltaY < 0 ? oldScale * 1.08 : oldScale / 1.08, 0.1), 5);
    setScale(newScale);
    setPosition({ x: pointer.x - mousePointTo.x * newScale, y: pointer.y - mousePointTo.y * newScale });
  };

  const handleStageClick = (e: any) => {
    if (e.target !== stageRef.current) return;
    setShowSettings(false);
    setSelectedId(null);
    if (mode === 'text') {
      const stage = stageRef.current;
      const pointer = stage.getPointerPosition();
      setEditingText({ x: (pointer.x - stage.x()) / stage.scaleX(), y: (pointer.y - stage.y()) / stage.scaleY(), content: '' });
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Allow Ctrl+Z anywhere
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        const prev = popUndo();
        if (prev) {
          // Reconcile with Convex: find what changed
          const currentReal = items.filter(i => !String(i._id).startsWith('temp-'));
          const prevReal = prev.filter(i => !String(i._id).startsWith('temp-'));
          const prevIds = new Set(prevReal.map(i => i._id));
          const currentIds = new Set(currentReal.map(i => i._id));
          // Delete items that were added
          for (const item of currentReal) {
            if (!prevIds.has(item._id)) deleteItemDb({ id: item._id as Id<'items'> });
          }
          // Re-create items that were deleted (they get new IDs, that's fine)
          for (const item of prevReal) {
            if (!currentIds.has(item._id)) {
              saveItemDb({ type: item.type, x: item.x, y: item.y, content: item.content, color: item.color, fontFamily: item.fontFamily, boardId });
            }
          }
          // Patch items that moved or changed
          for (const item of prevReal) {
            if (currentIds.has(item._id)) {
              const cur = currentReal.find(i => i._id === item._id);
              if (cur && (cur.x !== item.x || cur.y !== item.y || cur.content !== item.content || cur.width !== item.width || cur.height !== item.height)) {
                saveItemDb({ id: item._id as Id<'items'>, type: item.type, x: item.x, y: item.y, content: item.content, color: item.color, fontFamily: item.fontFamily, boardId });
              }
            }
          }
          setCachedItems(prev.filter(i => !String(i._id).startsWith('temp-')));
        }
        return;
      }
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
      if (e.key.toLowerCase() === 's') setMode('select');
      if (e.key.toLowerCase() === 't') setMode('text');
      if (e.key.toLowerCase() === 'g') setShowGrid(!showGrid);
      if (e.key === 'Escape') { setShowSettings(false); setSelectedId(null); }
      if ((e.key === 'Backspace' || e.key === 'Delete') && selectedId) {
        pushUndo(items);
        setCachedItems(items.filter(i => i._id !== selectedId));
        deleteItemDb({ id: selectedId as Id<'items'> });
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setMode, selectedId, deleteItemDb, items, setCachedItems, showGrid, setShowGrid, pushUndo, popUndo, saveItemDb, boardId]);

  const handleExportPDF = () => {
    if (items.length === 0) return alert('Board is empty!');
    const pdf = new jsPDF({ orientation: 'p', unit: 'px', format: [794, 1123], compress: true });
    const populatedPages = new Set<string>();
    items.forEach(item => populatedPages.add(`${Math.floor(item.x / 794)},${Math.floor(item.y / 1123)}`));
    const pages = Array.from(populatedPages).map(p => { const [x, y] = p.split(',').map(Number); return { x, y }; }).sort((a, b) => a.y - b.y || a.x - b.x);
    const originalPos = { x: stageRef.current.x(), y: stageRef.current.y() };
    const originalScale = stageRef.current.scaleX();
    for (let i = 0; i < pages.length; i++) {
      if (i > 0) pdf.addPage();
      const page = pages[i];
      stageRef.current.position({ x: -page.x * 794, y: -page.y * 1123 });
      stageRef.current.scale({ x: 1, y: 1 });
      stageRef.current.batchDraw();
      pdf.setFillColor(theme.backgroundColor);
      pdf.rect(0, 0, 794, 1123, 'F');
      pdf.addImage(stageRef.current.toDataURL({ x: 0, y: 0, width: 794, height: 1123, pixelRatio: 1.5 }), 'PNG', 0, 0, 794, 1123, undefined, 'FAST');
    }
    stageRef.current.position(originalPos);
    stageRef.current.scale({ x: originalScale, y: originalScale });
    pdf.save('board-export.pdf');
  };

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const stage = stageRef.current;
      const pointer = stage.getPointerPosition() || { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      const x = (pointer.x - stage.x()) / stage.scaleX();
      const y = (pointer.y - stage.y()) / stage.scaleY();
      const text = e.clipboardData?.getData('text');
      if (text) { saveItemDb({ type: 'text', x, y, content: text, fontFamily: theme.fontFamily, color: theme.textColor, boardId }); return; }
      const clipboardItems = e.clipboardData?.items;
      if (clipboardItems) {
        for (let i = 0; i < clipboardItems.length; i++) {
          if (clipboardItems[i].type.indexOf('image') !== -1) {
            const blob = clipboardItems[i].getAsFile();
            if (blob) {
              const img = new Image();
              const objectUrl = URL.createObjectURL(blob);
              img.src = objectUrl;
              img.onload = () => {
                const canvas = document.createElement('canvas');
                let w = img.width, h = img.height;
                const maxDim = 1200;
                if (w > maxDim || h > maxDim) { const r = Math.min(maxDim / w, maxDim / h); w *= r; h *= r; }
                canvas.width = w; canvas.height = h;
                const ctx = canvas.getContext('2d');
                if (ctx) ctx.drawImage(img, 0, 0, w, h);
                let bw = w, bh = h;
                if (bw > 600 || bh > 600) { const r = Math.min(600 / bw, 600 / bh); bw *= r; bh *= r; }
                const curScale = stageRef.current?.scaleX() || 1;
                if (curScale > 1) { bw /= curScale; bh /= curScale; }
                saveItemDb({ type: 'image', x, y, width: bw, height: bh, content: canvas.toDataURL('image/jpeg', 0.8), boardId });
                URL.revokeObjectURL(objectUrl);
              };
            }
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [saveItemDb, theme, boardId]);

  const handleTextBlur = () => {
    if (!editingText) return;
    const content = editingText.content.trim();
    const isTemp = editingText._id && String(editingText._id).startsWith('temp-');
    const isReal = editingText._id && !isTemp;
    if (content) {
      if (isReal) {
        // Editing existing real item — record locally so stale dbItems can't overwrite
        pushUndo(items);
        localUpdates.current.set(editingText._id!, { content });
        setCachedItems(items.map(i => i._id === editingText._id ? { ...i, content } : i));
        saveItemDb({ id: editingText._id as Id<'items'>, type: 'text', content, boardId, x: editingText.x, y: editingText.y });
      } else {
        // New item (no _id or temp) — add optimistically
        const tempId = `temp-${Date.now()}` as Id<'items'>;
        pushUndo(items);
        setCachedItems([...items.filter(i => i._id !== editingText._id), { _id: tempId, _creationTime: Date.now(), type: 'text', x: editingText.x, y: editingText.y, content, fontFamily: theme.fontFamily, color: theme.textColor }]);
        saveItemDb({ type: 'text', x: editingText.x, y: editingText.y, content, fontFamily: theme.fontFamily, color: theme.textColor, boardId });
      }
    } else if (isReal) {
      // Cleared content on a real item → delete it
      pushUndo(items);
      setCachedItems(items.filter(i => i._id !== editingText._id));
      deleteItemDb({ id: editingText._id as Id<'items'> });
    } else if (isTemp) {
      // Cleared a temp item — just remove it locally
      setCachedItems(items.filter(i => i._id !== editingText._id));
    }
    setEditingText(null);
    setMode('select');
  };

  // Shared item event handlers
  const itemPointerDown = (id: string) => { if (mode !== 'text') { setMode('select'); setSelectedId(id); } };
  const itemDragEnd = (e: any, item: any) => {
    const newX = e.target.x(), newY = e.target.y();
    pushUndo(items);
    setCachedItems(items.map(i => i._id === item._id ? { ...i, x: newX, y: newY } : i));
    saveItemDb({ id: item._id as Id<'items'>, type: item.type, content: item.content, boardId, x: newX, y: newY });
  };
  const itemTransformEnd = (e: any, item: any) => {
    const node = e.target;
    const sX = node.scaleX(), sY = node.scaleY();
    node.scaleX(1); node.scaleY(1);
    const newWidth = Math.max(5, node.width() * sX), newHeight = Math.max(5, node.height() * sY);
    const newX = node.x(), newY = node.y();
    pushUndo(items);
    setCachedItems(items.map(i => i._id === item._id ? { ...i, x: newX, y: newY, width: newWidth, height: newHeight } : i));
    saveItemDb({ id: item._id as Id<'items'>, type: item.type, content: item.content, boardId, x: newX, y: newY, width: newWidth, height: newHeight });
  };

  const zoomPct = Math.round(scale * 100);
  const btnBase: React.CSSProperties = { border: 'none', cursor: 'pointer', borderRadius: '10px', transition: 'all 0.15s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: theme.fontFamily };
  const toolBtn = (active: boolean): React.CSSProperties => ({ ...btnBase, gap: '6px', padding: '7px 13px', fontSize: '12px', fontWeight: 600, letterSpacing: '0.2px', backgroundColor: active ? theme.textColor : 'transparent', color: active ? theme.backgroundColor : theme.textColor });
  const iconBtn = (active = false): React.CSSProperties => ({ ...btnBase, padding: '8px', backgroundColor: active ? `${theme.textColor}15` : 'transparent', color: theme.textColor });

  return (
    <div style={{ width: '100vw', height: '100vh', backgroundColor: theme.backgroundColor, overflow: 'hidden', backgroundImage: `radial-gradient(${theme.textColor}18 1px, transparent 0)`, backgroundSize: '28px 28px', backgroundPosition: `${position.x % 28}px ${position.y % 28}px`, transition: 'background-color 0.4s ease', cursor: mode === 'text' ? 'crosshair' : 'default' }}>

      {/* ── Bottom Toolbar ── */}
      <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', zIndex: 100, display: 'flex', alignItems: 'center', gap: '2px', padding: '5px', backgroundColor: `${theme.backgroundColor}EE`, backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: `1px solid ${theme.textColor}18`, borderRadius: '16px', boxShadow: `0 8px 32px -4px ${theme.textColor}20` }}>
        <button style={toolBtn(mode === 'select')} onClick={() => setMode('select')} title="Select · S">
          <MousePointer2 size={13} /> Select
        </button>
        <button style={toolBtn(mode === 'text')} onClick={() => setMode('text')} title="Text · T">
          <Type size={13} /> Text
        </button>

        <div style={{ width: '1px', height: '18px', backgroundColor: `${theme.textColor}20`, margin: '0 4px' }} />

        <button style={iconBtn(showGrid)} onClick={() => setShowGrid(!showGrid)} title="Grid · G"><LayoutGrid size={15} /></button>
        <button style={iconBtn()} onClick={handleExportPDF} title="Export PDF"><FileDown size={15} /></button>
        <button style={iconBtn(showSettings)} onClick={() => setShowSettings(!showSettings)} title="Settings"><SlidersHorizontal size={15} /></button>

        <div style={{ width: '1px', height: '18px', backgroundColor: `${theme.textColor}20`, margin: '0 4px' }} />

        <span style={{ fontSize: '11px', fontWeight: 700, color: `${theme.textColor}50`, fontFamily: theme.fontFamily, padding: '0 6px', minWidth: '38px', textAlign: 'center', userSelect: 'none' }}>{zoomPct}%</span>
      </div>

      {/* ── Settings Panel ── */}
      <ThemePanel visible={showSettings} onExportPDF={handleExportPDF} showGrid={showGrid} onToggleGrid={() => setShowGrid(!showGrid)} />

      {/* ── Inline Text Editor ── */}
      {editingText && (
        <textarea
          autoFocus
          style={{ position: 'absolute', top: editingText.y * scale + position.y, left: editingText.x * scale + position.x, background: 'transparent', border: 'none', color: theme.textColor, fontFamily: theme.fontFamily, fontSize: `${20 * scale}px`, outline: 'none', resize: 'none', overflow: 'hidden', zIndex: 50, minWidth: '200px', minHeight: '50px', lineHeight: 1.5 }}
          value={editingText.content}
          onChange={(e) => setEditingText({ ...editingText, content: e.target.value })}
          onBlur={handleTextBlur}
          onKeyDown={(e) => { if (e.key === 'Escape') e.currentTarget.blur(); }}
        />
      )}

      {/* ── Empty State ── */}
      {items.length === 0 && !editingText && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none', userSelect: 'none', color: theme.textColor, fontFamily: theme.fontFamily }}>
          <div style={{ fontSize: '52px', opacity: 0.07, marginBottom: '16px' }}>✦</div>
          <p style={{ fontSize: '13px', opacity: 0.22, fontWeight: 500, margin: 0, lineHeight: 1.8 }}>
            Ctrl+V to paste · Click TEXT then click to write<br />Double-click text to edit · Del to remove
          </p>
        </div>
      )}

      {/* ── Canvas ── */}
      <Stage
        width={window.innerWidth} height={window.innerHeight}
        onWheel={handleWheel} scaleX={scale} scaleY={scale} x={position.x} y={position.y}
        draggable={mode === 'select' && !editingText}
        ref={stageRef}
        onClick={handleStageClick}
        onDragEnd={(e: any) => { if (e.target === stageRef.current) setPosition({ x: e.target.x(), y: e.target.y() }); }}
      >
        <Layer>
          {/* Page grid */}
          {showGrid && Array.from({ length: 15 }).map((_, i) =>
            Array.from({ length: 15 }).map((_, j) => (
              <Rect key={`g-${i}-${j}`} x={(i - 5) * 794} y={(j - 5) * 1123} width={794} height={1123}
                stroke={`${theme.textColor}22`} strokeWidth={1 / scale} dash={[6 / scale, 6 / scale]} listening={false} />
            ))
          )}

          {/* Items */}
          {items.map((item) => (
            <React.Fragment key={item._id}>
              {item.type === 'text' ? (
                // Hide the canvas text node while its textarea editor is open
                editingText?._id === item._id ? null : (
                <KonvaText
                  id={item._id} x={item.x} y={item.y} text={item.content}
                  width={item.width} height={item.height} fontSize={20}
                  fontFamily={item.fontFamily || theme.fontFamily} fill={item.color || theme.textColor}
                  draggable={mode === 'select'}
                  onPointerDown={() => itemPointerDown(item._id)}
                  onDragEnd={(e: any) => itemDragEnd(e, item)}
                  onTransformEnd={(e: any) => itemTransformEnd(e, item)}
                  // FIX: double-click to edit — single click only selects
                  onDblClick={() => { if (mode === 'select') setEditingText({ _id: item._id, x: item.x, y: item.y, content: item.content }); }}
                />
                )
              ) : (
                <CanvasImage
                  id={item._id} x={item.x} y={item.y} url={item.content}
                  width={item.width} height={item.height} draggable={mode === 'select'}
                  onPointerDown={() => itemPointerDown(item._id)}
                  onDragEnd={(e: any) => itemDragEnd(e, item)}
                  onTransformEnd={(e: any) => itemTransformEnd(e, item)}
                />
              )}
            </React.Fragment>
          ))}

          {selectedId && <Transformer ref={trRef} boundBoxFunc={(oldBox, newBox) => (newBox.width < 5 || newBox.height < 5 ? oldBox : newBox)} />}
        </Layer>
      </Stage>
    </div>
  );
};

export default App;
