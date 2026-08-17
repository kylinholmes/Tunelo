// Themes — colour schemes in the Windows Terminal scheme format.
//
// A theme is the 16 ANSI colours + background/foreground (+ optional
// cursorColor / selectionBackground) exactly as Windows Terminal's
// settings.json and mbadolato/iTerm2-Color-Schemes' `windowsterminal/`
// exports describe them, so users can paste any of those 450+ schemes as
// a custom theme. On top of that we add `id`, and two optional extras:
//   accent  — which colour drives the accent (defaults to `green`)
//   tokens  — explicit overrides for derived CSS tokens (--bg-1, --border…)
//             used by the two Tunelo built-ins to keep their hand-tuned
//             values; every other theme derives them from bg/fg.

export const ANSI_KEYS = [
  "black", "red", "green", "yellow", "blue", "purple", "cyan", "white",
  "brightBlack", "brightRed", "brightGreen", "brightYellow", "brightBlue", "brightPurple", "brightCyan", "brightWhite",
];
export const REQUIRED_KEYS = ["background", "foreground", ...ANSI_KEYS];
const SCHEME_KEYS = ["name", "background", "foreground", "cursorColor", "selectionBackground", ...ANSI_KEYS];

export const DEFAULT_THEME_ID = "tunelo-dark";

// The original Tunelo palette (kept as the default), expressed as a scheme
// so it lives in the same list as everything else. ANSI slots that Tunelo
// never had are filled with neighbours of its status colours.
const TUNELO_DARK = {
  id: "tunelo-dark", name: "Tunelo Dark",
  background: "#0a0b0d", foreground: "#e6e8eb", cursorColor: "#58e2a3", selectionBackground: "#1f4d3a",
  black: "#181c25", red: "#ef5a6f", green: "#58e2a3", yellow: "#f7c648", blue: "#6aa9ff", purple: "#c084fc", cyan: "#5fd7e2", white: "#b8bdc7",
  brightBlack: "#5b6270", brightRed: "#ff7a8c", brightGreen: "#7cf0bb", brightYellow: "#ffd76a", brightBlue: "#8dbdff", brightPurple: "#d4a5ff", brightCyan: "#84e6ee", brightWhite: "#e6e8eb",
  tokens: {
    "--bg-1": "#101217", "--bg-2": "#14171e", "--bg-3": "#181c25",
    "--border": "#1d2129", "--border-2": "#262b36",
    "--fg-1": "#b8bdc7", "--fg-2": "#8b919c", "--fg-3": "#5b6270",
    "--accent-soft": "rgba(88, 226, 163, 0.12)", "--accent-line": "rgba(88, 226, 163, 0.32)",
  },
};

const TUNELO_LIGHT = {
  id: "tunelo-light", name: "Tunelo Light",
  background: "#fafaf9", foreground: "#15171a", cursorColor: "#14a15c", selectionBackground: "#c9efdc",
  black: "#15171a", red: "#d6455a", green: "#14a15c", yellow: "#c9931a", blue: "#3b7ddd", purple: "#9d5ce0", cyan: "#1f9aa8", white: "#8d93a0",
  brightBlack: "#5e6470", brightRed: "#ef5a6f", brightGreen: "#2fbf7a", brightYellow: "#e0aa2c", brightBlue: "#6aa9ff", brightPurple: "#c084fc", brightCyan: "#43b7c6", brightWhite: "#ffffff",
  tokens: {
    "--bg-1": "#ffffff", "--bg-2": "#f4f4f3", "--bg-3": "#ebebe9",
    "--border": "#e3e3e0", "--border-2": "#d6d6d2",
    "--fg-1": "#2c3038", "--fg-2": "#5e6470", "--fg-3": "#8d93a0",
    "--accent-soft": "rgba(20, 161, 92, 0.1)", "--accent-line": "rgba(20, 161, 92, 0.32)",
  },
};

