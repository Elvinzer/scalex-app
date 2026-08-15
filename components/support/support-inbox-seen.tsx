"use client";

import { useEffect } from "react";

export function SupportInboxSeen() {
  useEffect(() => {
    void fetch("/api/support/seen", { method: "POST", keepalive: true });
  }, []);
  return null;
}

