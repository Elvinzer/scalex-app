// Next.js shows this instantly on every navigation under (app) while the
// target page's Server Component data fetch is still in flight — without
// it (none existed anywhere in this app before), the browser just freezes
// the old page until the new one fully resolves, which is what read as
// "slow" even once the underlying queries were fast. The sidebar/floating
// chat bubble live outside {children} in the layout, so they stay
// interactive; only this content area shows the placeholder.
export default function AppLoading() {
  return (
    <div className="flex animate-pulse flex-col gap-8">
      <div>
        <div className="h-7 w-48 rounded-md bg-muted" />
        <div className="mt-2 h-4 w-72 rounded-md bg-muted" />
      </div>

      <div className="sticker-spotlight h-40 w-full bg-surface-dark/60" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="sticker-card h-28 bg-card" />
        ))}
      </div>
    </div>
  );
}
