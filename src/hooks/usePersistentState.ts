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
  const [storageError,setStorageError]=useState<string|null>(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    setIsSaving(true);
    try {
      const now = new Date().toISOString();
      window.localStorage.setItem(key, JSON.stringify({_schemaVersion:version,data:state,updatedAt:now}));
      setLastSaved(now);setStorageError(null);
    } catch {setStorageError('Speichern im Browser fehlgeschlagen. Bitte Spielplan und Ergebnisse herunterladen.');}
    finally {setIsSaving(false);}
  }, [key, state, version]);

  const reset = () => {
    window.localStorage.removeItem(key);
    setState(initialState);
    return true;
  };

  return [state, setState, reset, isSaving, lastSaved, storageError] as const;
}
