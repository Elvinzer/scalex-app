"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

export function PostponeActionButton() {
  const t = useTranslations("dashboard");
  const [postponed, setPostponed] = useState(false);

  return (
    <Button type="button" size="sm" variant={postponed ? "ghost" : "outline"} disabled={postponed} onClick={() => setPostponed(true)}>
      {postponed ? t("postponedThisSession") : t("postpone")}
    </Button>
  );
}
