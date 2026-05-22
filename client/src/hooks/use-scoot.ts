import { createContext, useContext, useState, useEffect, type ReactNode, createElement } from "react";
import { useQuery } from "@tanstack/react-query";
import { scootsApi, type ScootConfig } from "../api/scoots.js";
import { useAuth } from "./use-auth.js";

const STORAGE_KEY = "activeScootId";

interface ScootContextValue {
  activeScoot: ScootConfig | null;
  allScoots: ScootConfig[];
  setActiveScoot: (id: number) => void;
  label: (key: string) => string;
  isLoading: boolean;
}

const ScootContext = createContext<ScootContextValue>({
  activeScoot: null,
  allScoots: [],
  setActiveScoot: () => {},
  label: (k) => k,
  isLoading: false,
});

export function ScootProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [activeScootId, setActiveScootId] = useState<number | null>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? parseInt(stored, 10) : null;
  });

  const { data: allScoots = [], isLoading } = useQuery({
    queryKey: ["scoots"],
    queryFn: scootsApi.list,
    enabled: !!user,
  });

  // Auto-select first Scoot when list loads and no stored preference
  useEffect(() => {
    if (!allScoots.length) return;
    if (activeScootId && allScoots.some((s) => s.id === activeScootId)) return;
    setActiveScootId(allScoots[0].id);
  }, [allScoots, activeScootId]);

  const setActiveScoot = (id: number) => {
    setActiveScootId(id);
    localStorage.setItem(STORAGE_KEY, String(id));
  };

  const activeScoot = allScoots.find((s) => s.id === activeScootId) ?? null;

  const label = (key: string): string => {
    if (!activeScoot) return key;
    return (activeScoot.labelMap[key] as string | undefined) ?? key;
  };

  return createElement(ScootContext.Provider, { value: { activeScoot, allScoots, setActiveScoot, label, isLoading } }, children);
}

export function useScoot() {
  return useContext(ScootContext);
}
