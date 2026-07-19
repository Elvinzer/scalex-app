"use client";

import { Sparkles } from "lucide-react";
import { useState } from "react";

import { AdCopyChat } from "@/components/ad-copy-chat";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import type { Offer } from "@/lib/business/types";

export function AdCopyTrigger({ offers }: { offers: Offer[] }) {
  const [open, setOpen] = useState(false);
  const [offerId, setOfferId] = useState<string>(offers.find((o) => o.isMain)?.id ?? offers[0]?.id ?? "");

  const selectedOffer = offers.find((o) => o.id === offerId) ?? null;

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button type="button" variant="outline">
          <Sparkles className="size-4" />
          Générer une accroche
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        {open && (
          <div className="flex h-full flex-col">
            {offers.length > 0 && (
              <div className="border-b border-border p-4">
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="text-muted-foreground">Offre à promouvoir</span>
                  <select
                    value={offerId}
                    onChange={(event) => setOfferId(event.target.value)}
                    className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
                  >
                    {offers.map((offer) => (
                      <option key={offer.id} value={offer.id}>
                        {offer.name || "Offre sans nom"}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            <div className="flex-1 overflow-hidden">
              <AdCopyChat
                key={offerId}
                offerId={offerId || null}
                offerName={selectedOffer?.name ?? null}
              />
            </div>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}
