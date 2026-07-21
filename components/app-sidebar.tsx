"use client";

import {
  Boxes,
  ChevronsUpDown,
  Database,
  FileText,
  LayoutDashboard,
  LogOut,
  MessageCircle,
  Receipt,
  Settings,
  ShieldCheck,
  Store,
  Stethoscope,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { createClient } from "@/lib/supabase/client";
import type { PermissionKey } from "@/lib/team/permissions";
import { cn } from "@/lib/utils";

type IconType = React.ComponentType<{ className?: string; style?: React.CSSProperties }>;

// permission: which grantable key unlocks this entry for a team member (see
// lib/team/permissions.ts) — absent means owner-only, never delegable
// (Réglages: BYOK key, Stripe Connect, billing, team). alwaysVisible bypasses
// both isOwner and permission entirely — for entries every account member
// should see regardless of role (today, only Copilote IA: the chat isn't
// data-sensitive the way a permission-gated page is). The account owner
// always sees everything regardless of either field.
type LinkEntry = { type: "link"; href: string; label: string; icon: IconType; permission?: PermissionKey; alwaysVisible?: true };
type DisabledEntry = { type: "disabled"; label: string; icon: IconType };
type NavEntry = LinkEntry | DisabledEntry;

type Pillar = { label: string; entries: NavEntry[] };

// CŒUR — the value-loop pages, always visible (permission-gated as before).
// Funnel isn't here anymore: it's a tab inside Diagnostic now (see
// app/(app)/diagnostic/page.tsx) — /funnel just redirects there. Mon
// business moved up from the profile dropdown into the core nav (it's
// required for the € calculations, not just an account setting).
const topEntries: LinkEntry[] = [
  { type: "link", href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, permission: "dashboard" },
  { type: "link", href: "/datas", label: "Mes chiffres", icon: Database, permission: "datas" },
  { type: "link", href: "/diagnostic", label: "Diagnostic", icon: Stethoscope, permission: "diagnostic" },
  { type: "link", href: "/copilote", label: "Copilote IA", icon: MessageCircle, alwaysVisible: true },
  { type: "link", href: "/business", label: "Mon business", icon: Store, permission: "business" },
];

// SECONDAIRE — grouped under one "Suivi" label. Ads, Setting, Vidéos de
// closing and Closing used to live here too; they've moved behind the
// Avancé hub (see advancedEntry below) to cut down on main-nav clutter for a
// pre-PMF product — same pages, same permissions, just reached one hop
// further via /avance instead of a permanent pillar entry.
const pillars: Pillar[] = [
  {
    label: "Suivi",
    entries: [
      { type: "link", href: "/ventes/suivi", label: "Suivi des ventes", icon: Receipt, permission: "ventes:suivi" },
      { type: "link", href: "/acquisition/contenu", label: "Contenu", icon: FileText, permission: "acquisition:contenu" },
    ],
  },
];

// HORS-NAVIGATION — account-level pages under the profile dropdown
// (ProfileMenu). Intégrations moved out of here into a link inside
// /settings' own content (see app/(app)/settings/page.tsx) rather than a
// separate profile-menu entry. Réglages has no `permission`: owner-only.
const profileMenuEntries: LinkEntry[] = [{ type: "link", href: "/settings", label: "Réglages", icon: Settings }];

// AVANCÉ — one flat nav line (not a Pillar: pillars always render
// unconditionally, this one has its own visibility rule). Always shown to
// anyone with access to at least one of the 5 modules behind it (Ads,
// Bibliothèque d'appels, Setting quotidien, Closing quotidien, Équipe) —
// the account's advancedModulesEnabled flag doesn't hide this link, it only
// gates whether the hub's cards are unlocked or shown collapsed/"Activer"
// (see app/(app)/avance/page.tsx) — flags control display, never access.
const advancedEntry: LinkEntry = { type: "link", href: "/avance", label: "Avancé", icon: Boxes };
const ADVANCED_PERMISSION_KEYS: readonly PermissionKey[] = [
  "acquisition:ads",
  "acquisition:setting",
  "ventes:videos",
  "ventes:closing",
];

function hasAnyAdvancedAccess(isOwner: boolean, permissions: readonly PermissionKey[]): boolean {
  return isOwner || permissions.some((key) => ADVANCED_PERMISSION_KEYS.includes(key));
}

// Separate from the permission model entirely — gated by isAdmin (the
// ADMIN_EMAILS allowlist, see lib/admin.ts), not by role/permission or even
// isOwner. Only ever true for founders. app/admin/layout.tsx still does its
// own server-side check regardless of this link being visible.
const adminEntry: LinkEntry = { type: "link", href: "/admin", label: "Panel admin", icon: ShieldCheck };

function isEntryVisible(entry: LinkEntry, isOwner: boolean, permissions: readonly PermissionKey[]): boolean {
  if (entry.alwaysVisible) return true;
  if (isOwner) return true;
  return entry.permission !== undefined && permissions.includes(entry.permission);
}

function NavLink({
  entry,
  pathname,
  indented,
  badge,
}: {
  entry: LinkEntry;
  pathname: string;
  indented: boolean;
  badge?: string;
}) {
  const Icon = entry.icon;
  const active = pathname === entry.href || pathname.startsWith(`${entry.href}/`);

  return (
    <Link
      href={entry.href}
      className={cn(
        "flex items-center gap-3 rounded-[var(--radius-control)] py-2.5 pr-3 font-bold transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
        indented ? "pl-7 text-[13px] tracking-[-0.005em]" : "pl-3 text-[13.5px] tracking-[-0.01em]",
        active
          ? "bg-accent text-white shadow-[0_2px_10px_var(--accent-glow)]"
          : "text-mist/75 hover:translate-x-0.5 hover:bg-mist/10 hover:text-mist"
      )}
    >
      <Icon className="size-4" />
      {entry.label}
      {badge && (
        <span className="ml-auto rounded-full bg-accent-2/20 px-1.5 py-0.5 text-[9.5px] font-bold tracking-[0.06em] text-accent-2 uppercase">
          {badge}
        </span>
      )}
    </Link>
  );
}

function DisabledNavItem({ entry }: { entry: DisabledEntry }) {
  const Icon = entry.icon;
  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-control)] py-2.5 pr-3 pl-7 text-[13px] font-bold tracking-[-0.005em] text-mist/40">
      <Icon className="size-4" />
      {entry.label}
      <span className="ml-auto rounded-full bg-white/5 px-1.5 py-0.5 text-[9.5px] font-bold tracking-[0.06em] text-mist/50 uppercase">
        Bientôt
      </span>
    </div>
  );
}

