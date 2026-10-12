/**
 * Load data from `MailService` and reload it whenever the app revision changes
 * (after a sync, a send, an archive…). A thin, dependency-free alternative to a
 * data-fetching library, sufficient for the MVP screens.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type { MailService } from '@/services/mail-service';
import { useApp } from '@/state/app-context';

export interface ServiceQueryResult<T> {
  data: T;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export function useServiceQuery<T>(
  load: (service: MailService) => Promise<T>,
  initial: T,
): ServiceQueryResult<T> {
  const { service, revision } = useApp();
  const [state, setState] = useState<{ data: T; loading: boolean; error: string | null }>({
    data: initial,
    loading: true,
    error: null,
  });

  // Keep the latest loader without re-running the effect on every render.
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  const run = useCallback(async () => {
    setState((previous) => ({ ...previous, loading: true }));
    try {
      const data = await loadRef.current(service);
      setState({ data, loading: false, error: null });
    } catch (cause: unknown) {
      setState((previous) => ({
        ...previous,
        loading: false,
        error: cause instanceof Error ? cause.message : String(cause),
      }));
    }
  }, [service]);

  useEffect(() => {
    void run();
  }, [run, revision]);

  return { ...state, reload: run };
}
