"use client";

import {
  CalendarDays,
  ChevronDown,
  ChevronsUpDown,
  Database,
  Gift,
  HeartHandshake,
  Handshake,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  Megaphone,
  MessageCircle,
  Palette,
  Plug,
  Settings,
  ShieldCheck,
  Store,
  Stethoscope,
  Users,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Fragment, useEffect, useState } from "react";

import { ScaleScoreBadge } from "@/components/scale-score-badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ScaleScoreResult } from "@/lib/diagnostic/scale-score";
import { PILLAR_SUBPAGES } from "@/lib/nav/pillar-subpages";
import type { ScaleScoreSparklinePoint } from "@/lib/scale-score-history/queries";
import { signOut } from "@/lib/supabase/client";
import { requestSupportDrawer } from "@/components/support/support-drawer";
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
  labelKey: string;
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
// tap-to-expand accordion. Ads/Closing (the former "Avancé"
// showcase modules) are deliberately set aside again — not rendered as
// tabs by their pillar layout, not linked anywhere. Copilote (below)
// replaces the old "Avancé" nav entry.
//
const topEntries: LinkEntry[] = [
  { type: "link", href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard, permission: "dashboard" },
  { type: "link", href: "/roadmap", labelKey: "roadmap", icon: CalendarDays, permission: "dashboard" },
  {
    type: "link",
    href: "/acquisition",
    labelKey: "acquisition",
    icon: Megaphone,
    // All current Acquisition sub-page permissions (matches
    // lib/nav/pillar-subpages.ts). Pipeline remains owned by the Vente pillar.
    anyOfPermissions: ["acquisition:contenu", "acquisition:mail", "acquisition:ads"],
  },
  {
    type: "link",
    href: "/ventes",
    labelKey: "sales",
    icon: Handshake,
    // Pipeline keeps its acquisition-scoped permission key so existing team
    // roles retain access after the navigation move.
    anyOfPermissions: [
      "acquisition:pipeline",
      "acquisition:setters",
      "ventes:suivi",
      "ventes:appels",
      "ventes:closing",
    ],
  },
  {
    type: "link",
    href: "/delivrabilite",
    labelKey: "deliverability",
    icon: HeartHandshake,
    anyOfPermissions: ["delivrabilite:suivi-client", "delivrabilite:temoignages"],
  },
  { type: "link", href: "/datas", labelKey: "data", icon: Database, permission: "datas" },
  { type: "link", href: "/diagnostic-app", labelKey: "diagnostic", icon: Stethoscope, permission: "diagnostic" },
  // Hub central des conversations avec les agents Falco (app/(app)/copilote/) —
  // même permission que le Copilote partout ailleurs dans l'app.
  { type: "link", href: "/copilote", labelKey: "copilot", icon: MessageCircle, permission: "diagnostic" },
];

const mobileNavEntries = [
  { type: "link", href: "/dashboard", labelKey: "dashboard", mobileLabelKey: "dashboard", icon: LayoutDashboard, permission: "dashboard" },
  { type: "link", href: "/roadmap", labelKey: "roadmap", mobileLabelKey: "roadmap", icon: CalendarDays, permission: "dashboard" },
  { type: "link", href: "/datas", labelKey: "data", mobileLabelKey: "data", icon: Database, permission: "datas" },
  { type: "link", href: "/ventes", labelKey: "sales", mobileLabelKey: "sales", icon: Handshake, anyOfPermissions: ["acquisition:pipeline", "acquisition:setters", "ventes:suivi", "ventes:appels", "ventes:closing"] },
  { type: "link", href: "/diagnostic-app", labelKey: "diagnostic", mobileLabelKey: "diagnostic", icon: Stethoscope, permission: "diagnostic" },
] satisfies Array<LinkEntry & { mobileLabelKey: string }>;

