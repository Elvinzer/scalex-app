"use client";

import {
  Bot,
  Database,
  FileText,
  Filter,
  Handshake,
  LayoutDashboard,
  LogOut,
  Megaphone,
  MessagesSquare,
  Plug,
  Receipt,
  Settings,
  Store,
  Stethoscope,
  UserRoundCheck,
  Video,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type IconType = React.ComponentType<{ className?: string; style?: React.CSSProperties }>;

type NavEntry =
  | { type: "link"; href: string; label: string; icon: IconType }
  | { type: "section"; label: string }
  | { type: "disabled"; label: string; icon: IconType };

// Sidebar mirrors the 3-pillar structure: top-level pages, then
// ACQUISITION/VENTES/DÉLIVRABILITÉ each with their sub-items, then
// bottom-level pages. "disabled" entries are pillar items not yet built
// (later phases) — shown greyed out with a "Bientôt" badge rather than
// omitted, so the full target structure is visible from Phase 1.
const navEntries: NavEntry[] = [
  { type: "link", href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { type: "link", href: "/business", label: "Mon business", icon: Store },
  { type: "link", href: "/funnel", label: "Funnel", icon: Filter },
  { type: "link", href: "/datas", label: "Datas", icon: Database },

  { type: "section", label: "Acquisition" },
  { type: "link", href: "/acquisition/contenu", label: "Contenu", icon: FileText },
  { type: "link", href: "/acquisition/setting", label: "Setting", icon: UserRoundCheck },
  { type: "disabled", label: "Ads", icon: Megaphone },

  { type: "section", label: "Ventes" },
  { type: "link", href: "/ventes/suivi", label: "Suivi des ventes", icon: Receipt },
  { type: "disabled", label: "Vidéos de closing", icon: Video },
  { type: "link", href: "/ventes/closing", label: "Closing", icon: Handshake },

  { type: "section", label: "Délivrabilité" },
  { type: "disabled", label: "Process", icon: Workflow },
  { type: "disabled", label: "Témoignages", icon: MessagesSquare },

  { type: "link", href: "/diagnostic", label: "Diagnostic", icon: Stethoscope },
  { type: "link", href: "/agent", label: "Agent IA", icon: Bot },
  { type: "link", href: "/integrations", label: "Intégrations", icon: Plug },
  { type: "link", href: "/settings", label: "Réglages", icon: Settings },
];

export function AppSidebar({ email }: { email: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/sign-in");
    router.refresh();
  }

  const initial = email.charAt(0).toUpperCase() || "?";

  return (
    <aside className="fixed inset-y-0 left-0 z-20 flex w-64 flex-col bg-ink px-3 py-7 text-mist">
      <div className="flex items-center gap-2.5 px-3 pb-7">
        <div className="flex size-8 items-center justify-center rounded-lg border border-mist bg-signal text-sm font-medium text-ink">
          S
        </div>
        <span className="font-display text-lg font-medium tracking-tight">Scale X</span>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {navEntries.map((entry) => {
          if (entry.type === "section") {
            return (
              <p
                key={entry.label}
                className="mt-4 mb-1 px-3 text-[11px] font-medium tracking-wide text-on-dark-muted uppercase first:mt-0"
              >
                {entry.label}
              </p>
            );
          }

          const Icon = entry.icon;

          if (entry.type === "disabled") {
            return (
              <div
                key={entry.label}
                className="flex items-center gap-3 rounded-[var(--radius-control)] py-2.5 pr-3 pl-7 text-sm font-medium text-mist/40"
              >
                <Icon className="size-4" />
                {entry.label}
                <span className="ml-auto rounded-full bg-white/5 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-mist/50 uppercase">
                  Bientôt
                </span>
              </div>
            );
          }

          const active = pathname === entry.href || pathname.startsWith(`${entry.href}/`);
          const isSubItem = entry.href.startsWith("/acquisition/") || entry.href.startsWith("/ventes/");

          return (
            <Link
              key={entry.href}
              href={entry.href}
              className={cn(
                "flex items-center gap-3 rounded-[var(--radius-control)] py-2.5 pr-3 text-sm font-medium transition-colors duration-150",
                isSubItem ? "pl-7" : "pl-3",
                active ? "bg-white/10 text-on-dark" : "text-mist/75 hover:bg-mist/10 hover:text-mist"
              )}
            >
              <Icon className="size-4" />
              {entry.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-mist/15 px-3 pt-4">
        <div className="flex items-center gap-3 rounded-xl px-1 py-2">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-medium text-on-dark">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-mist/85">{email}</p>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            aria-label="Se déconnecter"
            className="flex size-7 items-center justify-center rounded-lg text-mist/60 transition-colors hover:bg-state-critical/20 hover:text-state-critical"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
