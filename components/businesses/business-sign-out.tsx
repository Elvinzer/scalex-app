"use client";

import { useTranslations } from "next-intl";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/supabase/client";

export function BusinessSignOut() {
  const t = useTranslations("businesses");
  const [pending, startTransition] = useTransition();
  return (
    <Button variant="outline" disabled={pending} onClick={() => startTransition(async () => {
      await signOut();
      window.location.assign(new URL("/sign-in", window.location.origin).href);
    })}>{t("blocked.signOut")}</Button>
  );
}
