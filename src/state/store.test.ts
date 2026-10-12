import { renderHook, act } from '@testing-library/react-native';

import { createStore, useSelector } from '@/state/store';

describe('store', () => {
  it('holds and updates state', () => {
    const store = createStore({ count: 0 });
    expect(store.getState().count).toBe(0);
    store.setState({ count: 1 });
    expect(store.getState().count).toBe(1);
    store.setState((previous) => ({ count: previous.count + 1 }));
    expect(store.getState().count).toBe(2);
  });

  it('skips notification when the state is identical', () => {
    const store = createStore({ count: 0 });
    const listener = jest.fn();
    store.subscribe(listener);
    const same = store.getState();
    store.setState(same);
    expect(listener).not.toHaveBeenCalled();
  });

  it('notifies subscribers and supports unsubscribe', () => {
    const store = createStore({ count: 0 });
    const listener = jest.fn();
    const unsubscribe = store.subscribe(listener);
    store.setState({ count: 1 });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    store.setState({ count: 2 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('selects derived state through the hook', () => {
    const store = createStore({ items: [1, 2, 3] });
    const { result } = renderHook(() => useSelector(store, (state) => state.items.length));
    expect(result.current).toBe(3);
    act(() => store.setState({ items: [1] }));
    expect(result.current).toBe(1);
  });

  it('supports a structural equality comparator', () => {
    const store = createStore({ values: [1, 2] });
    const isEqual = (a: number[], b: number[]) =>
      a.length === b.length && a.every((v, i) => v === b[i]);
    const { result } = renderHook(() =>
      useSelector(store, (state) => state.values.filter((v) => v > 0), isEqual),
    );
    expect(result.current).toEqual([1, 2]);
  });
});
