import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeResources } from '../api/live';

export interface ApiQueryResult<T> {
  data: T | undefined;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Sunucu verisini çeker ve ilgili kaynaklarda değişiklik olduğunda otomatik yeniler.
 * `useLiveQuery` yerine kullanılır: veri hazır olana kadar `undefined` döner.
 */
export function useApiQueryFull<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = [],
  resources?: string[]
): ApiQueryResult<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [version, setVersion] = useState(0);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const resourcesKey = resources ? resources.join('|') : '';
  const resourcesRef = useRef<string[] | undefined>(resources);
  resourcesRef.current = resources;
  void resourcesKey;

  const refetch = useCallback(() => setVersion((v) => v + 1), []);

  const depsKey = JSON.stringify(deps ?? []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetcherRef
      .current()
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [depsKey, version]);

  useEffect(() => {
    return subscribeResources(resourcesRef.current, refetch);
  }, [resourcesKey, refetch]);

  return { data, loading, error, refetch };
}

/**
 * Kısa yol: yalnızca veriyi döner (yüklenirken `undefined`).
 * Depoya bağımlı hesaplamalar `useMemo` içine alınmalıdır; `undefined` dönebilir.
 */
export function useApiQuery<T>(fetcher: () => Promise<T>, deps: unknown[] = [], resources?: string[]): T | undefined {
  return useApiQueryFull<T>(fetcher, deps, resources).data;
}

/** Tüm kaynakları dinleyip periyodik yenileyen yardımcı (panolar için). */
export function useApiQueryRefresh(intervalMs: number): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (intervalMs <= 0) return;
    const id = window.setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return tick;
}
