/**
 * "Annuler l'envoi": the send runs after a short delay, during which the user
 * can take the message back (Gmail-style).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export const UNDO_SEND_SECONDS = 5;

export interface PendingSend {
  /** Seconds left before the message actually leaves. */
  secondsLeft: number;
}

export function useUndoSend() {
  const [pending, setPending] = useState<PendingSend | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const job = useRef<(() => void) | null>(null);
  const cancelJob = useRef<(() => void) | null>(null);

  const clear = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    job.current = null;
    cancelJob.current = null;
    setPending(null);
  }, []);

  useEffect(() => clear, [clear]);

  /** Runs `send` after the delay unless `cancel()` is called; `onCancel` restores the draft. */
  const schedule = useCallback(
    (send: () => void, onCancel: () => void) => {
      clear();
      job.current = send;
      cancelJob.current = onCancel;
      let left = UNDO_SEND_SECONDS;
      setPending({ secondsLeft: left });
      timer.current = setInterval(() => {
        left -= 1;
        if (left <= 0) {
          const run = job.current;
          clear();
          run?.();
        } else {
          setPending({ secondsLeft: left });
        }
      }, 1000);
    },
    [clear],
  );

  const cancel = useCallback(() => {
    const restore = cancelJob.current;
    clear();
    restore?.();
  }, [clear]);

  /** Sends right away (e.g. when leaving the screen). */
  const flush = useCallback(() => {
    const run = job.current;
    clear();
    run?.();
  }, [clear]);

  return { pending, schedule, cancel, flush };
}