// COMPTE — account-level settings behind the avatar/profile dropdown
// (ProfileMenu). Mon business is a primary destination now because offers and
// upsell configuration are core product work, not secondary account settings.
const profileMenuEntries: LinkEntry[] = [
  { type: "link", href: "/business", labelKey: "business", icon: Store, permission: "business" },
  { type: "link", href: "/settings/equipe", labelKey: "team", icon: Users },
  { type: "link", href: "/settings/calendars", labelKey: "calendars", icon: CalendarDays, permission: "ventes:rdv" },
  { type: "link", href: "/settings/reservation", labelKey: "reservation", icon: Palette },
  { type: "link", href: "/settings", labelKey: "settings", icon: Settings },
  { type: "link", href: "/integrations", labelKey: "integrations", icon: Plug },
  { type: "link", href: "/parrainage", labelKey: "referral", icon: Gift },
];

// Separate from the permission model entirely — gated by isAdmin (the
// ADMIN_EMAILS allowlist, see lib/admin.ts), not by role/permission or even
// isOwner. Only ever true for founders, and categorically different from
// "my account" (it manages every customer, not this one) — rendered as its
// own tiny pinned link at the bottom of the sidebar rather than folded into
// the account dropdown. app/admin/layout.tsx still does its own
// server-side check regardless of this link being visible.
const adminEntry: LinkEntry = { type: "link", href: "/admin", labelKey: "admin", icon: ShieldCheck };

const subpageLabelKeys: Record<string, string> = {
  "/acquisition/contenu": "content",
  "/acquisition/mail": "mail",
  "/ventes/pipeline": "pipeline",
  "/acquisition/ads": "ads",
  "/ventes/suivi": "salesTracking",
  "/ventes/appels": "callsTracking",
  "/ventes/rdv": "appointments",
  "/delivrabilite/suivi-client": "clientTracking",
  "/delivrabilite/temoignages": "testimonials",
};

