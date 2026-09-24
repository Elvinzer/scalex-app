"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { trackClient } from "@/lib/analytics-client";

export function EarlyAccessCta({ location }: { location: string }) {
  const t = useTranslations("earlyAccess");

  return (
    <Button asChild size="lg" className="rounded-[12px] px-7 py-6 text-[15px]">
      <Link href="#early-access-form" onClick={() => trackClient("early_access_cta_click", { location })}>
        {t("final.cta")}
      </Link>
    </Button>
  );
}