function PillarSection({
  pillar,
  pathname,
  isOwner,
  permissions,
}: {
  pillar: Pillar;
  pathname: string;
  isOwner: boolean;
  permissions: readonly PermissionKey[];
}) {
  const visibleEntries = pillar.entries.filter(
    (entry) => entry.type === "disabled" || isEntryVisible(entry, isOwner, permissions)
  );
  if (visibleEntries.length === 0) return null;

  return (
    <div className="mt-3 first:mt-0">
      <p className="px-3 py-1 text-[10.5px] font-bold tracking-[0.09em] text-on-dark-muted uppercase">
        {pillar.label}
      </p>
      <div className="mt-1 flex flex-col gap-1">
        {visibleEntries.map((entry) =>
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

function ProfileMenu({
  businessName,
  email,
  isOwner,
  permissions,
  onSignOut,
}: {
  businessName: string;
  email: string;
  isOwner: boolean;
  permissions: readonly PermissionKey[];
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const initial = email.charAt(0).toUpperCase() || "?";
  const visibleEntries = profileMenuEntries.filter((entry) => isEntryVisible(entry, isOwner, permissions));

  return (
    <div className="flex items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-1 py-1.5 text-left transition-colors hover:bg-mist/10"
          >
            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-on-dark">
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-bold tracking-[-0.005em] text-mist/90">
                {businessName || "Mon business"}
              </p>
              <p className="truncate text-[11px] tracking-[-0.005em] text-mist/50">{email}</p>
            </div>
            <ChevronsUpDown className="size-3.5 shrink-0 text-mist/40" />
          </button>
        </PopoverTrigger>
        <PopoverContent side="top" align="start" sideOffset={10} className="w-56 p-1.5">
          {visibleEntries.map((entry) => {
            const Icon = entry.icon;
            return (
              <Link
                key={entry.href}
                href={entry.href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 py-2 text-[13px] font-bold text-foreground transition-colors hover:bg-muted"
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

export function AppSidebar({
  email,
  businessName,
  isOwner,
  permissions,
  isAdmin,
  advancedModulesEnabled,
}: {
  email: string;
  businessName: string;
  isOwner: boolean;
  permissions: readonly PermissionKey[];
  isAdmin: boolean;
  advancedModulesEnabled: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/sign-in");
    router.refresh();
  }

  const visibleTopEntries = topEntries.filter((entry) => isEntryVisible(entry, isOwner, permissions));

  return (
    <aside
      className="fixed inset-y-0 left-0 z-20 flex w-64 flex-col px-3 py-7 text-mist shadow-[4px_0_24px_rgba(0,0,0,0.12)]"
      style={{ background: "var(--gradient-dark)" }}
    >
      <div className="flex items-center gap-2.5 px-3 pb-7">
        <div
          className="flex size-8 items-center justify-center rounded-lg text-sm font-bold text-white shadow-[0_2px_8px_var(--accent-glow)]"
          style={{ background: "var(--gradient-accent)" }}
        >
          S
        </div>
        <span className="font-display text-[17px] font-bold tracking-[-0.015em]">Scale X</span>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {visibleTopEntries.map((entry) => (
          <NavLink key={entry.href} entry={entry} pathname={pathname} indented={false} />
        ))}

        {pillars.map((pillar) => (
          <PillarSection key={pillar.label} pillar={pillar} pathname={pathname} isOwner={isOwner} permissions={permissions} />
        ))}

        {hasAnyAdvancedAccess(isOwner, permissions) && (
          <div className="mt-3">
            <NavLink
              entry={advancedEntry}
              pathname={pathname}
              indented={false}
              badge={advancedModulesEnabled ? undefined : "Activer"}
            />
          </div>
        )}

        {isAdmin && (
          <div className="mt-3">
            <p className="px-3 py-1 text-[10.5px] font-bold tracking-[0.09em] text-on-dark-muted uppercase">
              Admin
            </p>
            <div className="mt-1 flex flex-col gap-1">
              <NavLink entry={adminEntry} pathname={pathname} indented />
            </div>
          </div>
        )}
      </nav>

      <div className="border-t border-mist/15 px-3 pt-4">
        <ProfileMenu businessName={businessName} email={email} isOwner={isOwner} permissions={permissions} onSignOut={handleSignOut} />
      </div>
    </aside>
  );
}
