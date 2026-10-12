/**
 * Minimal external store used for application state.
 *
 * The plan asks for an explicit state layer that separates synced data, cache
 * and UI state, without pulling a heavy state library. This is a ~40 line
 * `useSyncExternalStore` store; repositories remain the source of truth for
 * persisted data, the store holds the in-memory view the UI renders.
 */

import { useRef, useSyncExternalStore } from 'react';

export interface Store<T> {
  getState(): T;
  setState(updater: T | ((previous: T) => T)): void;
  subscribe(listener: () => void): () => void;
}

export function createStore<T>(initialState: T): Store<T> {
  let state = initialState;
  const listeners = new Set<() => void>();

  return {
    getState: () => state,
    setState(updater) {
      const next = typeof updater === 'function' ? (updater as (previous: T) => T)(state) : updater;
      if (Object.is(next, state)) {
        return;
      }
      state = next;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/**
 * Select a slice of store state. `isEqual` lets callers pass a structural
 * comparison so derived objects (arrays, summaries) do not loop infinitely.
 */
export function useSelector<T, S>(
  store: Store<T>,
  selector: (state: T) => S,
  isEqual: (a: S, b: S) => boolean = Object.is,
): S {
  const cache = useRef<{ state: T; selected: S } | null>(null);

  const getSnapshot = (): S => {
    const state = store.getState();
    if (cache.current === null || !Object.is(cache.current.state, state)) {
      const selected = selector(state);
      if (cache.current === null || !isEqual(cache.current.selected, selected)) {
        cache.current = { state, selected };
      } else {
        cache.current = { state, selected: cache.current.selected };
      }
    }
    return cache.current.selected;
  };

  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}
