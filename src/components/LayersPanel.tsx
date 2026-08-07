import React from "react";
import {
  Layers,
  ChevronUp,
  ChevronDown,
  Trash2,
  Type,
  Image as ImageIcon,
  Square,
  ArrowUpRight,
  X,
} from "lucide-react";
import type { CanvasItem } from "../types";

const typeMeta = (item: CanvasItem) => {
  switch (item.type) {
    case "image":
      return { Icon: ImageIcon, label: "Image" };
    case "rect":
      return { Icon: Square, label: "Rectangle" };
    case "arrow":
      return { Icon: ArrowUpRight, label: "Arrow" };
    default:
      return { Icon: Type, label: "Text" };
  }
};

interface LayersPanelProps {
  visible: boolean;
  onClose: () => void;
  /** Items ordered front-to-back (top of list = front-most). */
  layers: CanvasItem[];
  selectedIds: string[];
  onSelect: (id: string) => void;
  onBringForward: (id: string) => void;
  onSendBackward: (id: string) => void;
  onDelete: (id: string) => void;
}

const labelFor = (item: CanvasItem) => {
  if (item.type === "text") {
    const trimmed = item.content.replace(/\s+/g, " ").trim();
    return trimmed.length > 0 ? trimmed : "Empty text";
  }
  if (item.type === "rect") {
    const trimmed = item.content.replace(/\s+/g, " ").trim();
    return trimmed.length > 0 ? trimmed : "Rectangle";
  }
  return typeMeta(item).label;
};

const LayersPanel: React.FC<LayersPanelProps> = ({
  visible,
  onClose,
  layers,
  selectedIds,
  onSelect,
  onBringForward,
  onSendBackward,
  onDelete,
}) => {
  if (!visible) return null;

  const iconBtn: React.CSSProperties = {
    border: "none",
    background: "transparent",
    cursor: "pointer",
    color: "var(--muted)",
    padding: 4,
    borderRadius: 6,
    display: "flex",
    alignItems: "center",
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
          <Layers size={16} />
          <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-0.02em" }}>Layers</span>
        </div>
        <button onClick={onClose} style={{ ...iconBtn, color: "var(--muted)" }}>
          <X size={16} />
        </button>
      </div>

      <div className="panel-scroll" style={{ flex: 1, overflowY: "auto", padding: "14px 16px 20px" }}>
        <p
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--muted)",
            margin: "0 4px 12px",
          }}
        >
          Front → Back
        </p>

        {layers.length === 0 ? (
          <div style={{ textAlign: "center", color: "var(--muted)", paddingTop: 40, opacity: 0.6 }}>
            <Layers size={28} style={{ margin: "0 auto 10px", display: "block" }} />
            <p style={{ fontSize: 13, margin: 0 }}>Nothing on the canvas yet</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {layers.map((item, idx) => {
              const active = selectedIds.includes(item._id);
              const isFront = idx === 0;
              const isBack = idx === layers.length - 1;
              const { Icon, label } = typeMeta(item);
              return (
                <div
                  key={item._id}
                  className="layer-row"
                  onClick={() => onSelect(item._id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 10px",
                    borderRadius: 10,
                    cursor: "pointer",
                    border: `1px solid ${active ? "var(--accent)" : "transparent"}`,
                    background: active
                      ? "color-mix(in srgb, var(--accent) 12%, transparent)"
                      : "transparent",
                    transition: "background 0.12s, border-color 0.12s",
                  }}
                >
                  <div
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 7,
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden",
                      background: "color-mix(in srgb, var(--text) 6%, transparent)",
                      border: "1px solid var(--border)",
                      color: "var(--muted)",
                    }}
                  >
                    {item.type === "image" ? (
                      <img
                        src={item.content}
                        alt=""
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : (
                      <Icon
                        size={14}
                        color={item.type === "rect" || item.type === "arrow" ? item.color : undefined}
                      />
                    )}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        margin: 0,
                        fontSize: 12.5,
                        fontWeight: 500,
                        color: "var(--text)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {labelFor(item)}
                    </p>
                    <span
                      style={{
                        fontSize: 10,
                        color: "var(--muted)",
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <Icon size={10} />
                      {label}
                    </span>
                  </div>

                  <div className="layer-actions" style={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <button
                      title="Bring forward"
                      disabled={isFront}
                      onClick={(e) => {
                        e.stopPropagation();
                        onBringForward(item._id);
                      }}
                      style={{ ...iconBtn, opacity: isFront ? 0.25 : 1, cursor: isFront ? "default" : "pointer" }}
                    >
                      <ChevronUp size={15} />
                    </button>
                    <button
                      title="Send backward"
                      disabled={isBack}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSendBackward(item._id);
                      }}
                      style={{ ...iconBtn, opacity: isBack ? 0.25 : 1, cursor: isBack ? "default" : "pointer" }}
                    >
                      <ChevronDown size={15} />
                    </button>
                    <button
                      title="Delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(item._id);
                      }}
                      style={iconBtn}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default LayersPanel;
