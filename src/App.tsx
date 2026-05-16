import React, { useEffect, useRef } from 'react';
import { Stage, Layer, Text as KonvaText, Rect, Transformer } from 'react-konva';
import jsPDF from 'jspdf';
import { useStore } from './store';
import CanvasImage from './components/CanvasImage';
import ThemePanel from './components/ThemePanel';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';

const EMPTY_ARRAY: any[] = [];

const App: React.FC = () => {
  const { 
    theme, 
    mode, 
    setMode, 
    scale, 
    setScale, 
    position, 
    setPosition, 
    cachedItems,
    setCachedItems,
    showGrid,
    setShowGrid
  } = useStore();
  
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [showHud, setShowHud] = React.useState(true);
  const [showSettings, setShowSettings] = React.useState(false);
  const [editingText, setEditingText] = React.useState<{ id?: string, x: number, y: number, content: string } | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const trRef = useRef<any>(null);

  const boardId = 'main';
  const dbItems = useQuery(api.board.getItems, { boardId });
  const saveItemDb = useMutation(api.board.saveItem);
  const deleteItemDb = useMutation(api.board.deleteItem);
  
  useEffect(() => {
    if (dbItems) setCachedItems(dbItems);
  }, [dbItems, setCachedItems]);

  const items = cachedItems || EMPTY_ARRAY;
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stageRef = useRef<any>(null);

  // Handle Zooming
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // Transformer Sync
  useEffect(() => {
    if (selectedId && trRef.current && stageRef.current) {
      const node = stageRef.current.findOne('#' + selectedId);
      if (node) {
        trRef.current.nodes([node]);
        trRef.current.getLayer().batchDraw();
      }
    } else if (trRef.current) {
      trRef.current.nodes([]);
      trRef.current.getLayer().batchDraw();
    }
  }, [selectedId, items]);

  const handleWheel = (e: any) => {
    e.evt.preventDefault();
    const scaleBy = 1.1;
    const stage = stageRef.current;
    const oldScale = stage.scaleX();
    const mousePointTo = {
      x: (stage.getPointerPosition().x - stage.x()) / oldScale,
      y: (stage.getPointerPosition().y - stage.y()) / oldScale,
    };

    const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
    
    setScale(newScale);
    setPosition({
      x: stage.getPointerPosition().x - mousePointTo.x * newScale,
      y: stage.getPointerPosition().y - mousePointTo.y * newScale,
    });
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleStageClick = (e: any) => {
    // If we click on an item, let it handle itself (unless we want to deselect)
    if (e.target !== stageRef.current) return;
    
    setShowSettings(false);

    if (mode === 'text') {
      const stage = stageRef.current;
      const pointer = stage.getPointerPosition();
      const x = (pointer.x - stage.x()) / stage.scaleX();
      const y = (pointer.y - stage.y()) / stage.scaleY();
      
      setEditingText({ x, y, content: '' });
    }
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;

      if (e.key.toLowerCase() === 's') setMode('select');
      if (e.key.toLowerCase() === 't') setMode('text');
      if (e.key.toLowerCase() === 'm') setShowHud(prev => !prev);
      if (e.key.toLowerCase() === 'g') setShowGrid(!showGrid);
      if (e.key === 'Escape') setShowSettings(false);
      if (e.key === 'Backspace' || e.key === 'Delete') {
        if (selectedId) {
          setCachedItems(items.filter(i => i._id !== selectedId));
          deleteItemDb({ id: selectedId as Id<"items"> });
          setSelectedId(null);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setMode, selectedId, deleteItemDb, items, setCachedItems, showGrid, setShowGrid]);

  const handleExportPDF = () => {
    if (items.length === 0) return alert('Board is empty!');
    const pdf = new jsPDF('p', 'px', [794, 1123]);
    
    const populatedPages = new Set<string>();
    items.forEach(item => {
      const px = Math.floor(item.x / 794);
      const py = Math.floor(item.y / 1123);
      populatedPages.add(`${px},${py}`);
    });

    const pages = Array.from(populatedPages).map(p => {
      const [x, y] = p.split(',').map(Number);
      return {x, y};
    }).sort((a, b) => a.y - b.y || a.x - b.x);

    const originalPos = { x: stageRef.current.x(), y: stageRef.current.y() };
    const originalScale = stageRef.current.scaleX();

    for (let i = 0; i < pages.length; i++) {
      if (i > 0) pdf.addPage();
      const page = pages[i];
      
      stageRef.current.position({ x: -page.x * 794, y: -page.y * 1123 });
      stageRef.current.scale({ x: 1, y: 1 });
      
      const dataUrl = stageRef.current.toDataURL({ 
        x: page.x * 794, 
        y: page.y * 1123,
        width: 794, 
        height: 1123, 
        pixelRatio: 2 
      });
      
      pdf.addImage(dataUrl, 'PNG', 0, 0, 794, 1123);
    }
    
    stageRef.current.position(originalPos);
    stageRef.current.scale({ x: originalScale, y: originalScale });
    
    pdf.save('clipboard-export.pdf');
  };

  // Paste Listener
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const stage = stageRef.current;
      const pointer = stage.getPointerPosition() || { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      
      // Calculate actual coordinates on the canvas (accounting for pan/zoom)
      const x = (pointer.x - stage.x()) / stage.scaleX();
      const y = (pointer.y - stage.y()) / stage.scaleY();

      const text = e.clipboardData?.getData('text');
      if (text) {
        saveItemDb({
          type: 'text',
          x,
          y,
          content: text,
          fontFamily: theme.fontFamily,
          color: theme.textColor,
          boardId
        });
      }
      
      // Handle images
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
                let width = img.width;
                let height = img.height;
                const maxDim = 1200;
                if (width > maxDim || height > maxDim) {
                  const ratio = Math.min(maxDim / width, maxDim / height);
                  width *= ratio;
                  height *= ratio;
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (ctx) ctx.drawImage(img, 0, 0, width, height);
                let boardWidth = width;
                let boardHeight = height;
                const maxBoardDim = 600;
                if (boardWidth > maxBoardDim || boardHeight > maxBoardDim) {
                  const ratio = Math.min(maxBoardDim / boardWidth, maxBoardDim / boardHeight);
                  boardWidth *= ratio;
                  boardHeight *= ratio;
                }
                
                const currentScale = stageRef.current?.scaleX() || 1;
                if (currentScale > 1) {
                  boardWidth /= currentScale;
                  boardHeight /= currentScale;
                }

                saveItemDb({
                  type: 'image',
                  x,
                  y,
                  width: boardWidth,
                  height: boardHeight,
                  content: canvas.toDataURL('image/jpeg', 0.8),
                  boardId
                });
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

  return (
    <div style={{ 
      width: '100vw', 
      height: '100vh', 
      backgroundColor: theme.backgroundColor, 
      overflow: 'hidden',
      backgroundImage: `radial-gradient(${theme.textColor}22 1px, transparent 0)`,
      backgroundSize: '24px 24px',
      backgroundPosition: `${position.x % 24}px ${position.y % 24}px`,
      transition: 'background-color 0.5s ease'
    }}>
      {/* HUD / Toolbar */}
      {showHud ? (
        <div style={{
          position: 'absolute',
          top: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 10,
          display: 'flex',
          gap: '8px',
          padding: '6px',
          border: `1px solid ${theme.textColor}15`,
          backgroundColor: `${theme.backgroundColor}CC`,
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          fontFamily: theme.fontFamily,
          fontSize: '12px',
          borderRadius: '100px',
          boxShadow: `0 8px 32px -8px ${theme.textColor}20`,
          transition: 'all 0.3s ease'
        }}>
          <button 
            onClick={() => setShowHud(false)}
            style={{ 
              backgroundColor: 'transparent',
              color: theme.textColor,
              border: 'none', cursor: 'pointer', padding: '6px 14px',
              fontWeight: 600,
              fontSize: '16px',
              borderRadius: '100px',
              opacity: 0.5,
              transition: 'opacity 0.2s ease'
            }}
          >
            -
          </button>
          <button 
          onClick={() => setMode('select')}
          style={{ 
            backgroundColor: mode === 'select' ? theme.textColor : 'transparent',
            color: mode === 'select' ? theme.backgroundColor : theme.textColor,
            border: 'none', cursor: 'pointer', padding: '8px 20px', fontSize: '13px',
            borderRadius: '100px', fontWeight: 500, transition: 'all 0.2s ease'
          }}
        >
          SELECT
        </button>
        <button 
          onClick={() => setMode('text')}
          style={{ 
            backgroundColor: mode === 'text' ? theme.textColor : 'transparent',
            color: mode === 'text' ? theme.backgroundColor : theme.textColor,
            border: 'none', cursor: 'pointer', padding: '8px 20px', fontSize: '13px',
            borderRadius: '100px', fontWeight: 500, transition: 'all 0.2s ease'
          }}
        >
          TEXT
        </button>
        <button 
          onClick={() => setShowSettings(!showSettings)}
          style={{ 
            backgroundColor: showSettings ? theme.textColor : 'transparent',
            color: showSettings ? theme.backgroundColor : theme.textColor,
            border: 'none', cursor: 'pointer', padding: '8px 20px', marginLeft: '4px', fontSize: '13px',
            borderRadius: '100px', fontWeight: 500, transition: 'all 0.2s ease'
          }}
        >
          SETTINGS
        </button>
        </div>
      ) : (
        <button 
          onClick={() => setShowHud(true)}
          style={{ 
            position: 'absolute',
            top: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10,
            backgroundColor: theme.backgroundColor,
            color: theme.textColor,
            border: `1px solid ${theme.textColor}40`, 
            cursor: 'pointer', 
            padding: '6px 24px',
            fontFamily: theme.fontFamily,
            fontWeight: 500,
            fontSize: '20px',
            borderRadius: '100px',
            boxShadow: 'none',
            transition: 'all 0.3s ease'
          }}
        >
          +
        </button>
      )}

      <ThemePanel 
        visible={showSettings} 
        onExportPDF={handleExportPDF}
        showGrid={showGrid}
        onToggleGrid={() => setShowGrid(!showGrid)}
      />

      {editingText && (
        <textarea
          autoFocus
          style={{
            position: 'absolute',
            top: editingText.y * scale + position.y,
            left: editingText.x * scale + position.x,
            background: 'transparent',
            border: 'none',
            color: theme.textColor,
            fontFamily: theme.fontFamily,
            fontSize: `${20 * scale}px`,
            outline: 'none',
            resize: 'none',
            overflow: 'hidden',
            zIndex: 5,
            minWidth: '200px',
            minHeight: '50px',
          }}
          value={editingText.content}
          onChange={(e) => setEditingText({ ...editingText, content: e.target.value })}
          onBlur={() => {
            if (editingText.content.trim()) {
              if (editingText.id) {
                saveItemDb({ id: editingText.id as Id<"items">, type: 'text', content: editingText.content, boardId, x: editingText.x, y: editingText.y });
              } else {
                saveItemDb({ type: 'text', x: editingText.x, y: editingText.y, content: editingText.content, fontFamily: theme.fontFamily, color: theme.textColor, boardId });
              }
            } else if (editingText.id) {
              deleteItemDb({ id: editingText.id as Id<"items"> });
            }
            setEditingText(null);
            setMode('select');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setEditingText(null);
          }}
        />
      )}

      <Stage
        width={window.innerWidth}
        height={window.innerHeight}
        onWheel={handleWheel}
        scaleX={scale}
        scaleY={scale}
        x={position.x}
        y={position.y}
        draggable={mode === 'select'}
        ref={stageRef}
        onClick={handleStageClick}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onDragEnd={(e: any) => {
          if (e.target === stageRef.current) {
            setPosition({ x: e.target.x(), y: e.target.y() });
          }
        }}
      >
        <Layer>
          {showGrid && 
            Array.from({ length: 15 }).map((_, i) => 
              Array.from({ length: 15 }).map((_, j) => (
                <Rect
                  key={`grid-${i}-${j}`}
                  x={(i - 5) * 794}
                  y={(j - 5) * 1123}
                  width={794}
                  height={1123}
                  stroke={`${theme.textColor}30`}
                  strokeWidth={2 / scale}
                  dash={[10 / scale, 10 / scale]}
                  listening={false}
                />
              ))
            )
          }
          {items.map((item) => (
            <React.Fragment key={item._id}>
              {item.type === 'text' ? (
                <KonvaText
                  id={item._id}
                  x={item.x}
                  y={item.y}
                  text={item.content}
                  width={item.width}
                  height={item.height}
                  fontSize={20}
                  fontFamily={item.fontFamily || theme.fontFamily}
                  fill={item.color || theme.textColor}
                  draggable={mode === 'select'}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  onPointerDown={(e: any) => {
                    if (mode !== 'text') { setMode('select'); setSelectedId(item._id); }
                  }}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  onDragEnd={(e: any) => {
                    const newX = e.target.x();
                    const newY = e.target.y();
                    setCachedItems(items.map(i => i._id === item._id ? { ...i, x: newX, y: newY } : i));
                    saveItemDb({ id: item._id as Id<"items">, type: item.type, content: item.content, boardId, x: newX, y: newY });
                  }}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  onTransformEnd={(e: any) => {
                    const node = e.target;
                    const scaleX = node.scaleX();
                    const scaleY = node.scaleY();
                    node.scaleX(1); node.scaleY(1);
                    const newWidth = Math.max(5, node.width() * scaleX);
                    const newHeight = Math.max(5, node.height() * scaleY);
                    const newX = node.x();
                    const newY = node.y();
                    
                    setCachedItems(items.map(i => i._id === item._id ? { ...i, x: newX, y: newY, width: newWidth, height: newHeight } : i));
                    
                    saveItemDb({
                      id: item._id as Id<"items">, type: item.type, content: item.content, boardId,
                      x: newX, y: newY, width: newWidth, height: newHeight
                    });
                  }}
                  onClick={() => {
                    if (mode === 'select') { setEditingText({ id: item._id, x: item.x, y: item.y, content: item.content }); }
                  }}
                />
              ) : (
                <CanvasImage
                  id={item._id}
                  x={item.x}
                  y={item.y}
                  url={item.content}
                  width={item.width}
                  height={item.height}
                  draggable={mode === 'select'}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  onPointerDown={(e: any) => {
                    if (mode !== 'text') { setMode('select'); setSelectedId(item._id); }
                  }}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  onDragEnd={(e: any) => {
                    const newX = e.target.x();
                    const newY = e.target.y();
                    setCachedItems(items.map(i => i._id === item._id ? { ...i, x: newX, y: newY } : i));
                    saveItemDb({ id: item._id as Id<"items">, type: item.type, content: item.content, boardId, x: newX, y: newY });
                  }}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  onTransformEnd={(e: any) => {
                    const node = e.target;
                    const scaleX = node.scaleX();
                    const scaleY = node.scaleY();
                    node.scaleX(1); node.scaleY(1);
                    const newWidth = Math.max(5, node.width() * scaleX);
                    const newHeight = Math.max(5, node.height() * scaleY);
                    const newX = node.x();
                    const newY = node.y();
                    
                    setCachedItems(items.map(i => i._id === item._id ? { ...i, x: newX, y: newY, width: newWidth, height: newHeight } : i));
                    
                    saveItemDb({
                      id: item._id as Id<"items">, type: item.type, content: item.content, boardId,
                      x: newX, y: newY, width: newWidth, height: newHeight
                    });
                  }}
                />
              )}
            </React.Fragment>
          ))}
          {selectedId && <Transformer ref={trRef} boundBoxFunc={(oldBox, newBox) => { if (newBox.width < 5 || newBox.height < 5) return oldBox; return newBox; }} />}
        </Layer>
      </Stage>
    </div>
  );
};

export default App;
