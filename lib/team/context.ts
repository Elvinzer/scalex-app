import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { cache } from "react";
import { db } from "@/db";
import { businesses, teamMemberRoles, teamMembers, teamRoles, users } from "@/db/schema";
import { getBusinessEntitlement, getBusinessMemberEntitlement, type BusinessEntitlement } from "@/lib/businesses/entitlements";
import { listUserBusinesses } from "@/lib/businesses/queries";
import { getSelectedBusinessId } from "@/lib/businesses/request";
import { businessHref, businessIdSchema, PATHNAME_HEADER } from "@/lib/businesses/routing";
import { expandPermissionKeys, type PermissionKey } from "@/lib/team/permissions";

export type BusinessAccessOptions = { businessId?: string; allowSuspended?: boolean };
type BusinessContext = {
  accountId: string; businessId: string; businessName: string; ownerEmail: string;
  advancedModulesEnabled: boolean; crmEnabled: boolean; onboardingCompleted: boolean;
  entitlement: BusinessEntitlement;
};
export type AccountContext = BusinessContext & (
  | { isOwner: true; permissions: "all" }
  | { isOwner: false; permissions: Set<string> }
);

const MEMBER_LANDING_ROUTES: readonly { permission: PermissionKey; href: string }[] = [
  { permission: "dashboard", href: "/dashboard" },
  { permission: "crm:view", href: "/crm" },
  { permission: "acquisition:pipeline", href: "/crm/pipeline" },
  { permission: "acquisition:setters", href: "/settings/equipe" },
  { permission: "ventes:suivi", href: "/ventes/suivi" },
  { permission: "ventes:appels", href: "/crm/appels" },
  { permission: "ventes:rdv", href: "/ventes/rdv" },
  { permission: "delivrabilite:suivi-client", href: "/delivrabilite/suivi-client" },
  { permission: "delivrabilite:temoignages", href: "/delivrabilite/temoignages" },
  { permission: "acquisition:contenu", href: "/acquisition/contenu" },
  { permission: "acquisition:mail", href: "/acquisition/mail" },
  { permission: "acquisition:ads", href: "/acquisition/ads" },
  { permission: "diagnostic", href: "/diagnostic-app" },
  { permission: "datas", href: "/datas" },
  { permission: "business", href: "/business" },
];

export function getDefaultAppRoute(context: AccountContext | null): string {
  if (!context) return "/businesses/new";
  if (!context.entitlement.active) return context.isOwner ? "/settings/facturation" : "/businesses";
  if (context.isOwner) return "/dashboard";
  return MEMBER_LANDING_ROUTES.find(({ permission }) => context.permissions.has(permission))?.href ?? "/roadmap";
}

export function resolvePostAuthRoute(context: AccountContext | null, onboardingCompleted: boolean): string {
  if (!context || !context.entitlement.active || !context.isOwner) return getDefaultAppRoute(context);
  return onboardingCompleted ? "/dashboard" : "/onboarding";
}

export async function getPostAuthDestination(userId: string): Promise<string> {
  const available = await listUserBusinesses(userId);
  const selected = await getSelectedBusinessId();
  const id = selected ?? available.find((business) => business.active)?.id ?? available[0]?.id;
  if (!id) return "/businesses/new";
  const context = await getAccountContext(userId, { businessId: id, allowSuspended: true });
  if (!context) return "/businesses";
  return businessHref(id, resolvePostAuthRoute(context, context.onboardingCompleted));
}

