"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useReturnFocus } from "@/components/ui/use-return-focus";
import type { Offer } from "@/lib/business/types";

import { CrmLeadCaptureForm } from "./crm-lead-capture-form";
import { CrmLeadImport } from "./crm-lead-import";

export function CrmLeadManagementActions({ offers, setters, canImport }: { offers: Offer[]; setters: Array<{ id: string; name: string; active: boolean }>; canImport: boolean }) {
  const t = useTranslations("crm");
  const [captureOpen, setCaptureOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importHasUnsavedWork, setImportHasUnsavedWork] = useState(false);
  const captureReturnFocus = useReturnFocus();
  const importReturnFocus = useReturnFocus();
  const handleImportStepChange = useCallback((step: "dropzone" | "analyzing" | "mapping" | "preview" | "committing" | "done" | "error") => {
    setImportHasUnsavedWork(step === "analyzing" || step === "mapping" || step === "preview" || step === "committing");
  }, []);
  const handleImportOpenChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen && importHasUnsavedWork) return;
    setImportOpen(nextOpen);
  }, [importHasUnsavedWork]);

  return (
    <div className="flex flex-wrap gap-2">
      <Dialog open={captureOpen} onOpenChange={setCaptureOpen}>
        <DialogTrigger asChild>
          <Button type="button" className="min-h-11">{t("leads.captureToggle")}</Button>
        </DialogTrigger>
        <DialogContent {...captureReturnFocus} className="max-h-[calc(100dvh-2rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] p-4 sm:p-6">
          <div className="mb-4 flex items-start justify-between gap-3 border-b border-border pb-3">
            <DialogTitle className="pt-2 text-lg font-bold">{t("leads.captureTitle")}</DialogTitle>
            <DialogClose asChild><Button type="button" variant="outline" className="min-h-11">{t("detail.close")}</Button></DialogClose>
          </div>
          <CrmLeadCaptureForm offers={offers} setters={setters} hideTitle />
        </DialogContent>
      </Dialog>

      {canImport && <Dialog open={importOpen} onOpenChange={handleImportOpenChange}>
        <DialogTrigger asChild>
          <Button type="button" variant="outline" className="min-h-11">{t("import.toggle")}</Button>
        </DialogTrigger>
        <DialogContent {...importReturnFocus} className="max-h-[calc(100dvh-2rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] max-w-[min(1000px,calc(100vw-1rem))] p-3 sm:p-6">
          <div className="mb-4 flex items-start justify-between gap-3 border-b border-border pb-3">
            <DialogTitle className="pt-2 text-lg font-bold">{t("import.toggle")}</DialogTitle>
            <DialogClose asChild><Button type="button" variant="outline" className="min-h-11" disabled={importHasUnsavedWork}>{t("detail.close")}</Button></DialogClose>
          </div>
          <CrmLeadImport onStepChange={handleImportStepChange} />
        </DialogContent>
      </Dialog>}
    </div>
  );
}
