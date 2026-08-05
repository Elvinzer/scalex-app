"use client";

import {
  CalendarDays,
  ChevronsUpDown,
  Database,
  Handshake,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  MessageCircle,
  Plug,
  Settings,
  ShieldCheck,
  Store,
  Stethoscope,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Fragment, useEffect, useState } from "react";

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
// (Réglages: BYOK key, Stripe Connect, billing, team). anyOfPermissions is
// for a PILLAR entry that fans out into several sub-pages (Acquisition,
// Vente) — visible if the account has access to at least one of them.
// The account owner always sees everything regardless of either field.
type LinkEntry = {
  type: "link";
  href: string;
  label: string;
  icon: IconType;
  permission?: PermissionKey;
  anyOfPermissions?: readonly PermissionKey[];
};

// CŒUR — the value-loop pages, always visible (permission-gated as before).
// Funnel/Insights are gone entirely (were duplicate readings of what the
// Diagnostic already shows — removed, not just hidden). "Vue d'ensemble"
// (/overview) is gone the same way: 3 of its 4 blocks were confirmed
// duplicates of Dashboard/Diagnostic; the one unique piece (the CA/leads/RDV/
// ventes trend chart) moved to Mes chiffres (app/(app)/datas/revenue-trend.tsx)
// rather than being lost. Team/roles moved to Mon business
// (app/(app)/business), Équipe card there.
//
// Acquisition/Vente are pillar entries: plain links to their landing page
// (which redirects to the first accessible sub-page), same as every other
// entry here. Their sub-pages (Contenu, Pipeline, Setters...) are reachable
// via the PillarTabs bar rendered at the top of the pillar's own layout
// (app/(app)/acquisition/layout.tsx, app/(app)/ventes/layout.tsx) — a
// sidebar hover flyout used to duplicate that same list one click earlier,
// but hover has no touch-device equivalent and it's fully redundant with
// the tabs, so it was removed rather than reimplemented as a
// tap-to-expand accordion. Setting/Ads/Closing (the former "Avancé"
// showcase modules) are deliberately set aside again — not rendered as
// tabs by their pillar layout, not linked anywhere. Copilote (below)
// replaces the old "Avancé" nav entry.
//
const topEntries: LinkEntry[] = [
  { type: "link", href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, permission: "dashboard" },
  { type: "link", href: "/datas", label: "Mes chiffres", icon: Database, permission: "datas" },
  {
    type: "link",
    href: "/acquisition",
    label: "Acquisition",
    icon: Megaphone,
    // All 5 real sub-page permissions (matches lib/nav/pillar-subpages.ts) —
    // this list previously omitted mail/pipeline/setters, so a team member
    // granted only e.g. "acquisition:pipeline" (the seeded "Setting" role's
    // default, see lib/team/permissions.ts's DEFAULT_ROLES) never saw the
    // "Acquisition" entry at all despite having a real page to reach.
    anyOfPermissions: ["acquisition:contenu", "acquisition:mail", "acquisition:pipeline", "acquisition:setters", "acquisition:ads"],
  },
  {
    type: "link",
    href: "/ventes",
    label: "Vente",
    icon: Handshake,
    // Same anyOfPermissions gap as Acquisition above, fixed the same way —
    // this previously listed only suivi/closing, so a member with just
    // "ventes:appels" (Appels' own permission), "business" (Produits), or
    // "ventes:upsell" never saw the "Vente" entry at all. ventes:closing/
    // ventes:videos are legacy/nested-page keys (see lib/team/permissions.ts)
    // kept here too since they can still be granted on their own.
    anyOfPermissions: [
      "ventes:suivi",
      "ventes:appels",
      "business",
      "ventes:upsell",
      "ventes:closing",
      "ventes:videos",
    ],
  },
  { type: "link", href: "/diagnostic", label: "Diagnostic", icon: Stethoscope, permission: "diagnostic" },
  // Hub central des conversations avec les agents Falco (app/(app)/copilote/) —
  // même permission que le Copilote partout ailleurs dans l'app.
  { type: "link", href: "/copilote", label: "Copilote", icon: MessageCircle, permission: "diagnostic" },
];

// SECONDAIRE — real, permission-gated content pages (same "business"/
// "dashboard" permissions the pages themselves check) that don't get a slot
// in the primary rail because they're occasional destinations, not part of
// the weekly value loop. Rendered as their own muted section in the sidebar
// body (below the score badge) rather than hidden behind the avatar — an
// avatar/profile trigger reads as "my account", not "two more app pages",
// which is what made the old flat profile menu (business pages + settings +
// admin all in one list) feel arbitrary.
const secondaryEntries: LinkEntry[] = [
  { type: "link", href: "/business", label: "Mon business", icon: Store, permission: "business" },
  { type: "link", href: "/journal", label: "Journal de bord", icon: CalendarDays, permission: "dashboard" },
];