function getSubpageLabelKey(href: string): string {
  return subpageLabelKeys[href] ?? href;
}

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
  const t = useTranslations("navigation");
  const active = pathname === entry.href || pathname.startsWith(`${entry.href}/`);
  const activeClassName =
    entry.href === "/copilote"
      ? "bg-accent-2 text-white shadow-[0_2px_10px_var(--accent-2-glow)]"
      : "bg-accent text-foreground shadow-[0_2px_10px_var(--accent-glow)]";

  return (
    <Link
      href={entry.href}
      prefetch={false}
      className={cn(
        "flex min-h-11 min-w-0 cursor-pointer items-center gap-3 whitespace-normal break-words rounded-[var(--radius-control)] py-2.5 pr-3 font-bold transition-all duration-[var(--motion-fast)] ease-[var(--ease-out)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-2",
        indented ? "pl-7 text-[13px] tracking-[-0.005em]" : "pl-3 text-[13.5px] tracking-[-0.01em]",
        active ? activeClassName : "text-white hover:translate-x-0.5 hover:bg-mist/10",
        className
      )}
      aria-current={active ? "page" : undefined}
    >
      <Icon className="size-4 shrink-0" />
      <span className="min-w-0 whitespace-normal break-words">{t(entry.labelKey)}</span>
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
  const t = useTranslations("navigation");
  const staticSubpages = (PILLAR_SUBPAGES[entry.href] ?? [])
    .filter((sub) => isOwner || permissions.includes(sub.permission))
    .filter((sub) => !topEntries.some((topEntry) => topEntry.href === sub.href))
    .map((sub) => ({ href: sub.href, label: t(getSubpageLabelKey(sub.href)) }));
  const subpages = staticSubpages;
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
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-center gap-1">
        <NavLink entry={entry} pathname={pathname} indented={false} className="min-w-0 flex-1" />
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          aria-label={t(open ? "collapsePages" : "expandPages", { label: t(entry.labelKey) })}
          className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-control)] text-mist/50 transition-colors hover:bg-mist/10 hover:text-mist focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-2"
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
                prefetch={false}
                className={cn(
                  // pl-10 lines the label up under the parent's own label
                  // (pl-3 + size-4 icon + gap-3 = 40px).
                  "flex min-h-11 min-w-0 cursor-pointer items-center whitespace-normal break-words rounded-[var(--radius-control)] py-2 pr-3 pl-10 text-[12.5px] font-bold tracking-[-0.005em] transition-all duration-[var(--motion-fast)] ease-[var(--ease-out)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-2",
                  active ? "bg-white/10 text-white" : "text-mist/60 hover:bg-mist/10 hover:text-mist/90"
                )}
                aria-current={active ? "page" : undefined}
              >
                <span className="min-w-0 whitespace-normal break-words">
                  {sub.label}
                </span>
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
  businessCompletionCount,
  supportHasUnseenActivity,
}: {
  businessName: string;
  displayName: string | null;
  avatarUrl: string | null;
  email: string;
  isOwner: boolean;
  permissions: readonly PermissionKey[];
  onSignOut: () => void;
  businessCompletionCount: number;
  supportHasUnseenActivity: boolean;
}) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("navigation");
  const supportT = useTranslations("support");
  const initial = email.charAt(0).toUpperCase() || "?";
  const entries = profileMenuEntries.filter((entry) => isEntryVisible(entry, isOwner, permissions));

  return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex min-h-11 w-full min-w-0 max-w-full cursor-pointer items-center gap-3 rounded-xl px-2 py-1.5 text-left text-mist transition-colors hover:bg-mist/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-2"
          >
            {avatarUrl ? (
              <div className="relative size-8 shrink-0 overflow-hidden rounded-full">
                <Image src={avatarUrl} alt="" fill sizes="32px" className="object-cover" />
              </div>
            ) : (
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-mist/15 text-xs font-bold text-mist">
                {initial}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="whitespace-normal break-words text-[12.5px] font-bold tracking-[-0.005em] text-mist">
                {displayName || businessName || t("account")}
              </p>
              <p className="whitespace-normal break-all text-[11px] tracking-[-0.005em] text-mist/60">{email}</p>
            </div>
            <ChevronsUpDown className="size-3.5 shrink-0 text-mist/60" />
          </button>
        </PopoverTrigger>
        <PopoverContent side="top" align="start" sideOffset={10} className="w-56 p-1.5">
          {entries.length > 0 && <p className="px-2.5 pb-1 pt-2 text-[10px] font-bold tracking-[0.08em] text-muted-foreground uppercase">{t("configuration")}</p>}
          {entries.map((entry) => {
            const Icon = entry.icon;
            return (
              <Link
                key={entry.href}
                href={entry.href}
                onClick={() => setOpen(false)}
                className="flex min-w-0 items-center gap-2.5 whitespace-normal break-words rounded-[var(--radius-control)] px-2.5 py-2 text-[13px] font-bold text-foreground transition-colors hover:bg-muted"
              >
                <Icon className="size-4 text-muted-foreground" />
                <span className="min-w-0 whitespace-normal break-words">{t(entry.labelKey)}</span>
                {entry.href === "/business" && businessCompletionCount > 0 && (
                  <span className="ml-auto rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-bold text-accent-text">{businessCompletionCount} {t("completeCount")}</span>
                )}
              </Link>
            );
          })}

          <div className="my-1.5 h-px bg-border" />
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              requestSupportDrawer();
            }}
            className="flex min-h-11 w-full items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 py-2 text-left text-[13px] font-bold text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-2"
          >
            <LifeBuoy className="size-4 text-muted-foreground" />
            <span className="min-w-0 flex-1">{supportT("nav.helpAndSupport")}</span>
            {supportHasUnseenActivity && (
              <span
                className="size-2 shrink-0 rounded-full bg-accent"
                title={supportT("nav.unseenActivity")}
                aria-label={supportT("nav.unseenActivity")}
              />
            )}
          </button>

          {/* Sign-out moved in here from a bare icon button that used to sit
              beside the trigger — a destructive action reads better as a
              labelled item inside the account menu than as an unlabelled
              icon one mis-tap away from the avatar. */}
          <div className="my-1.5 h-px bg-border" />
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
            className="flex w-full items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 py-2 text-left text-[13px] font-bold text-state-critical transition-colors hover:bg-state-critical/10"
          >
            <LogOut className="size-4" />
            {t("signOut")}
          </button>
        </PopoverContent>
      </Popover>
  );
}

