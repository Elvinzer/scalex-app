// Schedule the next read only after the previous one settles. Long-running
// synchronizations back off to 30 seconds instead of polling indefinitely
// every two seconds. Returning false marks a terminal state.
export function startPolling(check: () => Promise<boolean>, isPaused: () => boolean): () => void {
  let stopped = false;
  let attempts = 0;
  let timer: ReturnType<typeof setTimeout>;
  const schedule = () => {
    if (!stopped) timer = setTimeout(() => void run(), Math.min(2000 * 2 ** Math.floor(attempts / 3), 30_000));
  };
  const run = async () => {
    if (stopped) return;
    if (isPaused()) {
      schedule();
      return;
    }
    attempts += 1;
    try {
      if (!await check()) stopped = true;
    } catch {
      // Network failures use the same bounded retry schedule.
    } finally {
      schedule();
    }
  };
  schedule();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
