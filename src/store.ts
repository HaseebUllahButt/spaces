import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { DEFAULT_THEME } from "./themes";
import type { BoardViewport, CanvasItem, Theme } from "./types";
import { defaultViewport } from "./types";

interface StoreState {
  theme: Theme;
  mode: "select" | "text" | "pan" | "rect" | "arrow";
  activeBoardId: string | null;
  boardViewports: Record<string, BoardViewport>;

  cachedItems: CanvasItem[];
  setCachedItems: (items: CanvasItem[]) => void;

  setMode: (mode: "select" | "text" | "pan" | "rect" | "arrow") => void;
  setTheme: (theme: Theme) => void;
  setActiveBoardId: (id: string) => void;

  getViewport: (boardId: string) => BoardViewport;
  setScale: (boardId: string, scale: number) => void;
  setPosition: (boardId: string, pos: { x: number; y: number }) => void;
  /** Update scale + position in one set() so pan/zoom only hits the store once. */
  setViewportTransform: (
    boardId: string,
    transform: { scale: number; position: { x: number; y: number } },
  ) => void;
  setShowGrid: (boardId: string, show: boolean) => void;
  setHasInteracted: (boardId: string, interacted: boolean) => void;

  pushUndo: (boardId: string, items: CanvasItem[]) => void;
  popUndo: (boardId: string, currentItems: CanvasItem[]) => CanvasItem[] | undefined;
  popRedo: (boardId: string, currentItems: CanvasItem[]) => CanvasItem[] | undefined;
  updateHistoryIds: (boardId: string, oldId: string, newId: string) => void;
  clearBoardHistory: (boardId: string) => void;
}

function patchViewport(
  boardViewports: Record<string, BoardViewport>,
  boardId: string,
  patch: Partial<BoardViewport>,
): Record<string, BoardViewport> {
  const current = boardViewports[boardId] ?? defaultViewport();
  return { ...boardViewports, [boardId]: { ...current, ...patch } };
}

/** Debounce localStorage writes — pan/zoom/undo used to flush full state every frame. */
function createDebouncedStorage(delayMs = 500) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let latest: { name: string; value: string } | null = null;
  return {
    getItem: (name: string) => localStorage.getItem(name),
    setItem: (name: string, value: string) => {
      latest = { name, value };
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (latest) localStorage.setItem(latest.name, latest.value);
        latest = null;
        timer = null;
      }, delayMs);
    },
    removeItem: (name: string) => localStorage.removeItem(name),
  };
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      theme: DEFAULT_THEME,
      mode: "select",
      activeBoardId: null,
      boardViewports: {},
      cachedItems: [],

      setCachedItems: (items) => set({ cachedItems: items }),
      setMode: (mode) => set({ mode }),
      setTheme: (theme) => set({ theme }),
      setActiveBoardId: (id) => set({ activeBoardId: id }),

      getViewport: (boardId) => get().boardViewports[boardId] ?? defaultViewport(),

      setScale: (boardId, scale) =>
        set((state) => ({
          boardViewports: patchViewport(state.boardViewports, boardId, { scale }),
        })),

      setPosition: (boardId, position) =>
        set((state) => ({
          boardViewports: patchViewport(state.boardViewports, boardId, { position }),
        })),

      setViewportTransform: (boardId, transform) =>
        set((state) => ({
          boardViewports: patchViewport(state.boardViewports, boardId, transform),
        })),

      setShowGrid: (boardId, showGrid) =>
        set((state) => ({
          boardViewports: patchViewport(state.boardViewports, boardId, { showGrid }),
        })),

      setHasInteracted: (boardId, hasInteracted) =>
        set((state) => ({
          boardViewports: patchViewport(state.boardViewports, boardId, { hasInteracted }),
        })),

      pushUndo: (boardId, items) =>
        set((state) => {
          const vp = state.boardViewports[boardId] ?? defaultViewport();
          return {
            boardViewports: patchViewport(state.boardViewports, boardId, {
              undoStack: [...vp.undoStack.slice(-20), [...items]],
              redoStack: [],
            }),
          };
        }),

      popUndo: (boardId, currentItems) => {
        let prev: CanvasItem[] | undefined;
        set((state) => {
          const vp = state.boardViewports[boardId] ?? defaultViewport();
          if (vp.undoStack.length === 0) return {};
          const stack = [...vp.undoStack];
          prev = stack.pop();
          return {
            boardViewports: patchViewport(state.boardViewports, boardId, {
              undoStack: stack,
              redoStack: [...vp.redoStack.slice(-20), [...currentItems]],
            }),
          };
        });
        return prev;
      },

      popRedo: (boardId, currentItems) => {
        let next: CanvasItem[] | undefined;
        set((state) => {
          const vp = state.boardViewports[boardId] ?? defaultViewport();
          if (vp.redoStack.length === 0) return {};
          const stack = [...vp.redoStack];
          next = stack.pop();
          return {
            boardViewports: patchViewport(state.boardViewports, boardId, {
              redoStack: stack,
              undoStack: [...vp.undoStack.slice(-20), [...currentItems]],
            }),
          };
        });
        return next;
      },

      updateHistoryIds: (boardId, oldId, newId) =>
        set((state) => {
          const vp = state.boardViewports[boardId] ?? defaultViewport();
          const replace = (list: CanvasItem[]) =>
            list.map((item) => {
              if (item._id !== oldId && item.fromId !== oldId &&
                item.toId !== oldId && item.groupId !== oldId) return item;
              return {
                ...item,
                _id: item._id === oldId ? newId : item._id,
                fromId: item.fromId === oldId ? newId : item.fromId,
                toId: item.toId === oldId ? newId : item.toId,
                groupId: item.groupId === oldId ? newId : item.groupId,
              };
            });
          return {
            cachedItems: replace(state.cachedItems),
            boardViewports: patchViewport(state.boardViewports, boardId, {
              undoStack: vp.undoStack.map(replace),
              redoStack: vp.redoStack.map(replace),
            }),
          };
        }),

      clearBoardHistory: (boardId) =>
        set((state) => ({
          boardViewports: patchViewport(state.boardViewports, boardId, {
            undoStack: [],
            redoStack: [],
            hasInteracted: false,
          }),
        })),
    }),
    {
      name: "spaces-storage-v2",
      storage: createJSONStorage(() => createDebouncedStorage(500)),
      // Never persist undo stacks (huge + high-churn). Keep view/theme prefs only.
      partialize: (state) => ({
        theme: state.theme,
        activeBoardId: state.activeBoardId,
        boardViewports: Object.fromEntries(
          Object.entries(state.boardViewports).map(([id, vp]) => [
            id,
            {
              scale: vp.scale,
              position: vp.position,
              showGrid: vp.showGrid,
              hasInteracted: vp.hasInteracted,
              undoStack: [] as CanvasItem[][],
              redoStack: [] as CanvasItem[][],
            },
          ]),
        ),
      }),
    },
  ),
);
