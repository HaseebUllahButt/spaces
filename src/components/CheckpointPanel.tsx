import React, { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { GitCommitHorizontal, RotateCcw, Plus, X, Clock } from "lucide-react";

interface CheckpointPanelProps {
  visible: boolean;
  onClose: () => void;
  boardId: string;
  onRestored: () => void;
}

const CheckpointPanel: React.FC<CheckpointPanelProps> = ({ visible, onClose, boardId, onRestored }) => {
  const [nameInput, setNameInput] = useState("");
  const [creating, setCreating] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const checkpoints = useQuery(api.board.getCheckpoints, { boardId });
  const createCheckpointDb = useMutation(api.board.createCheckpoint);
  const restoreCheckpointDb = useMutation(api.board.restoreCheckpoint);

  if (!visible) return null;

  const handleCreate = async () => {
    const name = nameInput.trim() || `Checkpoint ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    setCreating(true);
    try {
      await createCheckpointDb({ boardId, name });
      setNameInput("");
    } finally {
      setCreating(false);
    }
  };

  const handleRestore = async (id: Id<"checkpoints">) => {
    setRestoringId(id);
    try {
      await restoreCheckpointDb({ checkpointId: id });
      onRestored();
      setConfirmId(null);
    } finally {
      setRestoringId(null);
    }
  };

  const formatAge = (ts: number) => {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <div className="sidebar-panel">
      <div
        style={{
          padding: "18px 20px 14px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <GitCommitHorizontal size={16} />
          <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-0.02em" }}>Checkpoints</span>
        </div>
        <button
          onClick={onClose}
          style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--muted)", padding: 4, display: "flex" }}
        >
          <X size={16} />
        </button>
      </div>

      <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid var(--border)" }}>
        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)", margin: "0 0 10px" }}>
          Save current state
        </p>
        <input
          placeholder="Name (optional)"
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleCreate();
          }}
          style={{
            width: "100%",
            border: "1px solid var(--border)",
            borderRadius: 10,
            padding: "9px 12px",
            fontSize: 13,
            background: "color-mix(in srgb, var(--text) 4%, transparent)",
            color: "var(--text)",
            outline: "none",
            boxSizing: "border-box",
          }}
        />
        <button
          onClick={handleCreate}
          disabled={creating}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 7,
            width: "100%",
            padding: "9px 16px",
            marginTop: 10,
            border: "none",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            cursor: creating ? "not-allowed" : "pointer",
            background: "var(--text)",
            color: "var(--bg)",
            opacity: creating ? 0.6 : 1,
          }}
        >
          <Plus size={14} />
          {creating ? "Saving…" : "Create checkpoint"}
        </button>
      </div>

      <div className="panel-scroll" style={{ flex: 1, overflowY: "auto", padding: "12px 20px 20px" }}>
        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)", margin: "0 0 12px" }}>
          History
        </p>

        {!checkpoints || checkpoints.length === 0 ? (
          <div style={{ textAlign: "center", color: "var(--muted)", paddingTop: 40, opacity: 0.6 }}>
            <GitCommitHorizontal size={28} style={{ margin: "0 auto 10px", display: "block" }} />
            <p style={{ fontSize: 13, margin: 0 }}>No checkpoints yet</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {checkpoints.map((cp, idx) => (
              <div
                key={cp._id}
                style={{
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  background: "color-mix(in srgb, var(--text) 3%, transparent)",
                  padding: "12px 14px",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: idx === 0 ? "var(--accent)" : "var(--muted)",
                      marginTop: 4,
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: "0 0 3px", fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {cp.name}
                    </p>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--muted)", fontSize: 11 }}>
                      <Clock size={11} />
                      <span>{formatAge(cp._creationTime)}</span>
                      <span>· {cp.items.length} item{cp.items.length !== 1 ? "s" : ""}</span>
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 10, display: "flex", gap: 6 }}>
                  {confirmId === cp._id ? (
                    <>
                      <button
                        onClick={() => handleRestore(cp._id as Id<"checkpoints">)}
                        disabled={restoringId === cp._id}
                        style={{
                          flex: 1,
                          border: "none",
                          borderRadius: 8,
                          padding: "7px 12px",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                          background: "var(--text)",
                          color: "var(--bg)",
                          opacity: restoringId === cp._id ? 0.6 : 1,
                        }}
                      >
                        {restoringId === cp._id ? "Restoring…" : "Confirm restore"}
                      </button>
                      <button
                        onClick={() => setConfirmId(null)}
                        style={{
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          padding: "7px 12px",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                          background: "transparent",
                          color: "var(--text)",
                        }}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setConfirmId(cp._id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        padding: "7px 12px",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                        background: "transparent",
                        color: "var(--text)",
                      }}
                    >
                      <RotateCcw size={12} />
                      Restore
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CheckpointPanel;
