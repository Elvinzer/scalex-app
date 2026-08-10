"use client";

import { Check, Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function CopyReferralLinkButton({ href }: { href: string }) {
  const t = useTranslations("referral");
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={copyLink} aria-label={t("copyAria")}>
      {copied ? <Check className="size-4 text-state-healthy" /> : <Copy className="size-4" />}
      {copied ? t("copied") : t("copyLink")}
    </Button>
  );
}
