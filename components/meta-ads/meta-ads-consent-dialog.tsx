"use client";

import { Check, ExternalLink, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type ConsentMode = "read" | "write";

type Props = {
  mode: ConsentMode;
  href: string;
  accountLabel?: string | null;
  triggerLabel: string;
  triggerVariant?: React.ComponentProps<typeof Button>["variant"];
  triggerClassName?: string;
};

function messageList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function MetaAdsConsentDialog({
  mode,
  href,
  accountLabel,
  triggerLabel,
  triggerVariant = "default",
  triggerClassName,
}: Props) {
  const t = useTranslations("app.ads.consent");
  const isRead = mode === "read";
  const readData = messageList(t.raw("readData"));
  const writeData = messageList(t.raw("writeData"));
  const [isRedirecting, setIsRedirecting] = useState(false);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant={triggerVariant} className={triggerClassName}>
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogTitle>{isRead ? t("readTitle") : t("writeTitle")}</DialogTitle>

        <div className="mt-4 flex flex-col gap-4">
          <div className="flex items-start gap-3 rounded-[var(--radius-control)] border border-accent-2/30 bg-accent-2/5 px-3 py-3 text-sm">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-accent-2" />
            <p>
              {isRead
                ? t("readIntro")
                : t("writeIntro")}
            </p>
          </div>

          {accountLabel && (
            <p className="text-sm text-muted-foreground">
              {t("account")} <span className="font-bold text-foreground">{accountLabel}</span>
            </p>
          )}

          {isRead ? (
            <div>
              <p className="text-sm font-bold">{t("readHeading")}</p>
              <ul className="mt-2 flex flex-col gap-2">
                {readData.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <Check className="mt-0.5 size-4 shrink-0 text-state-healthy" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div>
              <p className="text-sm font-bold">{t("writeHeading")}</p>
              <ul className="mt-2 flex flex-col gap-2">
                {writeData.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <Check className="mt-0.5 size-4 shrink-0 text-state-healthy" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="rounded-[var(--radius-control)] border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
            {isRead
              ? t("readSecurity")
              : t("writeSecurity")}
          </p>

          <div className="flex flex-wrap justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t("cancel")}
              </Button>
            </DialogClose>
            <Button asChild variant={isRead ? "default" : "accent2"}>
              <a
                href={href}
                aria-disabled={isRedirecting}
                aria-busy={isRedirecting}
                onClick={() => setIsRedirecting(true)}
                className={isRedirecting ? "pointer-events-none opacity-70" : undefined}
              >
                {isRedirecting ? t("redirecting") : isRead ? t("continue") : t("authorizeResume")}
                <ExternalLink className="size-4" />
              </a>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
