"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

export function CrmCallReference({ reference }: { reference: string }) {
  const t = useTranslations("crm.calls");
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  async function copyReference(): Promise<void> {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(reference);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = reference;
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }
      setCopied(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex min-w-0 items-center gap-1">
      <code className="min-w-0 max-w-44 truncate text-xs text-muted-foreground" title={reference}>{reference}</code>
      <Button type="button" variant="ghost" size="xs" onClick={copyReference} aria-label={t("copyReference")}>
        {copied ? t("copiedReference") : t("copyReference")}
      </Button>
    </div>
  );
}