// Request-scoped cache only: the same actor can have concurrent requests in A and B.
const fetchAccountContext = cache(async (userId: string, businessId: string, allowSuspended: boolean): Promise<AccountContext | null> => {
  const [business] = await db.select({
    id: businesses.id, ownerUserId: businesses.ownerUserId, name: businesses.name,
    advancedModulesEnabled: businesses.advancedModulesEnabled, crmEnabled: businesses.crmEnabled,
    onboardingCompleted: businesses.onboardingCompleted, ownerEmail: users.email,
  }).from(businesses).innerJoin(users, eq(users.id, businesses.ownerUserId)).where(eq(businesses.id, businessId)).limit(1);
  if (!business) return null;
  const isOwner = business.ownerUserId === userId;
  const [membership] = isOwner ? [] : await db.select({ id: teamMembers.id }).from(teamMembers)
    .where(and(eq(teamMembers.accountId, businessId), eq(teamMembers.memberUserId, userId), eq(teamMembers.status, "active"))).limit(1);
  if (!isOwner && !membership) return null;
  const entitlement = await (isOwner ? getBusinessEntitlement(businessId) : getBusinessMemberEntitlement(businessId));
  if (!allowSuspended && !entitlement.active) return null;
  const common = { accountId: businessId, businessId, businessName: business.name, ownerEmail: business.ownerEmail,
    advancedModulesEnabled: business.advancedModulesEnabled, crmEnabled: business.crmEnabled,
    onboardingCompleted: business.onboardingCompleted, entitlement };
  if (isOwner) return { ...common, isOwner: true, permissions: "all" };
  const roles = await db.select({ permissions: teamRoles.permissions }).from(teamMemberRoles)
    .innerJoin(teamRoles, and(eq(teamMemberRoles.roleId, teamRoles.id), eq(teamRoles.accountId, businessId)))
    .where(eq(teamMemberRoles.teamMemberId, membership.id));
  return { ...common, isOwner: false, permissions: expandPermissionKeys(roles.flatMap((role) => role.permissions)) };
});

export async function getAccountContext(userId: string, options: BusinessAccessOptions = {}): Promise<AccountContext | null> {
  const selected = options.businessId ?? await getSelectedBusinessId();
  if (selected) {
    const parsed = businessIdSchema.safeParse(selected);
    return parsed.success ? fetchAccountContext(userId, parsed.data, options.allowSuspended === true) : null;
  }
  // Unscoped API requests cannot silently select a different business.
  const path = (await headers()).get(PATHNAME_HEADER);
  if (path?.startsWith("/api/")) return null;
  const choices = await listUserBusinesses(userId);
  const initial = choices.find((business) => business.active) ?? choices[0];
  return initial ? fetchAccountContext(userId, initial.id, options.allowSuspended === true) : null;
}

export async function requirePermission(userId: string, key: PermissionKey, options: BusinessAccessOptions = {}): Promise<{ accountId: string } | null> {
  const context = await getAccountContext(userId, options);
  if (!context) return null;
  return context.isOwner || context.permissions.has(key) ? { accountId: context.accountId } : null;
}

export async function requireOwner(userId: string, options: BusinessAccessOptions = {}): Promise<{ accountId: string } | null> {
  const context = await getAccountContext(userId, options);
  return context?.isOwner ? { accountId: context.accountId } : null;
}

export async function requirePermissionOrRedirect(userId: string, key: PermissionKey, redirectTo?: string, options: BusinessAccessOptions = {}): Promise<{ accountId: string }> {
  const access = await requirePermission(userId, key, options);
  if (!access) {
    const context = await getAccountContext(userId, { ...options, allowSuspended: true });
    const path = redirectTo ?? getDefaultAppRoute(context);
    redirect(context ? businessHref(context.accountId, path) : "/businesses");
  }
  return access;
}

export async function requireOwnerOrRedirect(userId: string, redirectTo = "/dashboard", options: BusinessAccessOptions = {}): Promise<{ accountId: string }> {
  const access = await requireOwner(userId, options);
  if (!access) {
    const context = await getAccountContext(userId, { ...options, allowSuspended: true });
    const path = context && !context.entitlement.active ? getDefaultAppRoute(context) : redirectTo;
    redirect(context ? businessHref(context.accountId, path) : "/businesses");
  }
  return access;
}