export type AppSidebarProps = {
  email: string;
  businessName: string;
  displayName: string | null;
  avatarUrl: string | null;
  isOwner: boolean;
  permissions: readonly PermissionKey[];
  isAdmin: boolean;
  businessCompletionCount: number;
  scaleScore: ScaleScoreResult | null;
  scaleScoreGapText: string | null;
  scaleScoreMonthNote: string | null;
  scaleScoreDelta7d: number | null;
  scaleScoreDelta30d: number | null;
  scaleScoreSparkline: ScaleScoreSparklinePoint[];
  currentMonthlyRevenue: number | null;
  potentialMonthlyRevenue: number | null;
  supportHasUnseenActivity: boolean;
};

export function AppSidebar({
  email,
  businessName,
  displayName,
  avatarUrl,
  isOwner,
  permissions,
  isAdmin,
  businessCompletionCount,
  scaleScore,
  scaleScoreGapText,
  scaleScoreMonthNote,
  scaleScoreDelta7d,
  scaleScoreDelta30d,
  scaleScoreSparkline,
  currentMonthlyRevenue,
  potentialMonthlyRevenue,
  supportHasUnseenActivity,
}: AppSidebarProps) {
  const t = useTranslations("navigation");
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  async function handleSignOut() {
    await signOut();
    router.push("/sign-in");
    router.refresh();
  }

  const visibleTopEntries = topEntries.filter((entry) => isEntryVisible(entry, isOwner, permissions));
  const mobileEntries = mobileNavEntries.filter((entry) => isEntryVisible(entry, isOwner, permissions));
  const mobilePageTitle = mobileEntries.find((entry) => pathname === entry.href || pathname.startsWith(`${entry.href}/`));

  return (
    <>
      {/* Mobile-only app chrome. On desktop the sidebar owns the complete
          navigation and there is no empty horizontal bar above the content. */}
      <header
        className="fixed top-0 right-0 left-0 z-50 flex h-20 min-w-0 items-center gap-3 border-b border-border bg-card/95 px-3 text-foreground shadow-sm backdrop-blur-sm md:hidden"
      >
        <button
          type="button"
          aria-controls="app-navigation"
          aria-expanded={mobileOpen}
          aria-label={mobileOpen ? t("closeNavigation") : t("openNavigation")}
          onClick={() => setMobileOpen((open) => !open)}
          className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-control)] text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-2 md:hidden"
        >
          {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>

        <div className="flex min-w-0 items-center gap-2 md:hidden">
          <Image src="/minaly-wordmark.png" alt={t("logoAlt")} width={1536} height={600} priority className="mt-5 mb-3 h-auto w-[112px] max-w-full object-contain object-left" />
          <span className="truncate text-sm font-bold">{mobilePageTitle ? t(mobilePageTitle.mobileLabelKey) : t("logoAlt")}</span>
        </div>

      </header>

      {mobileOpen && (
        <button
          type="button"
          aria-label={t("closeNavigation")}
          onClick={() => setMobileOpen(false)}
          className="glass-overlay fixed inset-0 z-30 md:hidden"
        />
      )}

      {/* Full-height fixed rail. It stays visible on desktop and becomes an
          overlay drawer on small screens so the product content remains
          usable without sacrificing the primary navigation. */}
      <aside
        id="app-navigation"
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col overflow-hidden px-3 pb-7 text-mist shadow-[4px_0_24px_rgba(0,0,0,0.12)] transition-transform duration-[var(--motion-fast)] ease-[var(--ease-out)] md:translate-x-0",
          mobileOpen ? "translate-x-0 max-md:visible" : "-translate-x-full max-md:pointer-events-none max-md:invisible"
        )}
        style={{ background: "var(--gradient-dark)" }}
      >
        {/* The taller brand area gives the wordmark breathing room above and
            below without changing the navigation item's touch targets. */}
        <div className="flex h-24 shrink-0 items-center px-3">
          <Link href="/dashboard" prefetch={false} className="flex items-center transition-opacity hover:opacity-80">
            <Image src="/minaly-wordmark.png" alt={t("logoAlt")} width={1536} height={600} priority className="mt-5 mb-3 h-auto w-[140px] max-w-full object-contain object-left" />
          </Link>
        </div>

        <nav aria-label={t("primaryNavigation")} className="scrollbar-hidden flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain pt-6">
          {visibleTopEntries.map((entry) => (
            <Fragment key={entry.href}>
              {/* PillarNavGroup falls back to a plain NavLink for any entry
                  with no sub-pages, so every entry goes through it. */}
              {entry.href === "/copilote" ? (
                // Kept behind a rule — Copilote is a mode, not a section of
                // the product — but inside the scrollable nav, directly under
                // Diagnostic, rather than pinned to the foot of the rail.
                <div className="mt-2 border-t border-sidebar-border pt-3">
                  <PillarNavGroup entry={entry} pathname={pathname} isOwner={isOwner} permissions={permissions} />
                </div>
              ) : (
                <PillarNavGroup entry={entry} pathname={pathname} isOwner={isOwner} permissions={permissions} />
              )}
            </Fragment>
          ))}
        </nav>

        <div className="shrink-0">
          {isAdmin && (
            <div className="px-3 pt-2">
              <Link
                href={adminEntry.href}
                prefetch={false}
                className="flex min-h-10 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] px-2.5 py-1.5 text-[10.5px] font-bold tracking-[0.06em] text-mist/35 uppercase transition-colors hover:bg-mist/10 hover:text-mist/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-2"
              >
                <ShieldCheck className="size-3.5" />
                <span className="min-w-0 whitespace-normal break-words">{t(adminEntry.labelKey)}</span>
              </Link>
            </div>
          )}

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

          <div className="mt-4 border-t border-sidebar-border pt-3">
            <ProfileMenu
              businessName={businessName}
              displayName={displayName}
              avatarUrl={avatarUrl}
              email={email}
              isOwner={isOwner}
              permissions={permissions}
              onSignOut={handleSignOut}
              businessCompletionCount={businessCompletionCount}
              supportHasUnseenActivity={supportHasUnseenActivity}
            />
          </div>
        </div>
      </aside>

      <nav aria-label={t("mobileNavigation")} className="fixed inset-x-0 bottom-0 z-50 grid border-t border-border bg-card/95 px-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_20px_rgba(22,21,15,0.08)] backdrop-blur-sm md:hidden" style={{ gridTemplateColumns: `repeat(${Math.max(mobileEntries.length, 1)}, minmax(0, 1fr))` }}>
        {mobileEntries.map((entry) => {
          const Icon = entry.icon;
          const active = pathname === entry.href || pathname.startsWith(`${entry.href}/`);
          return (
            <Link
              key={entry.href}
              href={entry.href}
              prefetch={false}
              aria-current={active ? "page" : undefined}
              className={cn("flex min-h-16 flex-col items-center justify-center gap-1 rounded-[var(--radius-control)] text-[10px] font-bold transition-colors", active ? (entry.href === "/copilote" ? "text-accent-2" : "text-accent") : "text-muted-foreground")}
            >
              <Icon className="size-4" aria-hidden="true" />
              {t(entry.mobileLabelKey)}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
