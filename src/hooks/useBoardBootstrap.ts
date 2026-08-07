import { useEffect, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useStore } from "../store";
import { DEFAULT_THEME, applyThemeToDocument, normalizeTheme } from "../themes";

export function useBoardBootstrap() {
  const boards = useQuery(api.board.listBoards);
  const ensureDefault = useMutation(api.board.ensureDefaultBoard);
  const activeBoardId = useStore((s) => s.activeBoardId);
  const setActiveBoardId = useStore((s) => s.setActiveBoardId);
  const setTheme = useStore((s) => s.setTheme);
  const setCachedItems = useStore((s) => s.setCachedItems);
  const clearBoardHistory = useStore((s) => s.clearBoardHistory);
  const ensuringRef = useRef(false);

  useEffect(() => {
    if (boards === undefined) return;

    if (boards.length === 0) {
      if (!ensuringRef.current) {
        ensuringRef.current = true;
        ensureDefault({}).finally(() => {
          ensuringRef.current = false;
        });
      }
      return;
    }

    const isValid = (id: string | null | undefined) =>
      !!id && boards.some((board) => board._id === id);

    const hashMatch = window.location.hash.match(/^#board\/(.+)$/);
    const hashId = hashMatch?.[1];

    const targetId = isValid(hashId)
      ? hashId!
      : isValid(activeBoardId)
        ? activeBoardId!
        : boards[0]._id;

    const targetBoard = boards.find((board) => board._id === targetId);

    if (activeBoardId !== targetId) {
      setActiveBoardId(targetId);
      setCachedItems([]);
      clearBoardHistory(targetId);
      const boardTheme = targetBoard?.theme ? normalizeTheme(targetBoard.theme) : DEFAULT_THEME;
      setTheme(boardTheme);
      applyThemeToDocument(boardTheme);
    }

    const expectedHash = `#board/${targetId}`;
    if (window.location.hash !== expectedHash) {
      window.location.hash = `board/${targetId}`;
    }
  }, [
    boards,
    activeBoardId,
    ensureDefault,
    setActiveBoardId,
    setCachedItems,
    clearBoardHistory,
    setTheme,
  ]);

  const ready = boards !== undefined && boards.length > 0 && !!activeBoardId;

  return { boards, activeBoardId, ready };
}
