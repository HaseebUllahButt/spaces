export type ThemeCategory = "light" | "dark" | "editorial";

export interface Theme {
  id: string;
  name: string;
  backgroundColor: string;
  textColor: string;
  accentColor: string;
  mutedColor: string;
  surfaceColor: string;
  fontFamily: string;
  isDark?: boolean;
  category?: ThemeCategory;
}

export const FONT_OPTIONS = [
  { id: "inter", label: "Inter", value: "Inter, system-ui, sans-serif" },
  { id: "dm-sans", label: "DM Sans", value: "DM Sans, system-ui, sans-serif" },
  { id: "fraunces", label: "Fraunces", value: "Fraunces, Georgia, serif" },
  { id: "playfair", label: "Playfair Display", value: "Playfair Display, Georgia, serif" },
  { id: "space-mono", label: "Space Mono", value: "Space Mono, ui-monospace, monospace" },
  { id: "jetbrains", label: "JetBrains Mono", value: "JetBrains Mono, ui-monospace, monospace" },
] as const;

export const PRESET_THEMES: Theme[] = [
  // ── Light: warm / cool / botanical ──────────────────────────────
  {
    id: "gallery",
    name: "Gallery",
    backgroundColor: "#F6F4EF",
    textColor: "#211E1A",
    accentColor: "#A98546",
    mutedColor: "#8B8478",
    surfaceColor: "#FFFFFF",
    fontFamily: "Inter, system-ui, sans-serif",
    category: "light",
  },
  {
    id: "porcelain",
    name: "Porcelain",
    backgroundColor: "#FAFBFC",
    textColor: "#14171C",
    accentColor: "#3E6D9C",
    mutedColor: "#6B7079",
    surfaceColor: "#FFFFFF",
    fontFamily: "Inter, system-ui, sans-serif",
    category: "light",
  },
  {
    id: "sage",
    name: "Sage",
    backgroundColor: "#EDF1EA",
    textColor: "#232B22",
    accentColor: "#4E7A50",
    mutedColor: "#77826F",
    surfaceColor: "#F6F9F3",
    fontFamily: "DM Sans, system-ui, sans-serif",
    category: "light",
  },
  {
    id: "slate",
    name: "Slate",
    backgroundColor: "#ECEEF1",
    textColor: "#1B2027",
    accentColor: "#5A6B7B",
    mutedColor: "#79828D",
    surfaceColor: "#F6F7F9",
    fontFamily: "Inter, system-ui, sans-serif",
    category: "light",
  },
  {
    id: "blush",
    name: "Blush",
    backgroundColor: "#F7EFEC",
    textColor: "#2C1F1E",
    accentColor: "#BD6E72",
    mutedColor: "#9A8480",
    surfaceColor: "#FDF7F5",
    fontFamily: "DM Sans, system-ui, sans-serif",
    category: "light",
  },
  // ── Dark: monochrome / blue night / teal deep ───────────────────
  {
    id: "studio",
    name: "Studio",
    backgroundColor: "#0F0F0F",
    textColor: "#F3F2EF",
    accentColor: "#EDEDE8",
    mutedColor: "#7C7C7A",
    surfaceColor: "#1A1A1A",
    fontFamily: "Inter, system-ui, sans-serif",
    isDark: true,
    category: "dark",
  },
  {
    id: "obsidian",
    name: "Obsidian",
    backgroundColor: "#0B0E18",
    textColor: "#DCE2EF",
    accentColor: "#7E97F0",
    mutedColor: "#656C80",
    surfaceColor: "#141827",
    fontFamily: "Inter, system-ui, sans-serif",
    isDark: true,
    category: "dark",
  },
  {
    id: "cove",
    name: "Cove",
    backgroundColor: "#0A1513",
    textColor: "#D9E6E1",
    accentColor: "#46B79C",
    mutedColor: "#5E756E",
    surfaceColor: "#10201D",
    fontFamily: "Inter, system-ui, sans-serif",
    isDark: true,
    category: "dark",
  },
  {
    id: "ember",
    name: "Ember",
    backgroundColor: "#16171A",
    textColor: "#E8E6E1",
    accentColor: "#E0A24C",
    mutedColor: "#83837E",
    surfaceColor: "#1F2024",
    fontFamily: "Inter, system-ui, sans-serif",
    isDark: true,
    category: "dark",
  },
  {
    id: "wine",
    name: "Wine",
    backgroundColor: "#150E11",
    textColor: "#EEDDE0",
    accentColor: "#C06B84",
    mutedColor: "#85707A",
    surfaceColor: "#1E151A",
    fontFamily: "Inter, system-ui, sans-serif",
    isDark: true,
    category: "dark",
  },
  // ── Editorial: warm serif / mono spec / dark serif ──────────────
  {
    id: "archival",
    name: "Archival",
    backgroundColor: "#FBF8F1",
    textColor: "#1E1A15",
    accentColor: "#8A2E2A",
    mutedColor: "#7C7367",
    surfaceColor: "#FFFDF8",
    fontFamily: "Fraunces, Georgia, serif",
    category: "editorial",
  },
  {
    id: "blueprint",
    name: "Blueprint",
    backgroundColor: "#E6ECF3",
    textColor: "#123457",
    accentColor: "#1E5FBE",
    mutedColor: "#5E718A",
    surfaceColor: "#F1F5FA",
    fontFamily: "Space Mono, ui-monospace, monospace",
    category: "editorial",
  },
  {
    id: "nocturne",
    name: "Nocturne",
    backgroundColor: "#15120D",
    textColor: "#EAE3D4",
    accentColor: "#C09A4E",
    mutedColor: "#8A8072",
    surfaceColor: "#1E1A13",
    fontFamily: "Playfair Display, Georgia, serif",
    isDark: true,
    category: "editorial",
  },
  {
    id: "meridian",
    name: "Meridian",
    backgroundColor: "#F4F1E8",
    textColor: "#1B2422",
    accentColor: "#1F6F6A",
    mutedColor: "#7C8079",
    surfaceColor: "#FBF9F2",
    fontFamily: "Fraunces, Georgia, serif",
    category: "editorial",
  },
];

