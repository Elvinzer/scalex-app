"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type PillarTab = { href: string; label: string };

// Router-driven, not a content-switcher: each tab is a real route (Contenu,
// Setting, Ads... are separate pages), so there's no shared TabsContent —
// Tabs.Trigger's asChild wraps a real <Link>, and `value` is recomputed from
// the current pathname on every navigation/render rather than controlled via
// onValueChange, so the underline always reflects the actual URL (works on
// direct deep links too, not just in-app clicks).
export function PillarTabs({ tabs }: { tabs: PillarTab[] }) {
  const pathname = usePathname();
  if (tabs.length === 0) return null;

  const active = tabs.find((tab) => pathname === tab.href || pathname.startsWith(`${tab.href}/`))?.href ?? tabs[0].href;

  return (
    <Tabs value={active}>
      <TabsList className="w-full justify-start md:justify-center">
        {tabs.map((tab) => (
          <TabsTrigger key={tab.href} value={tab.href} asChild className="text-center">
            <Link href={tab.href}>{tab.label}</Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
