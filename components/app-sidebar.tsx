"use client";

import {
  ChevronsUpDown,
  Database,
  FileText,
  Filter,
  Handshake,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Plug,
  Receipt,
  Settings,
  Store,
  Stethoscope,
  UserRoundCheck,
  Video,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type IconType = React.ComponentType<{ className?: string; style?: React.CSSProperties }>;

type LinkEntry = { type: "link"; href: string; label: string; icon: IconType };
type DisabledEntry = { type: "disabled"; label: string; icon: IconType };
type NavEntry = LinkEntry | DisabledEntry;

type Pillar = { label: string; entries: NavEntry[] };

// Sidebar mirrors the pillar structure: top-level pages, then
// ACQUISITION/VENTES each with their sub-items (always shown, just under a
// static section label — no collapse/expand, too few items per pillar to
// justify the extra click), then bottom-level pages. "disabled" entries
// are pillar items not yet built — shown greyed out with a "Bientôt" badge
// rather than omitted, so the full target structure stays visible.
const topEntries: LinkEntry[] = [
  { type: "link", href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { type: "link", href: "/funnel", label: "Funnel", icon: Filter },
  { type: "link", href: "/datas", label: "Datas", icon: Database },
];

const pillars: Pillar[] = [
  {
    label: "Acquisition",
    entries: [
      { type: "link", href: "/acquisition/contenu", label: "Contenu", icon: FileText },
      { type: "link", href: "/acquisition/setting", label: "Setting", icon: UserRoundCheck },
      { type: "link", href: "/acquisition/ads", label: "Ads", icon: Megaphone },
    ],
  },
  {
    label: "Ventes",
    entries: [
      { type: "link", href: "/ventes/suivi", label: "Suivi des ventes", icon: Receipt },
      { type: "link", href: "/ventes/videos", label: "Vidéos de closing", icon: Video },
      { type: "link", href: "/ventes/closing", label: "Closing", icon: Handshake },
    ],
  },
];

const bottomEntries: LinkEntry[] = [
  { type: "link", href: "/diagnostic", label: "Diagnostic", icon: Stethoscope },
];

// Moved out of the main nav into the profile dropdown at the bottom of the
// sidebar (see ProfileMenu) — these are account-level pages, not day-to-day
// product pages.
const profileMenuEntries: LinkEntry[] = [
  { type: "link", href: "/business", label: "Mon business", icon: Store },
  { type: "link", href: "/integrations", label: "Intégrations", icon: Plug },
  { type: "link", href: "/settings", label: "Réglages", icon: Settings },
];

function NavLink({ entry, pathname, indented }: { entry: LinkEntry; pathname: string; indented: boolean }) {
  const Icon = entry.icon;
  const active = pathname === entry.href || pathname.startsWith(`${entry.href}/`);

  return (
    <Link
      href={entry.href}
      className={cn(
        "flex items-center gap-3 rounded-[var(--radius-control)] py-2.5 pr-3 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
        indented
          ? "pl-7 text-[13px] font-normal tracking-[-0.005em]"
          : "pl-3 text-[13.5px] font-medium tracking-[-0.01em]",
        active
          ? "bg-linear-to-r from-accent/25 to-accent/5 text-on-dark shadow-[inset_2px_0_0_var(--accent)]"
          : "text-mist/75 hover:translate-x-0.5 hover:bg-mist/10 hover:text-mist"
      )}
    >
      <Icon className={cn("size-4", active && "text-accent")} />
      {entry.label}
    </Link>
  );
}

function DisabledNavItem({ entry }: { entry: DisabledEntry }) {
  const Icon = entry.icon;
  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-control)] py-2.5 pr-3 pl-7 text-[13px] font-normal tracking-[-0.005em] text-mist/40">
      <Icon className="size-4" />
      {entry.label}
      <span className="ml-auto rounded-full bg-white/5 px-1.5 py-0.5 text-[9.5px] font-semibold tracking-[0.06em] text-mist/50 uppercase">
        Bientôt
      </span>
    </div>
  );
}

function PillarSection({ pillar, pathname }: { pillar: Pillar; pathname: string }) {
  return (
    <div className="mt-3 first:mt-0">
      <p className="px-3 py-1 text-[10.5px] font-semibold tracking-[0.09em] text-on-dark-muted uppercase">
        {pillar.label}
      </p>
      <div className="mt-1 flex flex-col gap-1">
        {pillar.entries.map((entry) =>
          entry.type === "disabled" ? (
            <DisabledNavItem key={entry.label} entry={entry} />
          ) : (
            <NavLink key={entry.href} entry={entry} pathname={pathname} indented />
          )
        )}
      </div>
    </div>
  );
}

function ProfileMenu({ businessName, email, onSignOut }: { businessName: string; email: string; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const initial = email.charAt(0).toUpperCase() || "?";

  return (
    <div className="flex items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-1 py-1.5 text-left transition-colors hover:bg-mist/10"
          >
            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-medium text-on-dark">
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-medium tracking-[-0.005em] text-mist/90">
                {businessName || "Mon business"}
              </p>
              <p className="truncate text-[11px] tracking-[-0.005em] text-mist/50">{email}</p>
            </div>
            <ChevronsUpDown className="size-3.5 shrink-0 text-mist/40" />
          </button>
        </PopoverTrigger>
        <PopoverContent side="top" align="start" sideOffset={10} className="w-56 p-1.5">
          {profileMenuEntries.map((entry) => {
            const Icon = entry.icon;
            return (
              <Link
                key={entry.href}
                href={entry.href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-muted"
              >
                <Icon className="size-4 text-muted-foreground" />
                {entry.label}
              </Link>
            );
          })}
        </PopoverContent>
      </Popover>
      <button
        type="button"
        onClick={onSignOut}
        aria-label="Se déconnecter"
        className="flex size-7 shrink-0 items-center justify-center rounded-lg text-mist/60 transition-colors hover:bg-state-critical/20 hover:text-state-critical"
      >
        <LogOut className="size-4" />
      </button>
    </div>
  );
}

export function AppSidebar({ email, businessName }: { email: string; businessName: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <aside
      className="fixed inset-y-0 left-0 z-20 flex w-64 flex-col px-3 py-7 text-mist shadow-[4px_0_24px_rgba(0,0,0,0.12)]"
      style={{ background: "var(--gradient-dark)" }}
    >
      <div className="flex items-center gap-2.5 px-3 pb-7">
        <div
          className="flex size-8 items-center justify-center rounded-lg text-sm font-medium text-white shadow-[0_2px_8px_var(--accent-glow)]"
          style={{ background: "var(--gradient-accent)" }}
        >
          S
        </div>
        <span className="font-display text-[17px] font-semibold tracking-[-0.015em]">Scale X</span>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {topEntries.map((entry) => (
          <NavLink key={entry.href} entry={entry} pathname={pathname} indented={false} />
        ))}

        {pillars.map((pillar) => (
          <PillarSection key={pillar.label} pillar={pillar} pathname={pathname} />
        ))}

        <div className="mt-2 flex flex-col gap-1 border-t border-mist/15 pt-2">
          {bottomEntries.map((entry) => (
            <NavLink key={entry.href} entry={entry} pathname={pathname} indented={false} />
          ))}
        </div>
      </nav>

      <div className="border-t border-mist/15 px-3 pt-4">
        <ProfileMenu businessName={businessName} email={email} onSignOut={handleSignOut} />
      </div>
    </aside>
  );
}
