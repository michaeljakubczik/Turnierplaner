import { useState, useEffect, useRef } from 'react';

export function usePersistentState<T>(key: string, initialState: T, version: number = 1) {
  const [state, setState] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      if (item) {
        const parsed = JSON.parse(item);
        if (parsed._schemaVersion === version) {
          return parsed.data;
        }
      }
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error);
    }
    return initialState;
  });

  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    setIsSaving(true);
    timeoutRef.current = setTimeout(() => {
      try {
        const now = new Date().toISOString();
        const valueToStore = {
          _schemaVersion: version,
          data: state,
          updatedAt: now,
        };
        window.localStorage.setItem(key, JSON.stringify(valueToStore));
        setLastSaved(now);
      } catch (error) {
        console.error(`Error writing localStorage key "${key}":`, error);
      } finally {
        setIsSaving(false);
      }
    }, 800);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [key, state, version]);

  const reset = () => {
    window.localStorage.removeItem(key);
    setState(initialState);
    return true;
  };

  return [state, setState, reset, isSaving, lastSaved] as const;
}
