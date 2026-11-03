"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

import { acceptInvite } from "./actions";

export function AcceptInviteForm({ token }: { token: string }) {
  const t = useTranslations("billing.invite");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleAccept() {
    setError(null);
    startTransition(async () => {
      const result = await acceptInvite(token);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push(result.redirectTo ?? "/");
    });
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <Button size="lg" disabled={isPending} onClick={handleAccept}>
        {isPending ? t("accepting") : t("accept")}
      </Button>
      {error && <p className="text-sm text-state-critical">{error}</p>}
    </div>
  );
}
