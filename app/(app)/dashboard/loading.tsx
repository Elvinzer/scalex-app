import { DashboardLossHeroSkeleton } from "./dashboard-loss-hero";

export default function DashboardLoading() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="h-7 w-48 max-w-full rounded-md bg-muted" />
          <div className="h-4 w-72 max-w-full rounded-md bg-muted" />
        </div>
        <div className="h-9 w-32 shrink-0 rounded-md bg-muted max-sm:hidden" />
      </div>
      <div className="sticker-card h-24" />
      <DashboardLossHeroSkeleton />
      <div className="py-4">
        <div className="h-5 w-36 rounded-md bg-muted" />
        <div className="mt-2 h-4 w-60 rounded-md bg-muted" />
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="sticker-card h-40 animate-pulse p-4 motion-reduce:animate-none">
              <div className="h-3 w-24 rounded bg-muted" />
              <div className="mt-3 h-6 w-20 rounded bg-muted" />
              <div className="mt-2 h-3 w-36 max-w-full rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
      <div className="sticker-card h-56" />
    </div>
  );
}
