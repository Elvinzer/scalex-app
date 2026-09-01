"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

export type PillarTab = { href: string; label: string };

// Router-driven, not a content-switcher: each tab is a real route (Contenu,
// Setting, Ads... are separate pages), so there's no shared TabsContent —
// Tabs.Trigger's asChild wraps a real <Link>, and `value` is recomputed from
// the current pathname on every navigation/render rather than controlled via
// onValueChange, so the underline always reflects the actual URL (works on
// direct deep links too, not just in-app clicks).
export function PillarTabs({ tabs }: { tabs: PillarTab[] }) {
  const pathname = usePathname();
  const t = useTranslations("navigation");
  if (tabs.length === 0) return null;

  const labelKeyByHref: Record<string, string> = {
    "/acquisition/contenu": "content",
    "/acquisition/mail": "mail",
    "/ventes/pipeline": "pipeline",
    "/ventes/setters": "setters",
    "/acquisition/ads": "ads",
    "/ventes/suivi": "salesTracking",
    "/ventes/appels": "callsTracking",
    "/ventes/rdv": "appointments",
    "/crm": "today",
    "/crm/pipeline": "pipeline",
    "/crm/leads": "leads",
    "/crm/actions": "actions",
    "/crm/appels": "calls",
  };

  const active = tabs.find((tab) => pathname === tab.href || pathname.startsWith(`${tab.href}/`))?.href ?? tabs[0].href;
  return (
    <nav aria-label={t("sectionNavigation")} className="w-full overflow-x-auto">
      <div className="flex w-full min-w-max items-center justify-start gap-1 border-b-2 border-border md:justify-center" role="tablist">
        {tabs.map((tab) => {
          const isActive = tab.href === active;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              prefetch={true}
              role="tab"
              aria-selected={isActive}
              aria-current={isActive ? "page" : undefined}
              className={`-mb-0.5 shrink-0 border-b-2 border-transparent px-4 py-2.5 text-center text-sm font-bold whitespace-nowrap transition-colors duration-[var(--motion-fast)] ease-[var(--ease-out)] ${isActive ? "border-accent text-foreground" : "text-foreground/70 hover:text-foreground"}`}
            >
              {labelKeyByHref[tab.href] ? t(labelKeyByHref[tab.href]) : tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