// COMPTE — account-level config behind the avatar/profile dropdown
// (ProfileMenu). No `permission` field: owner-only, same gate as each
// page's own requireOwnerOrRedirect. This dropdown is now purely "my
// account", not a catch-all for anything that didn't fit elsewhere.
const profileMenuEntries: LinkEntry[] = [
  { type: "link", href: "/settings", label: "Réglages", icon: Settings },
  { type: "link", href: "/integrations", label: "Intégrations", icon: Plug },
];

// Separate from the permission model entirely — gated by isAdmin (the
// ADMIN_EMAILS allowlist, see lib/admin.ts), not by role/permission or even
// isOwner. Only ever true for founders, and categorically different from
// "my account" (it manages every customer, not this one) — rendered as its
// own tiny pinned link at the bottom of the sidebar rather than folded into
// the account dropdown. app/admin/layout.tsx still does its own
// server-side check regardless of this link being visible.
const adminEntry: LinkEntry = { type: "link", href: "/admin", label: "Panel admin", icon: ShieldCheck };

function isEntryVisible(entry: LinkEntry, isOwner: boolean, permissions: readonly PermissionKey[]): boolean {
  if (isOwner) return true;
  if (entry.permission !== undefined) return permissions.includes(entry.permission);
  if (entry.anyOfPermissions) return entry.anyOfPermissions.some((key) => permissions.includes(key));
  return false;
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
          : "text-white hover:translate-x-0.5 hover:bg-mist/10"
      )}
    >
      <Icon className="size-4" />
      {entry.label}
      {badge && (
        <span className="ml-auto rounded-full bg-mist/15 px-1.5 py-0.5 text-[9.5px] font-bold tracking-[0.06em] text-mist/70 uppercase">
          {badge}
        </span>
      )}
    </Link>
  );
}