// Windows Terminal's stock scheme (not part of iTerm2-Color-Schemes).
const CAMPBELL = {
  id: "campbell", name: "Campbell",
  background: "#0c0c0c", foreground: "#cccccc", cursorColor: "#ffffff", selectionBackground: "#ffffff",
  black: "#0c0c0c", red: "#c50f1f", green: "#13a10e", yellow: "#c19c00", blue: "#0037da", purple: "#881798", cyan: "#3a96dd", white: "#cccccc",
  brightBlack: "#767676", brightRed: "#e74856", brightGreen: "#16c60c", brightYellow: "#f9f1a5", brightBlue: "#3b78ff", brightPurple: "#b4009e", brightCyan: "#61d6d6", brightWhite: "#f2f2f2",
  accent: "brightBlue",
};

// Everything between here and CAMPBELL is copied verbatim from
// https://github.com/mbadolato/iTerm2-Color-Schemes/tree/master/windowsterminal
export const BUILTIN_THEMES = [
  TUNELO_DARK,
  TUNELO_LIGHT,
  { id: "one-half-dark", name: "One Half Dark",
    background: "#282c34", foreground: "#dcdfe4", cursorColor: "#a3b3cc", selectionBackground: "#474e5d",
    black: "#282c34", red: "#e06c75", green: "#98c379", yellow: "#e5c07b", blue: "#61afef", purple: "#c678dd", cyan: "#56b6c2", white: "#dcdfe4",
    brightBlack: "#5d677a", brightRed: "#e06c75", brightGreen: "#98c379", brightYellow: "#e5c07b", brightBlue: "#61afef", brightPurple: "#c678dd", brightCyan: "#56b6c2", brightWhite: "#dcdfe4" },
  { id: "one-half-light", name: "One Half Light",
    background: "#fafafa", foreground: "#383a42", cursorColor: "#a5b4e5", selectionBackground: "#bfceff",
    black: "#383a42", red: "#e45649", green: "#50a14f", yellow: "#c18401", blue: "#0184bc", purple: "#a626a4", cyan: "#0997b3", white: "#bababa",
    brightBlack: "#4f525e", brightRed: "#e06c75", brightGreen: "#98c379", brightYellow: "#d8b36e", brightBlue: "#61afef", brightPurple: "#c678dd", brightCyan: "#56b6c2", brightWhite: "#ffffff" },
  { id: "tokyo-night", name: "Tokyo Night",
    background: "#1a1b26", foreground: "#c0caf5", cursorColor: "#c0caf5", selectionBackground: "#33467c",
    black: "#15161e", red: "#f7768e", green: "#9ece6a", yellow: "#e0af68", blue: "#7aa2f7", purple: "#bb9af7", cyan: "#7dcfff", white: "#a9b1d6",
    brightBlack: "#414868", brightRed: "#f7768e", brightGreen: "#9ece6a", brightYellow: "#e0af68", brightBlue: "#7aa2f7", brightPurple: "#bb9af7", brightCyan: "#7dcfff", brightWhite: "#c0caf5" },
  { id: "tokyo-night-storm", name: "Tokyo Night Storm",
    background: "#24283b", foreground: "#c0caf5", cursorColor: "#c0caf5", selectionBackground: "#364a82",
    black: "#1d202f", red: "#f7768e", green: "#9ece6a", yellow: "#e0af68", blue: "#7aa2f7", purple: "#bb9af7", cyan: "#7dcfff", white: "#a9b1d6",
    brightBlack: "#4e5575", brightRed: "#f7768e", brightGreen: "#9ece6a", brightYellow: "#e0af68", brightBlue: "#7aa2f7", brightPurple: "#bb9af7", brightCyan: "#7dcfff", brightWhite: "#c0caf5" },
  { id: "tokyo-night-day", name: "Tokyo Night Day",
    background: "#e1e2e7", foreground: "#3760bf", cursorColor: "#3760bf", selectionBackground: "#99a7df",
    black: "#e9e9ed", red: "#f52a65", green: "#587539", yellow: "#8c6c3e", blue: "#2e7de9", purple: "#9854f1", cyan: "#007197", white: "#6172b0",
    brightBlack: "#a1a6c5", brightRed: "#f52a65", brightGreen: "#587539", brightYellow: "#8c6c3e", brightBlue: "#2e7de9", brightPurple: "#9854f1", brightCyan: "#007197", brightWhite: "#3760bf" },
  { id: "dracula", name: "Dracula",
    background: "#282a36", foreground: "#f8f8f2", cursorColor: "#f8f8f2", selectionBackground: "#44475a",
    black: "#21222c", red: "#ff5555", green: "#50fa7b", yellow: "#f1fa8c", blue: "#bd93f9", purple: "#ff79c6", cyan: "#8be9fd", white: "#f8f8f2",
    brightBlack: "#6272a4", brightRed: "#ff6e6e", brightGreen: "#69ff94", brightYellow: "#ffffa5", brightBlue: "#d6acff", brightPurple: "#ff92df", brightCyan: "#a4ffff", brightWhite: "#ffffff" },
  { id: "nord", name: "Nord",
    background: "#2e3440", foreground: "#d8dee9", cursorColor: "#eceff4", selectionBackground: "#eceff4",
    black: "#3b4252", red: "#bf616a", green: "#a3be8c", yellow: "#ebcb8b", blue: "#81a1c1", purple: "#b48ead", cyan: "#88c0d0", white: "#e5e9f0",
    brightBlack: "#596377", brightRed: "#bf616a", brightGreen: "#a3be8c", brightYellow: "#ebcb8b", brightBlue: "#81a1c1", brightPurple: "#b48ead", brightCyan: "#8fbcbb", brightWhite: "#eceff4" },
  { id: "solarized-dark", name: "Solarized Dark",
    background: "#002b36", foreground: "#839496", cursorColor: "#839496", selectionBackground: "#073642",
    black: "#073642", red: "#dc322f", green: "#859900", yellow: "#b58900", blue: "#268bd2", purple: "#d33682", cyan: "#2aa198", white: "#eee8d5",
    brightBlack: "#335e69", brightRed: "#cb4b16", brightGreen: "#586e75", brightYellow: "#657b83", brightBlue: "#839496", brightPurple: "#6c71c4", brightCyan: "#93a1a1", brightWhite: "#fdf6e3" },
  { id: "solarized-light", name: "Solarized Light",
    background: "#fdf6e3", foreground: "#657b83", cursorColor: "#657b83", selectionBackground: "#eee8d5",
    black: "#073642", red: "#dc322f", green: "#859900", yellow: "#b58900", blue: "#268bd2", purple: "#d33682", cyan: "#2aa198", white: "#bbb5a2",
    brightBlack: "#002b36", brightRed: "#cb4b16", brightGreen: "#586e75", brightYellow: "#657b83", brightBlue: "#839496", brightPurple: "#6c71c4", brightCyan: "#93a1a1", brightWhite: "#fdf6e3" },
  { id: "gruvbox-dark", name: "Gruvbox Dark",
    background: "#282828", foreground: "#ebdbb2", cursorColor: "#ebdbb2", selectionBackground: "#665c54",
    black: "#282828", red: "#cc241d", green: "#98971a", yellow: "#d79921", blue: "#458588", purple: "#b16286", cyan: "#689d6a", white: "#a89984",
    brightBlack: "#928374", brightRed: "#fb4934", brightGreen: "#b8bb26", brightYellow: "#fabd2f", brightBlue: "#83a598", brightPurple: "#d3869b", brightCyan: "#8ec07c", brightWhite: "#ebdbb2" },
  { id: "gruvbox-light", name: "Gruvbox Light",
    background: "#fbf1c7", foreground: "#3c3836", cursorColor: "#3c3836", selectionBackground: "#3c3836",
    black: "#fbf1c7", red: "#cc241d", green: "#98971a", yellow: "#d79921", blue: "#458588", purple: "#b16286", cyan: "#689d6a", white: "#7c6f64",
    brightBlack: "#928374", brightRed: "#9d0006", brightGreen: "#79740e", brightYellow: "#b57614", brightBlue: "#076678", brightPurple: "#8f3f71", brightCyan: "#427b58", brightWhite: "#3c3836" },
  { id: "catppuccin-mocha", name: "Catppuccin Mocha",
    background: "#1e1e2e", foreground: "#cdd6f4", cursorColor: "#f5e0dc", selectionBackground: "#f5e0dc",
    black: "#45475a", red: "#f38ba8", green: "#a6e3a1", yellow: "#f9e2af", blue: "#89b4fa", purple: "#f5c2e7", cyan: "#94e2d5", white: "#bac2de",
    brightBlack: "#585b70", brightRed: "#f7aec2", brightGreen: "#c2ecbf", brightYellow: "#fcd682", brightBlue: "#aeccfc", brightPurple: "#f398da", brightCyan: "#b1eae1", brightWhite: "#a6adc8" },
  { id: "catppuccin-latte", name: "Catppuccin Latte",
    background: "#eff1f5", foreground: "#4c4f69", cursorColor: "#dc8a78", selectionBackground: "#dc8a78",
    black: "#bcc0cc", red: "#d20f39", green: "#40a02b", yellow: "#df8e1d", blue: "#1e66f5", purple: "#ea76cb", cyan: "#179299", white: "#5c5f77",
    brightBlack: "#acb0be", brightRed: "#e7103f", brightGreen: "#46b02f", brightYellow: "#e49931", brightBlue: "#3878f6", brightPurple: "#ef95d7", brightCyan: "#19a1a8", brightWhite: "#6c6f85" },
  { id: "github-dark", name: "GitHub Dark",
    background: "#0d1117", foreground: "#e6edf3", cursorColor: "#2f81f7", selectionBackground: "#e6edf3",
    black: "#484f58", red: "#ff7b72", green: "#3fb950", yellow: "#d29922", blue: "#58a6ff", purple: "#bc8cff", cyan: "#39c5cf", white: "#b1bac4",
    brightBlack: "#6e7681", brightRed: "#ffa198", brightGreen: "#56d364", brightYellow: "#e3b341", brightBlue: "#79c0ff", brightPurple: "#d2a8ff", brightCyan: "#56d4dd", brightWhite: "#ffffff" },
  { id: "github-light", name: "GitHub Light",
    background: "#ffffff", foreground: "#1f2328", cursorColor: "#0969da", selectionBackground: "#1f2328",
    black: "#24292f", red: "#cf222e", green: "#116329", yellow: "#4d2d00", blue: "#0969da", purple: "#8250df", cyan: "#1b7c83", white: "#6e7781",
    brightBlack: "#57606a", brightRed: "#a40e26", brightGreen: "#1a7f37", brightYellow: "#633c01", brightBlue: "#218bff", brightPurple: "#a475f9", brightCyan: "#3192aa", brightWhite: "#8c959f" },
  { id: "rose-pine", name: "Rosé Pine",
    background: "#191724", foreground: "#e0def4", cursorColor: "#e0def4", selectionBackground: "#403d52",
    black: "#26233a", red: "#eb6f92", green: "#31748f", yellow: "#f6c177", blue: "#9ccfd8", purple: "#c4a7e7", cyan: "#ebbcba", white: "#e0def4",
    brightBlack: "#6e6a86", brightRed: "#eb6f92", brightGreen: "#31748f", brightYellow: "#f6c177", brightBlue: "#9ccfd8", brightPurple: "#c4a7e7", brightCyan: "#ebbcba", brightWhite: "#e0def4" },
  { id: "rose-pine-dawn", name: "Rosé Pine Dawn",
    background: "#faf4ed", foreground: "#575279", cursorColor: "#575279", selectionBackground: "#dfdad9",
    black: "#f2e9e1", red: "#b4637a", green: "#286983", yellow: "#ea9d34", blue: "#56949f", purple: "#907aa9", cyan: "#d7827e", white: "#575279",
    brightBlack: "#9893a5", brightRed: "#b4637a", brightGreen: "#286983", brightYellow: "#ea9d34", brightBlue: "#56949f", brightPurple: "#907aa9", brightCyan: "#d7827e", brightWhite: "#575279" },
  { id: "kanagawa-wave", name: "Kanagawa Wave",
    background: "#1f1f28", foreground: "#dcd7ba", cursorColor: "#dcd7ba", selectionBackground: "#dcd7ba",
    black: "#090618", red: "#c34043", green: "#76946a", yellow: "#c0a36e", blue: "#7e9cd8", purple: "#957fb8", cyan: "#6a9589", white: "#c8c093",
    brightBlack: "#727169", brightRed: "#e82424", brightGreen: "#98bb6c", brightYellow: "#e6c384", brightBlue: "#7fb4ca", brightPurple: "#938aa9", brightCyan: "#7aa89f", brightWhite: "#dcd7ba" },
  { id: "everforest-dark", name: "Everforest Dark",
    background: "#232a2e", foreground: "#d3c6aa", cursorColor: "#e69875", selectionBackground: "#543a48",
    black: "#7a8478", red: "#e67e80", green: "#a7c080", yellow: "#dbbc7f", blue: "#7fbbb3", purple: "#d699b6", cyan: "#83c092", white: "#f2efdf",
    brightBlack: "#a6b0a0", brightRed: "#f85552", brightGreen: "#8da101", brightYellow: "#dfa000", brightBlue: "#3a94c5", brightPurple: "#df69ba", brightCyan: "#35a77c", brightWhite: "#fffbef" },
  { id: "monokai-pro", name: "Monokai Pro",
    background: "#2d2a2e", foreground: "#fcfcfa", cursorColor: "#c1c0c0", selectionBackground: "#5b595c",
    black: "#2d2a2e", red: "#ff6188", green: "#a9dc76", yellow: "#ffd866", blue: "#fc9867", purple: "#ab9df2", cyan: "#78dce8", white: "#fcfcfa",
    brightBlack: "#727072", brightRed: "#ff6188", brightGreen: "#a9dc76", brightYellow: "#ffd866", brightBlue: "#fc9867", brightPurple: "#ab9df2", brightCyan: "#78dce8", brightWhite: "#fcfcfa" },
  CAMPBELL,
];

