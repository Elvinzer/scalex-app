"use client";

import { useEffect } from "react";

import { captureMetaTrackingInBrowser } from "@/lib/meta-ads/tracking";

/** Captures Meta's bounded tracking query before the visitor navigates away. */
export function MetaTouchpointCapture() {
  useEffect(() => {
    captureMetaTrackingInBrowser(new URLSearchParams(window.location.search));
  }, []);

  return null;
}
