"use client";

import {
  Boxes,
  ChevronsUpDown,
  Database,
  FileText,
  LayoutDashboard,
  LogOut,
  Receipt,
  Settings,
  ShieldCheck,
  Store,
  Stethoscope,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { ScaleScoreBadge } from "@/components/scale-score-badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ScaleScoreResult } from "@/lib/diagnostic/scale-score";
import type { ScaleScoreSparklinePoint } from "@/lib/scale-score-history/queries";
import { createClient } from "@/lib/supabase/client";
import type { PermissionKey } from "@/lib/team/permissions";
import { cn } from "@/lib/utils";

type IconType = React.ComponentType<{ className?: string; style?: React.CSSProperties }>;

// permission: which grantable key unlocks this entry for a team member (see
// lib/team/permissions.ts) — absent means owner-only, never delegable
// (Réglages: BYOK key, Stripe Connect, billing, team). The account owner
// always sees everything regardless of this field.
type LinkEntry = { type: "link"; href: string; label: string; icon: IconType; permission?: PermissionKey };

// CŒUR — the value-loop pages, always visible (permission-gated as before).
// Funnel isn't here anymore: it's a tab inside Diagnostic now (see
// app/(app)/diagnostic/page.tsx) — /funnel just redirects there. Suivi des
// ventes/Contenu are flat entries here too — no more "Suivi" pillar
// grouping above them, just plain items in the main menu like the rest.
const topEntries: LinkEntry[] = [
  { type: "link", href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, permission: "dashboard" },
  { type: "link", href: "/datas", label: "Mes chiffres", icon: Database, permission: "datas" },
  { type: "link", href: "/diagnostic", label: "Diagnostic", icon: Stethoscope, permission: "diagnostic" },
  { type: "link", href: "/ventes/suivi", label: "Suivi des ventes", icon: Receipt, permission: "ventes:suivi" },
  { type: "link", href: "/acquisition/contenu", label: "Contenu", icon: FileText, permission: "acquisition:contenu" },
];

// HORS-NAVIGATION — account-level pages under the profile dropdown
// (ProfileMenu). Mon business moved back here (was briefly promoted to the
// core nav). Intégrations lives as a link inside /settings' own content
// (see app/(app)/settings/page.tsx) rather than a separate profile-menu
// entry. Réglages has no `permission`: owner-only.
const profileMenuEntries: LinkEntry[] = [
  { type: "link", href: "/business", label: "Mon business", icon: Store, permission: "business" },
  { type: "link", href: "/settings", label: "Réglages", icon: Settings },
];

// AVANCÉ — one flat nav line, own visibility rule below. Always shown to
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
// isOwner. Only ever true for founders. Lives in the profile dropdown
// (ProfileMenu), appended manually rather than through profileMenuEntries
// since it isn't permission-gated at all. app/admin/layout.tsx still does
// its own server-side check regardless of this link being visible.
const adminEntry: LinkEntry = { type: "link", href: "/admin", label: "Panel admin", icon: ShieldCheck };

function isEntryVisible(entry: LinkEntry, isOwner: boolean, permissions: readonly PermissionKey[]): boolean {
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
        "flex items-center gap-3 rounded-[var(--radius-control)] py-2.5 pr-3 font-bold transition-all duration-[var(--motion-fast)] ease-[var(--ease-out)]",
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

function ProfileMenu({
  businessName,
  displayName,
  avatarUrl,
  email,
  isOwner,
  permissions,
  isAdmin,
  onSignOut,
}: {
  businessName: string;
  displayName: string | null;
  avatarUrl: string | null;
  email: string;
  isOwner: boolean;
  permissions: readonly PermissionKey[];
  isAdmin: boolean;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const initial = email.charAt(0).toUpperCase() || "?";
  const visibleEntries = profileMenuEntries.filter((entry) => isEntryVisible(entry, isOwner, permissions));
  const entries = isAdmin ? [...visibleEntries, adminEntry] : visibleEntries;

  return (
    <div className="flex items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-1 py-1.5 text-left transition-colors hover:bg-mist/10"
          >
            {avatarUrl ? (
              <div className="relative size-7 shrink-0 overflow-hidden rounded-full">
                <Image src={avatarUrl} alt="" fill sizes="28px" className="object-cover" />
              </div>
            ) : (
              <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-on-dark">
                {initial}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-bold tracking-[-0.005em] text-mist/90">
                {displayName || businessName || "Mon business"}
              </p>
              <p className="truncate text-[11px] tracking-[-0.005em] text-mist/50">{email}</p>
            </div>
            <ChevronsUpDown className="size-3.5 shrink-0 text-mist/40" />
          </button>
        </PopoverTrigger>
        <PopoverContent side="top" align="start" sideOffset={10} className="w-56 p-1.5">
          {entries.map((entry) => {
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
  displayName,
  avatarUrl,
  isOwner,
  permissions,
  isAdmin,
  advancedModulesEnabled,
  scaleScore,
  scaleScoreDelta7d,
  scaleScoreDelta30d,
  scaleScoreSparkline,
}: {
  email: string;
  businessName: string;
  displayName: string | null;
  avatarUrl: string | null;
  isOwner: boolean;
  permissions: readonly PermissionKey[];
  isAdmin: boolean;
  advancedModulesEnabled: boolean;
  scaleScore: ScaleScoreResult | null;
  scaleScoreDelta7d: number | null;
  scaleScoreDelta30d: number | null;
  scaleScoreSparkline: ScaleScoreSparklinePoint[];
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
      <Link href="/dashboard" className="flex items-center px-3 pt-3 pb-7 transition-opacity hover:opacity-80">
        <Image src="/scalex-wordmark.png" alt="Scale X" width={398} height={100} priority className="h-9 w-auto" />
      </Link>

      <nav className="flex flex-1 flex-col gap-1 pt-4">
        {visibleTopEntries.map((entry) => (
          <NavLink key={entry.href} entry={entry} pathname={pathname} indented={false} />
        ))}

        {hasAnyAdvancedAccess(isOwner, permissions) && (
          <>
            <div className="my-3 h-px bg-white/20" />
            <NavLink
              entry={advancedEntry}
              pathname={pathname}
              indented={false}
              badge={advancedModulesEnabled ? undefined : "Activer"}
            />
          </>
        )}
      </nav>

      {scaleScore && (
        <div className="px-3 pt-3">
          <ScaleScoreBadge
            scaleScore={scaleScore}
            delta7d={scaleScoreDelta7d}
            delta30d={scaleScoreDelta30d}
            sparkline={scaleScoreSparkline}
          />
        </div>
      )}

      <div className="px-3 pt-4">
        <ProfileMenu
          businessName={businessName}
          displayName={displayName}
          avatarUrl={avatarUrl}
          email={email}
          isOwner={isOwner}
          permissions={permissions}
          isAdmin={isAdmin}
          onSignOut={handleSignOut}
        />
      </div>
    </aside>
  );
}
