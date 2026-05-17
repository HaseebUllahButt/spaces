import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CanvasItem, Theme } from './types';

interface StoreState {
  items: CanvasItem[];
  selectedItemIds: string[];
  theme: Theme;
  mode: 'select' | 'text' | 'pan';
  scale: number;
  position: { x: number; y: number };

  // Actions
  setMode: (mode: 'select' | 'text' | 'pan') => void;
  setScale: (scale: number) => void;
  setPosition: (pos: { x: number; y: number }) => void;
  addItem: (item: CanvasItem) => void;
  updateItem: (id: string, updates: Partial<CanvasItem>) => void;
  deleteItems: (ids: string[]) => void;
  setSelection: (ids: string[]) => void;
  setTheme: (theme: Theme) => void;
  
  cachedItems: CanvasItem[];
  setCachedItems: (items: CanvasItem[]) => void;
  showGrid: boolean;
  setShowGrid: (show: boolean) => void;
  undoStack: CanvasItem[][];
  pushUndo: (items: CanvasItem[]) => void;
  popUndo: () => CanvasItem[] | undefined;
}

const defaultTheme: Theme = {
  id: 'cosmos-light',
  name: 'Cosmos Light',
  backgroundColor: '#F9F9F9',
  textColor: '#1C1C1C',
  accentColor: '#E0E0E0',
  fontFamily: 'Inter, sans-serif',
};

export const useStore = create<StoreState>()(
  persist(
    (set) => ({
      items: [],
      selectedItemIds: [],
      theme: defaultTheme,
      mode: 'select',
      scale: 1,
      position: { x: 0, y: 0 },

      setMode: (mode) => set({ mode }),
      setScale: (scale) => set({ scale }),
      setPosition: (position) => set({ position }),
      addItem: (item) => set((state) => ({ items: [...state.items, item] })),
      updateItem: (id, updates) => set((state) => ({
        items: state.items.map((i) => (i._id === id ? { ...i, ...updates } : i))
      })),
      deleteItems: (ids) => set((state) => ({
        items: state.items.filter((i) => !ids.includes(i._id))
      })),
      setSelection: (ids) => set({ selectedItemIds: ids }),
      setTheme: (theme) => set({ theme }),
      
      cachedItems: [],
      setCachedItems: (items) => set({ cachedItems: items }),
      showGrid: false,
      setShowGrid: (show) => set({ showGrid: show }),
      undoStack: [],
      pushUndo: (items) => set((state) => ({ undoStack: [...state.undoStack.slice(-30), [...items]] })),
      popUndo: () => {
        let prev: CanvasItem[] | undefined;
        set((state) => {
          if (state.undoStack.length === 0) return {};
          const stack = [...state.undoStack];
          prev = stack.pop();
          return { undoStack: stack };
        });
        return prev;
      },
    }),
    {
      name: 'clipboard-storage',
      partialize: (state) => ({ 
        theme: state.theme, 
        position: state.position, 
        scale: state.scale,
        cachedItems: state.cachedItems,
        showGrid: state.showGrid
      }),
    }
  )
);
