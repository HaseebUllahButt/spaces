import React, { useRef, useState } from "react";
import { useMutation } from "convex/react";
import { Plus, X } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useStore } from "../store";
import { DEFAULT_THEME, applyThemeToDocument, normalizeTheme } from "../themes";

interface BoardDoc {
  _id: Id<"boards">;
  name: string;
  theme?: typeof DEFAULT_THEME | null;
}

interface BoardSwitcherProps {
  boards: BoardDoc[] | undefined;
  onBoardChange?: () => void;
}

const BoardSwitcher: React.FC<BoardSwitcherProps> = ({ boards, onBoardChange }) => {
  const createBoard = useMutation(api.board.createBoard);
  const renameBoard = useMutation(api.board.renameBoard);
  const deleteBoard = useMutation(api.board.deleteBoard);

  const { activeBoardId, setActiveBoardId, setTheme, setCachedItems, clearBoardHistory } = useStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const switchBoard = (id: string, board?: BoardDoc) => {
    if (id === activeBoardId) return;
    setActiveBoardId(id);
    setCachedItems([]);
    clearBoardHistory(id);
    window.location.hash = `board/${id}`;
    const boardTheme = board?.theme ? normalizeTheme(board.theme) : DEFAULT_THEME;
    setTheme(boardTheme);
    applyThemeToDocument(boardTheme);
    onBoardChange?.();
  };

  const handleCreate = async () => {
    const id = await createBoard({ name: "Untitled" });
    switchBoard(id, { _id: id, name: "Untitled" });
  };

  const startRename = (id: string, name: string) => {
    setEditingId(id);
    setEditName(name);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  };

  const commitRename = async () => {
    if (!editingId) return;
    const trimmed = editName.trim();
    if (trimmed) {
      await renameBoard({ id: editingId as Id<"boards">, name: trimmed });
    }
    setEditingId(null);
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!boards || boards.length <= 1) return;
    if (!confirm("Delete this board and all its content?")) return;
    await deleteBoard({ id: id as Id<"boards"> });
    if (activeBoardId === id) {
      const remaining = boards.filter((b) => b._id !== id);
      if (remaining[0]) switchBoard(remaining[0]._id, remaining[0]);
    }
  };

  if (!boards) {
    return (
      <div className="board-bar">
        <span className="app-title">Spaces</span>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>Loading…</span>
      </div>
    );
  }

  return (
    <div className="board-bar">
      <span className="app-title">Spaces</span>
      <div className="board-tabs-scroll">
        {boards.map((board) => {
          const active = board._id === activeBoardId;
          const editing = editingId === board._id;

          if (editing) {
            return (
              <input
                key={board._id}
                ref={inputRef}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename();
                  if (e.key === "Escape") setEditingId(null);
                }}
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  padding: "5px 10px",
                  borderRadius: 8,
                  border: "1px solid var(--accent)",
                  background: "var(--surface)",
                  color: "var(--text)",
                  outline: "none",
                  minWidth: 80,
                }}
              />
            );
          }

          return (
            <div key={board._id} style={{ display: "flex", alignItems: "center", position: "relative" }}>
              <button
                className={`board-tab${active ? " active" : ""}`}
                onClick={() => switchBoard(board._id, board)}
                onDoubleClick={() => startRename(board._id, board.name)}
                title="Double-click to rename"
              >
                {board.name}
              </button>
              {boards.length > 1 && active && (
                <button
                  onClick={(e) => handleDelete(e, board._id)}
                  style={{
                    position: "absolute",
                    right: -4,
                    top: -4,
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    border: "none",
                    background: "var(--text)",
                    color: "var(--bg)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 0,
                    opacity: 0.7,
                  }}
                  title="Delete board"
                >
                  <X size={10} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      <button className="board-add-btn" onClick={handleCreate} title="New board">
        <Plus size={14} />
      </button>
    </div>
  );
};

export default BoardSwitcher;