// ---------------------------------------------------------------------------
// colour helpers

export function normalizeHex(v) {
  if (typeof v !== "string") return null;
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(v.trim().toLowerCase());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map(c => c + c).join("");
  return "#" + h.slice(0, 6); // drop alpha — Windows Terminal ignores it too
}

// WCAG relative luminance, 0 (black) … 1 (white)
export function luminance(hex) {
  const h = normalizeHex(hex).slice(1);
  const [r, g, b] = [0, 2, 4]
    .map(i => parseInt(h.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function isDarkTheme(theme) {
  return luminance(theme.background) < 0.4;
}

// ---------------------------------------------------------------------------
// parsing / validation of user-supplied schemes

// Accepts a Windows Terminal scheme object or its JSON text. Returns
// { theme } on success, or { error } with a message fit for the UI.
export function parseScheme(input, { id, name } = {}) {
  let obj = input;
  if (typeof input === "string") {
    try { obj = JSON.parse(input); }
    catch (e) { return { error: "JSON 语法错误：" + (e.message || e) }; }
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return { error: "需要一个 JSON 对象" };
  // tolerate pasting a whole Windows Terminal settings.json
  if (Array.isArray(obj.schemes) && obj.schemes.length > 0) obj = obj.schemes[0];

  const theme = {};
  const missing = [], bad = [];
  for (const k of REQUIRED_KEYS) {
    if (obj[k] == null || obj[k] === "") { missing.push(k); continue; }
    const c = normalizeHex(obj[k]);
    if (c) theme[k] = c; else bad.push(k);
  }
  if (missing.length) return { error: "缺少字段：" + missing.join(", ") };
  if (bad.length) return { error: "颜色格式无效（需要 #rrggbb）：" + bad.join(", ") };

  for (const k of ["cursorColor", "selectionBackground"]) {
    if (obj[k] == null || obj[k] === "") continue;
    const c = normalizeHex(obj[k]);
    if (!c) return { error: `颜色格式无效（需要 #rrggbb）：${k}` };
    theme[k] = c;
  }
  if (obj.accent != null && obj.accent !== "") {
    if (ANSI_KEYS.includes(obj.accent)) theme.accent = obj.accent;
    else if (normalizeHex(obj.accent)) theme.accent = normalizeHex(obj.accent);
    else return { error: "accent 需要是 16 色之一的名字（如 green、brightBlue）或 #rrggbb" };
  }

  const finalName = String(name ?? obj.name ?? "").trim();
  if (!finalName) return { error: "需要一个主题名称（name）" };
  theme.name = finalName;
  theme.id = id || "custom-" + Date.now().toString(36);
  return { theme };
}

// Serialise a theme back to plain Windows Terminal scheme JSON so it can be
// edited or shared. Tunelo-only extras (id, tokens) are dropped.
export function schemeToJson(theme) {
  const out = {};
  for (const k of SCHEME_KEYS) if (theme[k] != null) out[k] = theme[k];
  if (theme.accent) out.accent = theme.accent;
  return JSON.stringify(out, null, 2);
}

// ---------------------------------------------------------------------------
// theme → CSS custom properties

export function accentOf(theme) {
  const a = theme.accent;
  if (!a) return theme.green;
  return ANSI_KEYS.includes(a) ? theme[a] : a;
}

export function themeToVars(theme) {
  const bg = theme.background, fg = theme.foreground;
  const accent = accentOf(theme);
  const dark = isDarkTheme(theme);
  const mix = (a, pct, b) => `color-mix(in srgb, ${a} ${pct}%, ${b})`;
  // panel/border tints step from bg toward fg; light themes need a bigger
  // step for panels to still separate on near-white backgrounds
  const step = dark ? 1 : 1.25;
  return {
    "--bg": bg,
    "--bg-1": mix(bg, 100 - 3.5 * step, fg),
    "--bg-2": mix(bg, 100 - 6.5 * step, fg),
    "--bg-3": mix(bg, 100 - 9.5 * step, fg),
    "--border": mix(bg, 100 - 11 * step, fg),
    "--border-2": mix(bg, 100 - 16 * step, fg),
    "--fg": fg,
    "--fg-1": mix(fg, 86, bg),
    "--fg-2": mix(fg, 64, bg),
    "--fg-3": mix(fg, 42, bg),
    "--accent": accent,
    "--accent-soft": mix(accent, 12, "transparent"),
    "--accent-line": mix(accent, 32, "transparent"),
    "--on-accent": luminance(accent) > 0.36 ? "#0a0b0d" : "#ffffff",
    "--ok": theme.green,
    "--warn": theme.yellow,
    "--fail": theme.red,
    "--info": theme.blue,
    "--purple": theme.purple,
    "--neutral": theme.brightBlack,
    ...(theme.tokens || {}),
  };
}

// ids written by builds before themes existed
const LEGACY_IDS = { dark: "tunelo-dark", light: "tunelo-light" };

export function resolveTheme(id, customThemes = []) {
  const want = LEGACY_IDS[id] || id;
  return customThemes.find(t => t.id === want)
    || BUILTIN_THEMES.find(t => t.id === want)
    || BUILTIN_THEMES[0];
}

export const SPLASH_KEY = "tunelo.splash";

// Writes the theme onto <html> so portalled dialogs (Modal / Drawer /
// Confirm render into document.body) pick it up too.
export function applyTheme(theme) {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(themeToVars(theme))) root.style.setProperty(k, v);
  root.dataset.theme = isDarkTheme(theme) ? "dark" : "light";
  // index.html reads this before React mounts to paint the boot splash
  try {
    localStorage.setItem(SPLASH_KEY, JSON.stringify({ bg: theme.background, fg: theme.foreground, accent: accentOf(theme) }));
  } catch {}
}
