"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// The sync job usually finishes in a second or two — this just re-renders
// the Server Component until the diagnostics row shows up, instead of
// leaving a dead page if someone lands here before the job completes.
export function PendingRefresh() {
  const router = useRouter();

  useEffect(() => {
    const timeout = setTimeout(() => router.refresh(), 2000);
    return () => clearTimeout(timeout);
  }, [router]);

  return null;
}
