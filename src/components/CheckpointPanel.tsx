import React, { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { GitCommitHorizontal, RotateCcw, Plus, X, Clock } from 'lucide-react';

interface CheckpointPanelProps {
  visible: boolean;
  onClose: () => void;
  boardId: string;
  theme: {
    backgroundColor: string;
    textColor: string;
    accentColor: string;
    fontFamily: string;
  };
  onRestored: () => void;
}

const CheckpointPanel: React.FC<CheckpointPanelProps> = ({ visible, onClose, boardId, theme, onRestored }) => {
  const [nameInput, setNameInput] = useState('');
  const [creating, setCreating] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const checkpoints = useQuery(api.board.getCheckpoints, { boardId });
  const createCheckpointDb = useMutation(api.board.createCheckpoint);
  const restoreCheckpointDb = useMutation(api.board.restoreCheckpoint);

  if (!visible) return null;

  const handleCreate = async () => {
    const name = nameInput.trim() || `Checkpoint ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    setCreating(true);
    try {
      await createCheckpointDb({ boardId, name });
      setNameInput('');
    } finally {
      setCreating(false);
    }
  };

  const handleRestore = async (id: Id<'checkpoints'>) => {
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
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  const panelStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    right: 0,
    width: '300px',
    height: '100vh',
    zIndex: 200,
    backgroundColor: `${theme.backgroundColor}F5`,
    backdropFilter: 'blur(32px)',
    WebkitBackdropFilter: 'blur(32px)',
    borderLeft: `1px solid ${theme.textColor}14`,
    boxShadow: `-16px 0 48px -8px ${theme.textColor}18`,
    display: 'flex',
    flexDirection: 'column',
    fontFamily: theme.fontFamily,
    color: theme.textColor,
  };

  const headerStyle: React.CSSProperties = {
    padding: '20px 20px 16px',
    borderBottom: `1px solid ${theme.textColor}10`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    border: `1px solid ${theme.textColor}20`,
    borderRadius: '10px',
    padding: '9px 13px',
    fontSize: '13px',
    fontFamily: theme.fontFamily,
    background: `${theme.textColor}07`,
    color: theme.textColor,
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  };

  const createBtnStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
    width: '100%',
    padding: '9px 16px',
    marginTop: '10px',
    border: 'none',
    borderRadius: '10px',
    fontSize: '13px',
    fontWeight: 600,
    fontFamily: theme.fontFamily,
    cursor: creating ? 'not-allowed' : 'pointer',
    backgroundColor: theme.textColor,
    color: theme.backgroundColor,
    transition: 'opacity 0.15s',
    opacity: creating ? 0.6 : 1,
    justifyContent: 'center',
  };

  return (
    <div style={panelStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <GitCommitHorizontal size={17} strokeWidth={2} />
          <span style={{ fontSize: '14px', fontWeight: 700, letterSpacing: '-0.2px' }}>Checkpoints</span>
        </div>
        <button
          onClick={onClose}
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: theme.textColor, opacity: 0.45, padding: '4px', borderRadius: '6px', display: 'flex', alignItems: 'center' }}
        >
          <X size={16} />
        </button>
      </div>

      {/* Create section */}
      <div style={{ padding: '16px 20px 12px', borderBottom: `1px solid ${theme.textColor}10` }}>
        <p style={{ fontSize: '11px', fontWeight: 600, opacity: 0.4, margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
          Save Current State
        </p>
        <input
          style={inputStyle}
          placeholder="Checkpoint name (optional)"
          value={nameInput}
          onChange={e => setNameInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
        />
        <button style={createBtnStyle} onClick={handleCreate} disabled={creating}>
          <Plus size={14} />
          {creating ? 'Saving…' : 'Create Checkpoint'}
        </button>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px 20px' }}>
        <p style={{ fontSize: '11px', fontWeight: 600, opacity: 0.4, margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
          History
        </p>

        {!checkpoints || checkpoints.length === 0 ? (
          <div style={{ textAlign: 'center', opacity: 0.25, paddingTop: '40px' }}>
            <GitCommitHorizontal size={32} style={{ margin: '0 auto 10px', display: 'block' }} />
            <p style={{ fontSize: '13px', margin: 0 }}>No checkpoints yet</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {checkpoints.map((cp, idx) => (
              <div
                key={cp._id}
                style={{
                  borderRadius: '12px',
                  border: `1px solid ${theme.textColor}12`,
                  backgroundColor: `${theme.textColor}05`,
                  padding: '12px 14px',
                  position: 'relative',
                  transition: 'background 0.15s',
                }}
              >
                {/* Timeline dot */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  <div style={{
                    width: '8px', height: '8px', borderRadius: '50%',
                    backgroundColor: idx === 0 ? theme.textColor : `${theme.textColor}40`,
                    marginTop: '4px', flexShrink: 0,
                    boxShadow: idx === 0 ? `0 0 0 3px ${theme.textColor}18` : 'none',
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: '0 0 3px', fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {cp.name}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', opacity: 0.4 }}>
                      <Clock size={11} />
                      <span style={{ fontSize: '11px' }}>{formatAge(cp._creationTime)}</span>
                      <span style={{ fontSize: '11px' }}>· {cp.items.length} item{cp.items.length !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                </div>

                {/* Restore action */}
                <div style={{ marginTop: '10px', display: 'flex', gap: '6px' }}>
                  {confirmId === cp._id ? (
                    <>
                      <button
                        onClick={() => handleRestore(cp._id as Id<'checkpoints'>)}
                        disabled={restoringId === cp._id}
                        style={{
                          flex: 1, border: 'none', borderRadius: '8px', padding: '7px 12px',
                          fontSize: '12px', fontWeight: 600, fontFamily: theme.fontFamily, cursor: 'pointer',
                          backgroundColor: theme.textColor, color: theme.backgroundColor,
                          opacity: restoringId === cp._id ? 0.6 : 1,
                          transition: 'opacity 0.15s',
                        }}
                      >
                        {restoringId === cp._id ? 'Restoring…' : 'Yes, Restore'}
                      </button>
                      <button
                        onClick={() => setConfirmId(null)}
                        style={{
                          border: `1px solid ${theme.textColor}20`, borderRadius: '8px', padding: '7px 12px',
                          fontSize: '12px', fontWeight: 600, fontFamily: theme.fontFamily, cursor: 'pointer',
                          background: 'transparent', color: theme.textColor,
                        }}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setConfirmId(cp._id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        border: `1px solid ${theme.textColor}15`, borderRadius: '8px', padding: '7px 12px',
                        fontSize: '12px', fontWeight: 600, fontFamily: theme.fontFamily, cursor: 'pointer',
                        background: 'transparent', color: theme.textColor, transition: 'background 0.15s',
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
