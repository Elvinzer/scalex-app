"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { MonthlyMetricsInput } from "@/lib/monthly-metrics/types";

import { CheckinModal } from "./checkin-modal";

// Trigger + modal for the Dashboard's weekly check-in banner. Also honors
// ?checkin=1 (the Monday email's CTA deep link, via /api/weekly-email-click)
// to auto-open the modal on load.
export function CheckinTrigger({
  year,
  month,
  initialData,
  settingSourced,
  closingSourced,
}: {
  year: number;
  month: number;
  initialData: MonthlyMetricsInput;
  settingSourced: boolean;
  closingSourced: boolean;
}) {
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(() => searchParams.get("checkin") === "1");

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Faire mon check-in
      </Button>
      <CheckinModal
        open={open}
        onClose={() => setOpen(false)}
        year={year}
        month={month}
        initialData={initialData}
        settingSourced={settingSourced}
        closingSourced={closingSourced}
      />
    </>
  );
}
