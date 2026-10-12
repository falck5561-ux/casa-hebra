import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";

export const THEME_STORAGE_KEY = "casa-hebra:theme";

const THEME_COLORS = {
  light: "#FBF8F3",
  dark: "#131210",
};

const ThemeContext = createContext(null);
const useSafeLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function normalizeHex(value, fallback = "#963D64") {
  return /^#[\da-f]{6}$/i.test(String(value || ""))
    ? String(value).toUpperCase()
    : fallback;
}

function relativeLuminance(hex) {
  const channels = [1, 3, 5].map((offset) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrastRatio(first, second) {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function mixHex(first, second, amount) {
  const channel = (offset) => Math.round(
    Number.parseInt(first.slice(offset, offset + 2), 16) * (1 - amount)
      + Number.parseInt(second.slice(offset, offset + 2), 16) * amount,
  ).toString(16).padStart(2, "0");

  return `#${channel(1)}${channel(3)}${channel(5)}`.toUpperCase();
}

export function createAccessibleAccentPalette(value, theme = "light") {
  const source = normalizeHex(value);
  const isDark = theme === "dark";
  const backgrounds = isDark
    ? ["#131210", "#1E1D1A", "#25231F", "#2C2925"]
    : ["#FBF8F3", "#FFFDF9", "#FFFFFF", "#F4EDE6", "#EEE6DE"];
  const mixingTarget = isDark ? "#FFFFFF" : "#000000";
  const onAccent = isDark ? "#191918" : "#FFFFFF";
  let accent = source;

  for (let step = 0; step <= 100; step += 1) {
    const candidate = mixHex(source, mixingTarget, step / 100);
    if (
      backgrounds.every((background) => contrastRatio(candidate, background) >= 4.75)
      && contrastRatio(candidate, onAccent) >= 4.75
    ) {
      accent = candidate;
      break;
    }
  }

  return {
    accent,
    accentSurface: accent,
    accentText: accent,
    adjusted: accent !== source,
    onAccent,
    source,
  };
}

function isTheme(value) {
  return value === "light" || value === "dark";
}

function storedTheme() {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(value) ? value : null;
  } catch {
    return null;
  }
}

function systemTheme() {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function initialPreference() {
  if (typeof window === "undefined") return "system";
  return storedTheme() || "system";
}

function initialSystemTheme() {
  if (typeof window === "undefined") return "light";
  return systemTheme();
}

function applyTheme(theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;

  const themeColor = document.querySelector('meta[name="theme-color"]');
  themeColor?.setAttribute("content", THEME_COLORS[theme]);
}

export function ThemeProvider({ children }) {
  const [preference, setPreference] = useState(initialPreference);
  const [preferredSystemTheme, setPreferredSystemTheme] = useState(initialSystemTheme);
  const theme = preference === "system" ? preferredSystemTheme : preference;

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!media) return undefined;

    const updateSystemTheme = (event) => {
      setPreferredSystemTheme(event.matches ? "dark" : "light");
    };

    setPreferredSystemTheme(media.matches ? "dark" : "light");
    if (media.addEventListener) {
      media.addEventListener("change", updateSystemTheme);
      return () => media.removeEventListener("change", updateSystemTheme);
    }

    media.addListener?.(updateSystemTheme);
    return () => media.removeListener?.(updateSystemTheme);
  }, []);

  useEffect(() => {
    const syncAcrossTabs = (event) => {
      if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
      setPreference(isTheme(event.newValue) ? event.newValue : "system");
    };

    window.addEventListener("storage", syncAcrossTabs);
    return () => window.removeEventListener("storage", syncAcrossTabs);
  }, []);

  useSafeLayoutEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = useCallback((nextTheme) => {
    const nextPreference = nextTheme === "system"
      ? "system"
      : isTheme(nextTheme)
        ? nextTheme
        : "light";

    try {
      if (nextPreference === "system") {
        window.localStorage.removeItem(THEME_STORAGE_KEY);
      } else {
        window.localStorage.setItem(THEME_STORAGE_KEY, nextPreference);
      }
    } catch {
      // The theme still works for this visit if storage is unavailable.
    }

    setPreference(nextPreference);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [setTheme, theme]);

  const value = useMemo(() => ({
    preference,
    theme,
    isDark: theme === "dark",
    setTheme,
    toggleTheme,
  }), [preference, setTheme, theme, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme debe usarse dentro de ThemeProvider.");
  }
  return context;
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20.2 15.3A8.4 8.4 0 0 1 8.7 3.8 8.5 8.5 0 1 0 20.2 15.3Z" />
    </svg>
  );
}

export function ThemeToggle({ className = "", compact = false }) {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      role="switch"
      className={`theme-toggle ${compact ? "is-compact" : ""} ${className}`.trim()}
      onClick={toggleTheme}
      aria-label="Tema oscuro"
      aria-checked={isDark}
      title={isDark ? "Desactivar tema oscuro" : "Activar tema oscuro"}
    >
      <span className="theme-toggle__track" aria-hidden="true">
        <span className="theme-toggle__icon is-sun"><SunIcon /></span>
        <span className="theme-toggle__icon is-moon"><MoonIcon /></span>
        <span className="theme-toggle__thumb" />
      </span>
      <span className="theme-toggle__text">Tema oscuro</span>
    </button>
  );
}
