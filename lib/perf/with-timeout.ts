// Hard client-side ceiling on an awaited promise. Unlike a Postgres
// statement_timeout (which the Supabase transaction pooler does not honor as a
// connection parameter, and which never fires when the hang is BEFORE the
// query — a stalled Data Cache read, an exhausted pool, a promise that never
// settles), this races the work against a timer in Node. A stuck render then
// fails fast with a labelled error instead of holding the Vercel function open
// until its 300s kill and dragging every queued request down with it.
export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`[timeout] ${label} exceeded ${ms}ms`);
    this.name = "TimeoutError";
  }
}

export function withTimeout<T>(task: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
  });
  return Promise.race([task, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}
