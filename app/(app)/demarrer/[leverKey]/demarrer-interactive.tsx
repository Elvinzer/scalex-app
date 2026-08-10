"use client";

import { MessageCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Falco } from "@/components/falco/falco";
import { LazyImproveChat } from "@/components/lazy-improve-chat";
import { LeverStarterPlanCard } from "@/components/lever-starter-plan-card";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import type { ChatContext } from "@/lib/chat-context";
import type { FalcoSkinKey } from "@/lib/falco-skins";
import { recordLeverGuideChatOpened } from "@/lib/levers/demarrer-tracking";
import type { StarterPlanStep } from "@/lib/levers/starter-plan";

// Owns the ONE chat drawer shared by the checklist's "Falco m'aide" buttons
// and the standalone "Discuter avec Falco" CTA — a single instance so
// clicking help on a different step while the drawer is already open just
// re-seeds the SAME persisted lever conversation (see the `key` below) that
// reloads history + appends the new question, never a duplicate thread.
export function DemarrerInteractive({
  leverKey,
  leverLabel,
  falcoSkin,
  plan,
  initialProgress,
  canActivate,
  onToggleStep,
  onActivate,
}: {
  leverKey: string;
  leverLabel: string;
  falcoSkin: FalcoSkinKey | null;
  plan: StarterPlanStep[] | null;
  initialProgress: number[];
  canActivate: boolean;
  onToggleStep: (order: number) => Promise<void>;
  onActivate: () => Promise<void>;
}) {
  const t = useTranslations("app.leverGuide");
  const [chatOpen, setChatOpen] = useState(false);
  const [activeSeedQuestion, setActiveSeedQuestion] = useState<string | null>(null);

  const chatContext: ChatContext = { topicType: "lever", topicKey: leverKey, topicLabel: leverLabel, sourcePage: "demarrer_page" };

  function openChat(seedQuestion: string | null, fromStep: number | null) {
    setActiveSeedQuestion(seedQuestion);
    setChatOpen(true);
    void recordLeverGuideChatOpened(leverKey, fromStep);
  }

  function handleHelpStep(order: number) {
    const step = plan?.find((s) => s.order === order);
    openChat(step ? t("stepHelp", { step: step.title }) : null, order);
  }

  return (
    <div className="flex flex-col gap-6">
      {plan && plan.length > 0 && (
        <LeverStarterPlanCard
          steps={plan}
          completedSteps={initialProgress}
          canActivate={canActivate}
          onToggleStep={onToggleStep}
          onActivate={onActivate}
          onHelpStep={handleHelpStep}
        />
      )}

      <div className="sticker-card flex items-center gap-4 p-5">
        {falcoSkin ? (
          <Falco skin={falcoSkin} portrait skinSizePx={40} className="rounded-full" />
        ) : (
          <Falco pose="neutral" size="sm" />
        )}
        <div className="flex-1">
          <p className="text-sm font-bold">{t("needHelp", { lever: leverLabel })}</p>
          <p className="text-xs text-muted-foreground">{t("falcoHelp")}</p>
        </div>
        <Button variant="accent2" onClick={() => openChat(null, null)}>
          <MessageCircle className="size-4" />
          {t("chatWithFalco")}
        </Button>
      </div>

      <Drawer open={chatOpen} onOpenChange={setChatOpen}>
        <DrawerContent>
          {chatOpen && (
            <LazyImproveChat
              key={activeSeedQuestion ?? "default"}
              context={chatContext}
              period="3-months"
              gapBadge={null}
              mode="demarrer"
              falcoSkin={falcoSkin}
              seedQuestion={activeSeedQuestion ?? undefined}
            />
          )}
        </DrawerContent>
      </Drawer>
    </div>
  );
}
