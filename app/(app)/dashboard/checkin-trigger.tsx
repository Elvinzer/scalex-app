"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { MonthlyMetricsInput } from "@/lib/monthly-metrics/types";
import type { AcquisitionFunnelStep } from "@/lib/acquisition-funnels/types";

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
  activeMetricFields,
}: {
  year: number;
  month: number;
  initialData: MonthlyMetricsInput;
  settingSourced: boolean;
  closingSourced: boolean;
  activeMetricFields: AcquisitionFunnelStep[];
}) {
  const t = useTranslations("dashboard");
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(() => searchParams.get("checkin") === "1");

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        {t("doCheckin")}
      </Button>
      <CheckinModal
        open={open}
        onClose={() => setOpen(false)}
        year={year}
        month={month}
        initialData={initialData}
        settingSourced={settingSourced}
        closingSourced={closingSourced}
        activeMetricFields={activeMetricFields}
      />
    </>
  );
}
