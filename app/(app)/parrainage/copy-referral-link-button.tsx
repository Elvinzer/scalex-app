"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function CopyReferralLinkButton({ href }: { href: string }) {
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
    <Button type="button" variant="outline" size="sm" onClick={copyLink} aria-label="Copier le lien de parrainage">
      {copied ? <Check className="size-4 text-state-healthy" /> : <Copy className="size-4" />}
      {copied ? "Copié" : "Copier le lien"}
    </Button>
  );
}
