"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

export function PostponeActionButton() {
  const [postponed, setPostponed] = useState(false);

  return (
    <Button type="button" size="sm" variant={postponed ? "ghost" : "outline"} disabled={postponed} onClick={() => setPostponed(true)}>
      {postponed ? "Reporté pour cette session" : "Reporter"}
    </Button>
  );
}
