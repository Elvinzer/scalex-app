"use client";

import {
  Bot,
  ChevronRight,
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
import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type IconType = React.ComponentType<{ className?: string; style?: React.CSSProperties }>;

type LinkEntry = { type: "link"; href: string; label: string; icon: IconType };
type DisabledEntry = { type: "disabled"; label: string; icon: IconType };
type NavEntry = LinkEntry | DisabledEntry;

type Pillar = { label: string; entries: NavEntry[] };

// Sidebar mirrors the 3-pillar structure: top-level pages, then
// ACQUISITION/VENTES/DÉLIVRABILITÉ each with their sub-items (collapsible,
// collapsed by default — see PillarSection), then bottom-level pages.
// "disabled" entries are pillar items not yet built — shown greyed out with
// a "Bientôt" badge rather than omitted, so the full target structure stays
// visible.
const topEntries: LinkEntry[] = [
  { type: "link", href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { type: "link", href: "/business", label: "Mon business", icon: Store },
  { type: "link", href: "/funnel", label: "Funnel", icon: Filter },
  { type: "link", href: "/datas", label: "Datas", icon: Database },
];

const pillars: Pillar[] = [
  {
    label: "Acquisition",
    entries: [
      { type: "link", href: "/acquisition/contenu", label: "Contenu", icon: FileText },
      { type: "link", href: "/acquisition/setting", label: "Setting", icon: UserRoundCheck },
      { type: "disabled", label: "Ads", icon: Megaphone },
    ],
  },
  {
    label: "Ventes",
    entries: [
      { type: "link", href: "/ventes/suivi", label: "Suivi des ventes", icon: Receipt },
      { type: "disabled", label: "Vidéos de closing", icon: Video },
      { type: "link", href: "/ventes/closing", label: "Closing", icon: Handshake },
    ],
  },
  {
    label: "Délivrabilité",
    entries: [
      { type: "link", href: "/delivrabilite/process", label: "Process", icon: Workflow },
      { type: "link", href: "/delivrabilite/temoignages", label: "Témoignages", icon: MessagesSquare },
    ],
  },
];

const bottomEntries: LinkEntry[] = [
  { type: "link", href: "/diagnostic", label: "Diagnostic", icon: Stethoscope },
  { type: "link", href: "/agent", label: "Agent IA", icon: Bot },
  { type: "link", href: "/integrations", label: "Intégrations", icon: Plug },
  { type: "link", href: "/settings", label: "Réglages", icon: Settings },
];

const STORAGE_KEY = "scalex-sidebar-open-pillars";

function NavLink({ entry, pathname, indented }: { entry: LinkEntry; pathname: string; indented: boolean }) {
  const Icon = entry.icon;
  const active = pathname === entry.href || pathname.startsWith(`${entry.href}/`);

  return (
    <Link
      href={entry.href}
      className={cn(
        "flex items-center gap-3 rounded-[var(--radius-control)] py-2.5 pr-3 text-sm font-medium transition-colors duration-150",
        indented ? "pl-7" : "pl-3",
        active ? "bg-white/10 text-on-dark" : "text-mist/75 hover:bg-mist/10 hover:text-mist"
      )}
    >
      <Icon className="size-4" />
      {entry.label}
    </Link>
  );
}

function DisabledNavItem({ entry }: { entry: DisabledEntry }) {
  const Icon = entry.icon;
  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-control)] py-2.5 pr-3 pl-7 text-sm font-medium text-mist/40">
      <Icon className="size-4" />
      {entry.label}
      <span className="ml-auto rounded-full bg-white/5 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-mist/50 uppercase">
        Bientôt
      </span>
    </div>
  );
}

function PillarSection({
  pillar,
  pathname,
  open,
  onToggle,
}: {
  pillar: Pillar;
  pathname: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="mt-1 first:mt-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-1 rounded-[var(--radius-control)] px-3 py-1.5 text-[11px] font-medium tracking-wide text-on-dark-muted uppercase transition-colors hover:text-mist"
      >
        <ChevronRight className={cn("size-3 shrink-0 transition-transform duration-150", open && "rotate-90")} />
        {pillar.label}
      </button>
      {open && (
        <div className="flex flex-col gap-1">
          {pillar.entries.map((entry) =>
            entry.type === "disabled" ? (
              <DisabledNavItem key={entry.label} entry={entry} />
            ) : (
              <NavLink key={entry.href} entry={entry} pathname={pathname} indented />
            )
          )}
        </div>
      )}
    </div>
  );
}

export function AppSidebar({ email }: { email: string }) {
  const pathname = usePathname();
  const router = useRouter();

  // Collapsed by default. A pillar auto-opens the first time its own route
  // is active (so navigating there never hides the active link); after
  // that, the user's manual open/close choice persists across page loads.
  const [openPillars, setOpenPillars] = useState<Set<string>>(() => new Set());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const fromStorage: string[] = stored ? JSON.parse(stored) : [];
    const activePillar = pillars.find((pillar) =>
      pillar.entries.some((entry) => entry.type === "link" && (pathname === entry.href || pathname.startsWith(`${entry.href}/`)))
    );
    const initial = new Set(fromStorage);
    if (activePillar) initial.add(activePillar.label);
    setOpenPillars(initial);
    setHydrated(true);
    // Only run once on mount — subsequent pathname changes shouldn't force
    // a pillar back open if the user deliberately collapsed it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function togglePillar(label: string) {
    setOpenPillars((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      return next;
    });
  }

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
        {topEntries.map((entry) => (
          <NavLink key={entry.href} entry={entry} pathname={pathname} indented={false} />
        ))}

        {hydrated &&
          pillars.map((pillar) => (
            <PillarSection
              key={pillar.label}
              pillar={pillar}
              pathname={pathname}
              open={openPillars.has(pillar.label)}
              onToggle={() => togglePillar(pillar.label)}
            />
          ))}

        <div className="mt-2 flex flex-col gap-1 border-t border-mist/15 pt-2">
          {bottomEntries.map((entry) => (
            <NavLink key={entry.href} entry={entry} pathname={pathname} indented={false} />
          ))}
        </div>
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
