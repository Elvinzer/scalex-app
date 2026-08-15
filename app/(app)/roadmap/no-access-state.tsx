"use client";

import { ShieldOff } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export function NoAccessState() {
  const t = useTranslations("roadmap");

  return (
    <section className="flex min-h-[calc(100vh-8rem)] items-center justify-center py-10" aria-labelledby="roadmap-no-access-title">
      <div className="sticker-card w-full max-w-xl p-6 sm:p-8" role="status" aria-live="polite">
        <div className="flex size-12 items-center justify-center rounded-full bg-accent-2-soft text-accent-2-text">
          <ShieldOff className="size-6" aria-hidden="true" />
        </div>
        <p className="mt-5 text-xs font-bold tracking-[0.12em] text-accent-text uppercase">{t("noAccess.eyebrow")}</p>
        <h1 id="roadmap-no-access-title" className="mt-2 text-2xl font-bold tracking-[-0.02em] sm:text-3xl">
          {t("noAccess.title")}
        </h1>
        <p className="mt-3 max-w-lg text-sm leading-6 text-muted-foreground">{t("noAccess.description")}</p>
        <Button asChild variant="outline" className="mt-6 min-h-11">
          <Link href="/support">{t("noAccess.support")}</Link>
        </Button>
      </div>
    </section>
  );
}