function SecondaryLink({ entry, pathname }: { entry: LinkEntry; pathname: string }) {
  const Icon = entry.icon;
  const active = pathname === entry.href || pathname.startsWith(`${entry.href}/`);

  return (
    <Link
      href={entry.href}
      className={cn(
        "flex items-center gap-2.5 rounded-[var(--radius-control)] py-2 pl-3 pr-3 text-[12.5px] font-bold tracking-[-0.005em] transition-all duration-[var(--motion-fast)] ease-[var(--ease-out)]",
        active ? "bg-white/5 text-mist" : "text-mist/55 hover:bg-mist/10 hover:text-mist/85"
      )}
    >
      <Icon className="size-3.5" />
      {entry.label}
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
  onSignOut,
}: {
  businessName: string;
  displayName: string | null;
  avatarUrl: string | null;
  email: string;
  isOwner: boolean;
  permissions: readonly PermissionKey[];
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const initial = email.charAt(0).toUpperCase() || "?";
  const entries = profileMenuEntries.filter((entry) => isEntryVisible(entry, isOwner, permissions));

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
                {displayName || businessName || "Mon compte"}
              </p>
              <p className="truncate text-[11px] tracking-[-0.005em] text-mist/50">{email}</p>
            </div>
            <ChevronsUpDown className="size-3.5 shrink-0 text-mist/40" />
          </button>
        </PopoverTrigger>
        <PopoverContent side="bottom" align="end" sideOffset={10} className="w-56 p-1.5">
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
  scaleScore,
  scaleScoreGapText,
  scaleScoreMonthNote,
  scaleScoreDelta7d,
  scaleScoreDelta30d,
  scaleScoreSparkline,
  currentMonthlyRevenue,
  potentialMonthlyRevenue,
}: {
  email: string;
  businessName: string;
  displayName: string | null;
  avatarUrl: string | null;
  isOwner: boolean;
  permissions: readonly PermissionKey[];
  isAdmin: boolean;
  scaleScore: ScaleScoreResult | null;
  scaleScoreGapText: string | null;
  scaleScoreMonthNote: string | null;
  scaleScoreDelta7d: number | null;
  scaleScoreDelta30d: number | null;
  scaleScoreSparkline: ScaleScoreSparklinePoint[];
  currentMonthlyRevenue: number | null;
  potentialMonthlyRevenue: number | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Navigating should always dismiss the mobile drawer — otherwise it's
  // still covering the screen after the route has already changed.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Prevent the page behind the drawer from scrolling while it's open —
  // otherwise a touch-drag on the overlay scrolls the underlying content on
  // iOS/Android instead of just dismissing.
  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileOpen]);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/sign-in");
    router.refresh();
  }

  const visibleTopEntries = topEntries.filter((entry) => isEntryVisible(entry, isOwner, permissions));
  const visibleSecondaryEntries = secondaryEntries.filter((entry) => isEntryVisible(entry, isOwner, permissions));

  return (
    <>
      {/* Top bar — every breakpoint now (used to be mobile-only). Spans the
          full width but the sidebar (z-40) draws over its left 256px on lg,
          so it visually starts at the sidebar's right edge. The wordmark
          here is lg:hidden for exactly that reason — on desktop the logo
          lives in the sidebar's own h-14 row below, which is aligned to
          this bar's midline; on mobile the sidebar is off-canvas, so the
          bar carries the wordmark itself. Profile is pinned far right. */}
      <header
        className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 px-4 text-mist shadow-[0_2px_12px_rgba(0,0,0,0.12)] lg:px-6"
        style={{ background: "var(--gradient-dark)" }}
      >
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Ouvrir le menu"
          className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-mist transition-colors hover:bg-white/10 lg:hidden"
        >
          <Menu className="size-5" />
        </button>
        <Link href="/dashboard" className="flex items-center transition-opacity hover:opacity-80 lg:hidden">
          <Image src="/scalex-wordmark.png" alt="Scale X" width={398} height={100} priority className="h-7 w-auto" />
        </Link>
        <div className="ml-auto min-w-0">
          <ProfileMenu
            businessName={businessName}
            displayName={displayName}
            avatarUrl={avatarUrl}
            email={email}
            isOwner={isOwner}
            permissions={permissions}
            onSignOut={handleSignOut}
          />
        </div>
      </header>

      {/* Backdrop — mobile/tablet only, dismisses the drawer on tap. Sits
          above the floating chat bubble (z-30) so it doesn't peek through
          while the drawer is open. */}
      {mobileOpen && (
        <div
          className="glass-overlay fixed inset-0 z-[35] lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Full height (inset-y-0), unchanged from before the top bar existed
          — it deliberately overlaps the header's left 256px rather than
          starting below it, so the dark rail runs edge-to-edge with no gap
          at the bottom. */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-72 max-w-[85vw] flex-col overflow-hidden px-3 pb-7 text-mist shadow-[4px_0_24px_rgba(0,0,0,0.12)] transition-transform duration-[var(--motion-base)] ease-[var(--ease-out)] lg:w-64 lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
        style={{ background: "var(--gradient-dark)" }}
      >
        {/* h-14 mirrors the top bar's own height, so the wordmark's vertical
            center lands exactly on that bar's midline (28px) — the "logo
            centré à la hauteur du milieu du menu horizontal" ask. */}
        <div className="flex h-14 shrink-0 items-center justify-between px-3">
          <Link href="/dashboard" className="flex items-center transition-opacity hover:opacity-80">
            <Image src="/scalex-wordmark.png" alt="Scale X" width={398} height={100} priority className="h-9 w-auto" />
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Fermer le menu"
            className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-mist/70 transition-colors hover:bg-white/10 lg:hidden"
          >
            <X className="size-4.5" />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-x-hidden overflow-y-auto overscroll-contain pt-6">
          {visibleTopEntries.map((entry) => (
            <Fragment key={entry.href}>
              {/* Marks Copilote as a distinct space (action/chat) from the
                  analysis pages above it — same hairline that used to
                  separate the old "Avancé" entry. */}
              {entry.href === "/copilote" && <div className="my-3 h-px bg-white/20" />}
              <NavLink entry={entry} pathname={pathname} indented={false} />
            </Fragment>
          ))}
        </nav>

        {scaleScore && (
          <div className="px-3 pt-3">
            <ScaleScoreBadge
              scaleScore={scaleScore}
              scaleScoreGapText={scaleScoreGapText}
              scaleScoreMonthNote={scaleScoreMonthNote}
              delta7d={scaleScoreDelta7d}
              delta30d={scaleScoreDelta30d}
              sparkline={scaleScoreSparkline}
              currentMonthlyRevenue={currentMonthlyRevenue}
              potentialMonthlyRevenue={potentialMonthlyRevenue}
            />
          </div>
        )}

        {visibleSecondaryEntries.length > 0 && (
          <div className="px-3 pt-4">
            <div className="h-px bg-white/10" />
            <nav className="flex flex-col gap-0.5 pt-3">
              {visibleSecondaryEntries.map((entry) => (
                <SecondaryLink key={entry.href} entry={entry} pathname={pathname} />
              ))}
            </nav>
          </div>
        )}

        {isAdmin && (
          <div className="px-3 pt-2">
            <Link
              href={adminEntry.href}
              className="flex items-center gap-2 rounded-[var(--radius-control)] px-2.5 py-1.5 text-[10.5px] font-bold tracking-[0.06em] text-mist/35 uppercase transition-colors hover:bg-mist/10 hover:text-mist/60"
            >
              <ShieldCheck className="size-3.5" />
              {adminEntry.label}
            </Link>
          </div>
        )}
      </aside>
    </>
  );
}
