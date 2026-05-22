import { useState, useEffect, useCallback } from "react";

export interface Toast {
  id: string;
  title?: string;
  description?: string;
  variant?: "default" | "destructive";
}

let _toasts: Toast[] = [];
let _listeners: Array<() => void> = [];

function notify() {
  _listeners.forEach((l) => l());
}

export function toast(t: Omit<Toast, "id">) {
  const id = Math.random().toString(36).slice(2);
  _toasts = [..._toasts, { ...t, id }];
  notify();
  setTimeout(() => {
    _toasts = _toasts.filter((x) => x.id !== id);
    notify();
  }, 5000);
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>(_toasts);

  useEffect(() => {
    const sync = () => setToasts([..._toasts]);
    _listeners.push(sync);
    return () => {
      _listeners = _listeners.filter((l) => l !== sync);
    };
  }, []);

  const dismiss = useCallback((id: string) => {
    _toasts = _toasts.filter((t) => t.id !== id);
    notify();
  }, []);

  return { toasts, dismiss, toast };
}
