export type ThemeMode = "light" | "dark";
export type TextSize = "sm" | "md" | "lg";

export const LS_THEME = "roam_theme";
export const LS_TEXT = "roam_text_size";

export function getPrefs(): { theme: ThemeMode; textSize: TextSize } {
  const theme = (localStorage.getItem(LS_THEME) as ThemeMode) ?? "light";
  const textSize = (localStorage.getItem(LS_TEXT) as TextSize) ?? "md";
  return { theme, textSize };
}

export function applyTheme(theme: ThemeMode) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
}

export function applyTextSize(textSize: TextSize) {
  // Use root font-size so it affects the entire app (rem-based sizing)
  const root = document.documentElement;
  const px = textSize === "sm" ? 14 : textSize === "lg" ? 18 : 16;
  root.style.fontSize = `${px}px`;
}

export function applyPrefs() {
  const { theme, textSize } = getPrefs();
  applyTheme(theme);
  applyTextSize(textSize);
}

export function savePrefs(next: { theme?: ThemeMode; textSize?: TextSize }) {
  const cur = getPrefs();
  const theme = next.theme ?? cur.theme;
  const textSize = next.textSize ?? cur.textSize;

  localStorage.setItem(LS_THEME, theme);
  localStorage.setItem(LS_TEXT, textSize);

  applyTheme(theme);
  applyTextSize(textSize);
}