import { act, renderHook } from '@testing-library/react-native';

import { UNDO_SEND_SECONDS, useUndoSend } from '@/state/use-undo-send';

describe('useUndoSend', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('sends after the delay', () => {
    const send = jest.fn();
    const { result } = renderHook(() => useUndoSend());
    act(() => result.current.schedule(send, jest.fn()));
    expect(result.current.pending?.secondsLeft).toBe(UNDO_SEND_SECONDS);
    act(() => jest.advanceTimersByTime(UNDO_SEND_SECONDS * 1000));
    expect(send).toHaveBeenCalledTimes(1);
    expect(result.current.pending).toBeNull();
  });

  it('cancels and restores the draft', () => {
    const send = jest.fn();
    const restore = jest.fn();
    const { result } = renderHook(() => useUndoSend());
    act(() => result.current.schedule(send, restore));
    act(() => jest.advanceTimersByTime(2000));
    act(() => result.current.cancel());
    act(() => jest.advanceTimersByTime(10_000));
    expect(send).not.toHaveBeenCalled();
    expect(restore).toHaveBeenCalledTimes(1);
  });

  it('flushes immediately when leaving the screen', () => {
    const send = jest.fn();
    const { result } = renderHook(() => useUndoSend());
    act(() => result.current.schedule(send, jest.fn()));
    act(() => result.current.flush());
    expect(send).toHaveBeenCalledTimes(1);
  });
});
