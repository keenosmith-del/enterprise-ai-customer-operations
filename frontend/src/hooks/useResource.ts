import { useEffect, useState, useCallback } from "react";
import { api } from "../api/client";
export function useResource<T>(path: string, interval = 0) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((n) => n + 1), []);
  useEffect(() => {
    let live = true,
      running = false;
    setLoading(true);
    setData(null);
    setError("");
    const load = async () => {
      if (running) return;
      running = true;
      try {
        const value = await api<T>(path);
        if (live) {
          setData(value);
          setError("");
        }
      } catch (e) {
        if (live) setError((e as Error).message);
      } finally {
        running = false;
        if (live) setLoading(false);
      }
    };
    void load();
    const timer = interval ? setInterval(() => void load(), interval) : null;
    return () => {
      live = false;
      if (timer) clearInterval(timer);
    };
  }, [path, interval, revision]);
  return { data, error, loading, refresh };
}
