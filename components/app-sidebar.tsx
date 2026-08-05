"use client";

import {
  CalendarClock,
  CalendarDays,
  ChevronDown,
  ChevronsUpDown,
  Database,
  Gift,
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
import { PILLAR_SUBPAGES } from "@/lib/nav/pillar-subpages";
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

// BARRE DU HAUT — pages promoted into the horizontal top bar, rendered at
// the far left of its *visible* area (the sidebar draws over the header's
// first 256px on lg, hence the header's lg:pl-[17rem]). Deliberately a
// separate list from topEntries: this strip holds occasional destinations
// that don't earn a slot in the primary rail, not a second copy of it.
// Rendez-vous stays first (explicitly asked to sit far left).
//
// The bar itself is desktop-only (no room below lg once the hamburger,
// wordmark and profile are in), so these same entries are ALSO rendered
// inside the mobile drawer — see the lg:hidden block in the sidebar nav.
// Without that, moving a page here would silently make it unreachable on
// mobile.
const topBarEntries: LinkEntry[] = [
  { type: "link", href: "/ventes/rdv", label: "Rendez-vous", icon: CalendarClock, permission: "ventes:rdv" },
  { type: "link", href: "/journal", label: "Journal de bord", icon: CalendarDays, permission: "dashboard" },
];

// COMPTE — account-level config behind the avatar/profile dropdown
// (ProfileMenu). Mon business sits here too: it's the account's own
// identity/offer setup, which reads as "my account" rather than as one of
// the weekly value-loop pages. It keeps its "business" permission (the
// others have none — owner-only, same gate as each page's own
// requireOwnerOrRedirect).
const profileMenuEntries: LinkEntry[] = [
  { type: "link", href: "/business", label: "Mon business", icon: Store, permission: "business" },
  { type: "link", href: "/settings", label: "Réglages", icon: Settings },
  { type: "link", href: "/integrations", label: "Intégrations", icon: Plug },
  { type: "link", href: "/parrainage", label: "Parrainage", icon: Gift },
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
  className,
}: {
  entry: LinkEntry;
  pathname: string;
  indented: boolean;
  badge?: string;
  className?: string;
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
          : "text-white hover:translate-x-0.5 hover:bg-mist/10",
        className
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

// A pillar row (Acquisition, Vente) that expands/collapses its sub-pages
// inline. The label itself still navigates to the pillar landing page — only
// the chevron toggles — so the existing one-click path to a pillar is
// unchanged and the disclosure is an addition, not a trade-off.
//
// Sub-pages come from PILLAR_SUBPAGES, the same source the pillar's own tab
// bar reads (lib/nav/pillar-subpages.ts), so the two listings can't drift.
// This replaces the hover flyout that used to live here: hover has no
// touch-device equivalent, a tap-to-expand disclosure works everywhere.
function PillarNavGroup({
  entry,
  pathname,
  isOwner,
  permissions,
}: {
  entry: LinkEntry;
  pathname: string;
  isOwner: boolean;
  permissions: readonly PermissionKey[];
}) {
  const subpages = (PILLAR_SUBPAGES[entry.href] ?? []).filter((sub) => isOwner || permissions.includes(sub.permission));
  const insidePillar = pathname === entry.href || pathname.startsWith(`${entry.href}/`);
  const [open, setOpen] = useState(insidePillar);

  // Navigating INTO the pillar from elsewhere opens it. Keyed on
  // insidePillar (not pathname) so moving between two of its own sub-pages
  // doesn't re-fire, and a manual collapse while inside the pillar sticks.
  useEffect(() => {
    if (insidePillar) setOpen(true);
  }, [insidePillar]);

  if (subpages.length === 0) return <NavLink entry={entry} pathname={pathname} indented={false} />;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <NavLink entry={entry} pathname={pathname} indented={false} className="min-w-0 flex-1" />
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          aria-label={`${open ? "Replier" : "Déplier"} les pages ${entry.label}`}
          className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-mist/50 transition-colors hover:bg-mist/10 hover:text-mist"
        >
          <ChevronDown className={cn("size-4 transition-transform duration-[var(--motion-fast)]", open && "rotate-180")} />
        </button>
      </div>

      {open && (
        <div className="flex flex-col gap-0.5">
          {subpages.map((sub) => {
            const active = pathname === sub.href || pathname.startsWith(`${sub.href}/`);
            return (
              <Link
                key={sub.href}
                href={sub.href}
                className={cn(
                  // pl-10 lines the label up under the parent's own label
                  // (pl-3 + size-4 icon + gap-3 = 40px).
                  "flex items-center rounded-[var(--radius-control)] py-2 pr-3 pl-10 text-[12.5px] font-bold tracking-[-0.005em] transition-all duration-[var(--motion-fast)] ease-[var(--ease-out)]",
                  active ? "bg-white/10 text-white" : "text-mist/60 hover:bg-mist/10 hover:text-mist/90"
                )}
              >
                {sub.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
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
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex min-w-0 items-center gap-3 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-muted"
          >
            {avatarUrl ? (
              <div className="relative size-8 shrink-0 overflow-hidden rounded-full">
                <Image src={avatarUrl} alt="" fill sizes="32px" className="object-cover" />
              </div>
            ) : (
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-foreground">
                {initial}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-bold tracking-[-0.005em] text-foreground">
                {displayName || businessName || "Mon compte"}
              </p>
              <p className="truncate text-[11px] tracking-[-0.005em] text-muted-foreground">{email}</p>
            </div>
            <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
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

          {/* Sign-out moved in here from a bare icon button that used to sit
              beside the trigger — a destructive action reads better as a
              labelled item inside the account menu than as an unlabelled
              icon one mis-tap away from the avatar. */}
          {entries.length > 0 && <div className="my-1.5 h-px bg-border" />}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
            className="flex w-full items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 py-2 text-left text-[13px] font-bold text-state-critical transition-colors hover:bg-state-critical/10"
          >
            <LogOut className="size-4" />
            Se déconnecter
          </button>
        </PopoverContent>
      </Popover>
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
  const visibleTopBarEntries = topBarEntries.filter((entry) => isEntryVisible(entry, isOwner, permissions));

  return (
    <>
      {/* Top bar — every breakpoint now (used to be mobile-only). Spans the
          full width but the sidebar (z-40) draws over its left 256px on lg,
          so it visually starts at the sidebar's right edge — hence
          lg:pl-[17rem] (16rem sidebar + 1rem gutter), which puts the nav
          links at the far left of the bar's *visible* area instead of
          underneath the sidebar. The wordmark here is lg:hidden for the
          same reason: on desktop the logo lives in the sidebar's own
          h-18 row below, aligned to this bar's midline; on mobile the
          sidebar is off-canvas, so the bar carries the wordmark itself. */}
      <header
        className="fixed inset-x-0 top-0 z-30 flex h-18 items-center gap-3 border-b border-[color:var(--surface-dark)] bg-card px-4 text-foreground shadow-[0_2px_12px_rgba(0,0,0,0.12)] lg:pr-6 lg:pl-[17rem]"
      >
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Ouvrir le menu"
          className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-foreground transition-colors hover:bg-muted lg:hidden"
        >
          <Menu className="size-5" />
        </button>
        {/* -light is the dark-ink wordmark (the default one renders "Scale"
            in white, invisible on this now-white bar). The sidebar below
            keeps the white-ink default — it's still a dark surface. */}
        <Link href="/dashboard" className="flex items-center transition-opacity hover:opacity-80 lg:hidden">
          <Image src="/scalex-wordmark-light.png" alt="Scale X" width={398} height={100} priority className="h-7 w-auto" />
        </Link>

        {visibleTopBarEntries.map((entry) => {
          const Icon = entry.icon;
          const active = pathname === entry.href || pathname.startsWith(`${entry.href}/`);
          return (
            <Link
              key={entry.href}
              href={entry.href}
              className={cn(
                "hidden items-center gap-2 rounded-[var(--radius-control)] px-3 py-2 text-[13.5px] font-bold tracking-[-0.01em] transition-colors lg:flex",
                active ? "bg-accent text-white shadow-[0_2px_10px_var(--accent-glow)]" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="size-4" />
              {entry.label}
            </Link>
          );
        })}

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
        {/* h-18 mirrors the top bar's own height, so the wordmark's vertical
            center lands exactly on that bar's midline (36px) — the "logo
            centré à la hauteur du milieu du menu horizontal" ask. Keep the
            two in sync if either height changes. */}
        <div className="flex h-18 shrink-0 items-center justify-between px-3">
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
              {/* PillarNavGroup falls back to a plain NavLink for any entry
                  with no sub-pages, so every entry goes through it. */}
              <PillarNavGroup entry={entry} pathname={pathname} isOwner={isOwner} permissions={permissions} />
            </Fragment>
          ))}
        </nav>

        {/* Mobile mirror of the top bar: that bar is desktop-only, so
            without this its entries would be unreachable on a phone. */}
        {visibleTopBarEntries.length > 0 && (
          <div className="px-0 pt-4 lg:hidden">
            <div className="mx-3 h-px bg-white/10" />
            <nav className="flex flex-col gap-1 pt-3">
              {visibleTopBarEntries.map((entry) => (
                <NavLink key={entry.href} entry={entry} pathname={pathname} indented={false} />
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

        {/* Pinned last, below every navigable entry — it's a readout, not a
            destination, so it sits under the pages rather than between them. */}
        {scaleScore && (
          <div className="px-3 pt-4">
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
      </aside>
    </>
  );
}
