export type ThemeCategory = "light" | "dark" | "editorial";
export type ThemeMode = ThemeCategory;

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

/** The three base modes. Accent is chosen separately and composed in. */
export interface BaseMode {
  id: ThemeMode;
  name: string;
  backgroundColor: string;
  textColor: string;
  mutedColor: string;
  surfaceColor: string;
  fontFamily: string;
  isDark: boolean;
}

export const BASE_MODES: BaseMode[] = [
  {
    id: "light",
    name: "Light",
    backgroundColor: "#F7F6F2",
    textColor: "#1D1B17",
    mutedColor: "#8A857C",
    surfaceColor: "#FFFFFF",
    fontFamily: "Inter, system-ui, sans-serif",
    isDark: false,
  },
  {
    id: "dark",
    name: "Dark",
    backgroundColor: "#111113",
    textColor: "#EDEBE6",
    mutedColor: "#8A8984",
    surfaceColor: "#1B1B1E",
    fontFamily: "Inter, system-ui, sans-serif",
    isDark: true,
  },
  {
    id: "editorial",
    name: "Editorial",
    backgroundColor: "#FBF7EE",
    textColor: "#221D15",
    mutedColor: "#867C6C",
    surfaceColor: "#FFFDF7",
    fontFamily: "Fraunces, Georgia, serif",
    isDark: false,
  },
];

/** Accents carry a light-mode and a dark-mode value so they read on both grounds. */
export interface AccentOption {
  id: string;
  name: string;
  light: string;
  dark: string;
}

export const ACCENT_OPTIONS: AccentOption[] = [
  { id: "brass", name: "Brass", light: "#A07A3B", dark: "#C9A45E" },
  { id: "indigo", name: "Indigo", light: "#4A5FC4", dark: "#8497F2" },
  { id: "teal", name: "Teal", light: "#2C7C74", dark: "#57B2A5" },
  { id: "forest", name: "Forest", light: "#43734A", dark: "#74A87C" },
  { id: "rose", name: "Rose", light: "#B25F6B", dark: "#D3868F" },
  { id: "violet", name: "Violet", light: "#7752B8", dark: "#A588E0" },
];

export function getBaseMode(modeId: string): BaseMode {
  return BASE_MODES.find((m) => m.id === modeId) ?? BASE_MODES[0];
}

export function getAccent(accentId: string): AccentOption {
  return ACCENT_OPTIONS.find((a) => a.id === accentId) ?? ACCENT_OPTIONS[0];
}

export function composeTheme(modeId: string, accentId: string): Theme {
  const mode = getBaseMode(modeId);
  const accent = getAccent(accentId);
  return {
    id: `${mode.id}:${accent.id}`,
    name: `${mode.name} · ${accent.name}`,
    backgroundColor: mode.backgroundColor,
    textColor: mode.textColor,
    accentColor: mode.isDark ? accent.dark : accent.light,
    mutedColor: mode.mutedColor,
    surfaceColor: mode.surfaceColor,
    fontFamily: mode.fontFamily,
    isDark: mode.isDark,
    category: mode.id,
  };
}

/** Recover mode/accent from a composed theme id ("dark:teal"). Null for custom themes. */
export function parseThemeId(id: string): { mode: ThemeMode; accent: string } | null {
  const [modeId, accentId] = id.split(":");
  if (!modeId || !accentId) return null;
  if (!BASE_MODES.some((m) => m.id === modeId)) return null;
  if (!ACCENT_OPTIONS.some((a) => a.id === accentId)) return null;
  return { mode: modeId as ThemeMode, accent: accentId };
}

export const DEFAULT_THEME = composeTheme("light", "brass");

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
