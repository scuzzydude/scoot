import { createContext, useContext, useState, type ReactNode, createElement } from "react";

export type LayoutMode = "mobile" | "desktop";

const STORAGE_KEY = "scoot:layoutMode";

interface LayoutModeContextValue {
  mode: LayoutMode;
  setMode: (m: LayoutMode) => void;
  toggle: () => void;
}

const LayoutModeContext = createContext<LayoutModeContextValue>({
  mode: "mobile",
  setMode: () => {},
  toggle: () => {},
});

function initialMode(): LayoutMode {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "mobile" || stored === "desktop") return stored;
  // No explicit preference yet -- one-time default based on viewport width.
  // The toggle always wins after this; it's not a live-resizing breakpoint.
  return window.matchMedia("(min-width: 1024px)").matches ? "desktop" : "mobile";
}

export function LayoutModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<LayoutMode>(initialMode);

  const setMode = (m: LayoutMode) => {
    setModeState(m);
    localStorage.setItem(STORAGE_KEY, m);
  };
  const toggle = () => setMode(mode === "desktop" ? "mobile" : "desktop");

  return createElement(LayoutModeContext.Provider, { value: { mode, setMode, toggle } }, children);
}

export function useLayoutMode() {
  return useContext(LayoutModeContext);
}
