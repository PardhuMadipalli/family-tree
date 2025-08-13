// a zustand store for the theme light or dark
import { create } from "zustand";

type Theme = "light" | "dark";

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

function getInitialTheme(): 'light' | 'dark' {
  if (typeof window !== 'undefined') {
    const stored = window.localStorage.getItem('theme');
    if (stored === 'dark' || stored === 'light') return stored;
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
  }
  return 'light';
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: getInitialTheme(),
  setTheme: (theme: Theme) => {
    set({ theme });
    if (typeof window !== "undefined") {
      window.localStorage.setItem("theme", theme);
    }
  },
  toggleTheme: () => {
    const current = get().theme;
    const next = current === "dark" ? "light" : "dark";
    set({ theme: next });
    if (typeof window !== "undefined") {
      window.localStorage.setItem("theme", next);
    }
  },
}));
