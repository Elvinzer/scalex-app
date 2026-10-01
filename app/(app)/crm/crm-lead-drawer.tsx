"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { useReturnFocus } from "@/components/ui/use-return-focus";
import type { ActiveCloser } from "@/lib/closers/types";
import type { Offer } from "@/lib/business/types";
import type { CrmLeadDetails, CrmLeadListItem, CrmLeadStage } from "@/lib/crm/types";

import { getCrmLeadDetailAction } from "./crm-actions";
import { CrmLeadDetail } from "./crm-lead-detail";

type CrmSetter = { id: string; name: string; active: boolean };

export function CrmLeadDrawer({
  lead,
  open,
  onOpenChange,
  setters,
  offers,
  closers,
  canAssign,
  canManagePipeline,
  canValidateSale,
  onDeleted,
  onLost,
  onStageChanged,
}: {
  lead: CrmLeadListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  setters: CrmSetter[];
  offers: Offer[];
  closers: ActiveCloser[];
  canAssign: boolean;
  canManagePipeline: boolean;
  canValidateSale: boolean;
  onDeleted?: (leadId: string) => void;
  onLost?: (leadId: string) => void;
  onStageChanged?: (leadId: string, stage: CrmLeadStage) => void;
}) {
  const t = useTranslations("crm.detail");
  const [detail, setDetail] = useState<CrmLeadDetails | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [isPending, startTransition] = useTransition();
  const returnFocusProps = useReturnFocus();

  useEffect(() => {
    if (!open || !lead) {
      setDetail(null);
      setLoadError(false);
      return;
    }
    setDetail(null);
    setLoadError(false);
    let active = true;
    startTransition(async () => {
      try {
        const result = await getCrmLeadDetailAction(lead.id);
        if (!active) return;
        if (result) setDetail(result);
        else setLoadError(true);
      } catch {
        if (active) setLoadError(true);
      }
    });
    return () => { active = false; };
  }, [lead, open, startTransition]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent {...returnFocusProps} className="w-[min(620px,100vw)] overflow-y-auto p-4 sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-4 border-b border-border pb-4">
          <div>
            <DrawerTitle className="text-xl font-bold">{detail?.displayName ?? lead?.displayName ?? t("title")}</DrawerTitle>
            <p className="mt-1 text-sm text-muted-foreground">{t("drawerDescription")}</p>
          </div>
          <DrawerClose asChild>
            <Button type="button" variant="outline" size="sm" className="min-h-11">{t("close")}</Button>
          </DrawerClose>
        </div>
        {isPending && <p className="py-8 text-center text-sm text-muted-foreground" role="status">{t("loading")}</p>}
        {!isPending && loadError && <p className="py-8 text-center text-sm font-bold text-state-critical" role="alert">{t("notFound")}</p>}
        {!isPending && detail && <CrmLeadDetail initialLead={detail} setters={setters} offers={offers} closers={closers} canAssign={canAssign} canManagePipeline={canManagePipeline} canValidateSale={canValidateSale} inDrawer onDeleted={() => { onOpenChange(false); onDeleted?.(detail.id); }} onLost={() => onLost?.(detail.id)} onStageChanged={onStageChanged} />}
      </DrawerContent>
    </Drawer>
  );
}
