import React, { useRef, useState } from "react";
import { useMutation } from "convex/react";
import { LayoutGrid, Palette, Sparkles, X } from "lucide-react";
import { getPaletteSync } from "colorthief";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useStore } from "../store";
import {
  ACCENT_OPTIONS,
  BASE_MODES,
  FONT_OPTIONS,
  type Theme,
  type ThemeMode,
  applyThemeToDocument,
  composeTheme,
  deriveMutedColor,
  deriveSurfaceColor,
  normalizeTheme,
  parseThemeId,
} from "../themes";
import type { CanvasItem } from "../types";

interface ThemePanelProps {
  visible: boolean;
  onClose: () => void;
  boardId: string;
  onExportPDF: () => void;
  showGrid: boolean;
  onToggleGrid: () => void;
}

const ThemePanel: React.FC<ThemePanelProps> = ({
  visible,
  onClose,
  boardId,
  onExportPDF,
  showGrid,
  onToggleGrid,
}) => {
  const { theme, setTheme, cachedItems, setCachedItems } = useStore();
  const updateBoardTheme = useMutation(api.board.updateBoardTheme);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Remember the last chosen accent so switching modes keeps the accent (and vice versa).
  const parsed = parseThemeId(theme.id);
  const [accentId, setAccentId] = useState<string>(parsed?.accent ?? "brass");
  const activeMode: ThemeMode | null =
    parsed?.mode ?? (theme.id === "custom" || theme.id === "extracted" ? null : theme.isDark ? "dark" : "light");

  if (!visible) return null;

  const applyTheme = (next: Theme, syncText = true) => {
    const normalized = normalizeTheme(next);
    if (syncText) {
      setCachedItems(
        cachedItems.map((item: CanvasItem) =>
          item.type === "text" && item.color === theme.textColor
            ? {
                ...item,
                color: normalized.textColor,
                fontFamily: item.fontFamily === theme.fontFamily ? normalized.fontFamily : item.fontFamily,
              }
            : item,
        ),
      );
    }
    setTheme(normalized);
    applyThemeToDocument(normalized);
    updateBoardTheme({ id: boardId as Id<"boards">, theme: normalized });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.crossOrigin = "Anonymous";
    img.src = objectUrl;

    img.onload = () => {
      try {
        const palette = getPaletteSync(img, { colorCount: 5 });
        if (!palette || palette.length === 0) return;

        const bgHex = palette[0].hex();
        const { r, g, b } = palette[0].rgb();
        const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        const isDark = lum < 0.45;
        const accentHex = palette.length > 2 ? palette[2].hex() : palette[1].hex();
        const textHex = isDark ? "#F5F5F4" : "#1C1917";

        applyTheme(
          normalizeTheme({
            id: "extracted",
            name: "From Image",
            backgroundColor: bgHex,
            textColor: textHex,
            accentColor: accentHex,
            mutedColor: deriveMutedColor(textHex, bgHex),
            surfaceColor: deriveSurfaceColor(bgHex, isDark),
            fontFamily: theme.fontFamily,
            isDark,
          }),
        );
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };
    e.target.value = "";
  };

  const sectionLabel: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--muted)",
    margin: "0 0 8px",
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
          <Palette size={16} />
          <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-0.02em" }}>Appearance</span>
        </div>
        <button
          onClick={onClose}
          style={{
            border: "none",
            background: "transparent",
            cursor: "pointer",
            color: "var(--muted)",
            padding: 4,
            borderRadius: 6,
            display: "flex",
          }}
        >
          <X size={16} />
        </button>
      </div>

      <div className="panel-scroll" style={{ flex: 1, overflowY: "auto", padding: "16px 20px 24px" }}>
        {/* Live preview */}
        <div
          style={{
            borderRadius: 14,
            overflow: "hidden",
            border: "1px solid var(--border)",
            marginBottom: 20,
          }}
        >
          <div
            style={{
              background: theme.backgroundColor,
              padding: "20px 18px",
              minHeight: 88,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              transition: "background 0.35s ease",
            }}
          >
            <span
              style={{
                fontFamily: theme.fontFamily,
                fontSize: 18,
                fontWeight: 600,
                color: theme.textColor,
                letterSpacing: "-0.02em",
                transition: "color 0.35s ease",
              }}
            >
              {theme.name}
            </span>
            <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
              {[theme.backgroundColor, theme.textColor, theme.accentColor, theme.mutedColor].map((c) => (
                <div
                  key={c}
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 6,
                    background: c,
                    border: "1px solid rgba(128,128,128,0.2)",
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Mode */}
        <p style={sectionLabel}>Mode</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 20 }}>
          {BASE_MODES.map((mode) => {
            const active = activeMode === mode.id;
            const preview = composeTheme(mode.id, accentId);
            return (
              <button
                key={mode.id}
                onClick={() => applyTheme(preview)}
                title={mode.name}
                style={{
                  padding: 0,
                  overflow: "hidden",
                  borderRadius: 10,
                  cursor: "pointer",
                  background: mode.backgroundColor,
                  border: "1px solid var(--border)",
                  outline: active ? "2px solid var(--accent)" : "none",
                  outlineOffset: 2,
                  opacity: active ? 1 : 0.82,
                  transition: "opacity 0.15s ease",
                }}
              >
                <div style={{ height: 34, position: "relative" }}>
                  <div
                    style={{
                      position: "absolute",
                      bottom: 6,
                      left: 9,
                      width: 16,
                      height: 3,
                      borderRadius: 2,
                      background: mode.textColor,
                      opacity: 0.85,
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      bottom: 5,
                      right: 9,
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: preview.accentColor,
                    }}
                  />
                </div>
                <div
                  style={{
                    padding: "0 9px 7px",
                    fontSize: 10,
                    fontWeight: 600,
                    color: mode.textColor,
                    textAlign: "left",
                    fontFamily: mode.fontFamily,
                    opacity: 0.9,
                  }}
                >
                  {mode.name}
                </div>
              </button>
            );
          })}
        </div>

        {/* Accent */}
        <p style={sectionLabel}>Accent</p>
        <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
          {ACCENT_OPTIONS.map((accent) => {
            const active = accentId === accent.id && activeMode !== null;
            const swatch = theme.isDark ? accent.dark : accent.light;
            return (
              <button
                key={accent.id}
                onClick={() => {
                  setAccentId(accent.id);
                  applyTheme(composeTheme(activeMode ?? (theme.isDark ? "dark" : "light"), accent.id));
                }}
                title={accent.name}
                aria-label={`${accent.name} accent`}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  background: swatch,
                  cursor: "pointer",
                  border: "2px solid var(--bg)",
                  outline: active ? "2px solid var(--text)" : "1px solid var(--border-strong)",
                  outlineOffset: 1,
                  padding: 0,
                  transition: "outline-color 0.15s",
                }}
              />
            );
          })}
        </div>

        {/* Extract from image */}
        <p style={sectionLabel}>From Image</p>
        <input type="file" accept="image/*" ref={fileInputRef} style={{ display: "none" }} onChange={handleImageUpload} />
        <button
          onClick={() => fileInputRef.current?.click()}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "10px 14px",
            marginBottom: 20,
            borderRadius: 10,
            border: "1px dashed var(--border-strong)",
            background: "transparent",
            color: "var(--text)",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            transition: "border-color 0.15s, background 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "var(--accent)";
            e.currentTarget.style.background = "color-mix(in srgb, var(--accent) 6%, transparent)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--border-strong)";
            e.currentTarget.style.background = "transparent";
          }}
        >
          <Sparkles size={14} />
          Extract palette
        </button>

        {/* Custom colors */}
        <p style={sectionLabel}>Customize</p>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            padding: 14,
            borderRadius: 12,
            background: "color-mix(in srgb, var(--text) 4%, transparent)",
            border: "1px solid var(--border)",
            marginBottom: 16,
          }}
        >
          {[
            { label: "Canvas", key: "backgroundColor" as const },
            { label: "Text", key: "textColor" as const },
            { label: "Accent", key: "accentColor" as const },
          ].map(({ label, key }) => (
            <label
              key={key}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}
            >
              <span style={{ fontWeight: 500 }}>{label}</span>
              <input
                type="color"
                className="color-input"
                value={theme[key]}
                onChange={(e) =>
                  applyTheme(
                    normalizeTheme({ ...theme, [key]: e.target.value, id: "custom", name: "Custom" }),
                    key !== "backgroundColor",
                  )
                }
              />
            </label>
          ))}
        </div>

        <p style={sectionLabel}>Typeface</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
          {FONT_OPTIONS.map((font) => (
            <button
              key={font.id}
              onClick={() => applyTheme({ ...theme, fontFamily: font.value, id: theme.id, name: theme.name })}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: `1px solid ${theme.fontFamily === font.value ? "var(--accent)" : "var(--border)"}`,
                background:
                  theme.fontFamily === font.value
                    ? "color-mix(in srgb, var(--accent) 10%, transparent)"
                    : "transparent",
                color: "var(--text)",
                fontFamily: font.value,
                fontSize: 14,
                textAlign: "left",
                cursor: "pointer",
                transition: "border-color 0.15s",
              }}
            >
              {font.label}
            </button>
          ))}
        </div>

        {/* Canvas options */}
        <p style={sectionLabel}>Canvas</p>
        <button
          onClick={onToggleGrid}
          aria-label="Toggle page grid"
          aria-pressed={showGrid}
          style={{
            width: "100%",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "11px 14px",
            marginBottom: 8,
            borderRadius: 10,
            border: "1px solid var(--border)",
            background: "transparent",
            color: "var(--text)",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <LayoutGrid size={14} />
            Page grid
          </span>
          <div
            style={{
              width: 36,
              height: 20,
              borderRadius: 99,
              background: showGrid ? "var(--text)" : "var(--border-strong)",
              position: "relative",
              transition: "background 0.2s",
            }}
          >
            <div
              style={{
                width: 16,
                height: 16,
                borderRadius: "50%",
                background: "var(--bg)",
                position: "absolute",
                top: 2,
                left: showGrid ? 18 : 2,
                transition: "left 0.2s",
              }}
            />
          </div>
        </button>

        <button
          onClick={onExportPDF}
          style={{
            width: "100%",
            padding: "11px 14px",
            borderRadius: 10,
            border: "none",
            background: "var(--text)",
            color: "var(--bg)",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Export to PDF
        </button>
      </div>
    </div>
  );
};

export default ThemePanel;