export const DEFAULT_THEME = PRESET_THEMES[0];

export function getThemeById(id: string): Theme | undefined {
  return PRESET_THEMES.find((t) => t.id === id);
}

export function deriveMutedColor(textColor: string, backgroundColor: string): string {
  const parse = (hex: string) => {
    const h = hex.replace("#", "");
    const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
    return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
  };
  const [tr, tg, tb] = parse(textColor);
  const [br, bg, bb] = parse(backgroundColor);
  const mix = (a: number, b: number) => Math.round(a * 0.45 + b * 0.55);
  const r = mix(tr, br);
  const g = mix(tg, bg);
  const b = mix(tb, bb);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

export function deriveSurfaceColor(backgroundColor: string, isDark?: boolean): string {
  const hex = backgroundColor.replace("#", "");
  const n = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  const delta = isDark ? 14 : -8;
  const clamp = (v: number) => Math.min(255, Math.max(0, v + delta));
  return `#${[clamp(r), clamp(g), clamp(b)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

export function normalizeTheme(partial: Partial<Theme> & Pick<Theme, "backgroundColor" | "textColor">): Theme {
  const isDark =
    partial.isDark ??
    (() => {
      const hex = partial.backgroundColor.replace("#", "");
      const n = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
      const lum =
        (0.299 * parseInt(n.slice(0, 2), 16) +
          0.587 * parseInt(n.slice(2, 4), 16) +
          0.114 * parseInt(n.slice(4, 6), 16)) /
        255;
      return lum < 0.45;
    })();

  return {
    id: partial.id ?? "custom",
    name: partial.name ?? "Custom",
    backgroundColor: partial.backgroundColor,
    textColor: partial.textColor,
    accentColor: partial.accentColor ?? partial.textColor,
    mutedColor: partial.mutedColor ?? deriveMutedColor(partial.textColor, partial.backgroundColor),
    surfaceColor: partial.surfaceColor ?? deriveSurfaceColor(partial.backgroundColor, isDark),
    fontFamily: partial.fontFamily ?? DEFAULT_THEME.fontFamily,
    isDark,
    category: partial.category ?? (isDark ? "dark" : "light"),
  };
}

export function applyThemeToDocument(theme: Theme) {
  const root = document.documentElement;
  root.style.setProperty("--bg", theme.backgroundColor);
  root.style.setProperty("--text", theme.textColor);
  root.style.setProperty("--accent", theme.accentColor);
  root.style.setProperty("--muted", theme.mutedColor);
  root.style.setProperty("--surface", theme.surfaceColor);
  root.style.setProperty("--font", theme.fontFamily);
  root.style.setProperty("--border", `${theme.textColor}18`);
  root.style.setProperty("--border-strong", `${theme.textColor}28`);
  root.style.setProperty("--shadow", `${theme.textColor}20`);
  root.dataset.themeMode = theme.isDark ? "dark" : "light";
}

export function themeFromPreset(preset: Theme): Theme {
  return normalizeTheme(preset);
}

export const CATEGORY_LABELS: Record<ThemeCategory, string> = {
  light: "Light",
  dark: "Dark",
  editorial: "Editorial",
};
