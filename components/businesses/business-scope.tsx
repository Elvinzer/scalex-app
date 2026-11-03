"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, type ComponentProps, type ReactNode } from "react";

import { businessHref, stripBusinessPrefix } from "@/lib/businesses/routing";

const BusinessScopeContext = createContext<string | null>(null);

export function BusinessScopeProvider({ businessId, children }: { businessId: string | null; children: ReactNode }) {
  return <BusinessScopeContext.Provider value={businessId}>{children}</BusinessScopeContext.Provider>;
}

export function useBusinessId(): string | null {
  return useContext(BusinessScopeContext);
}

export function useBusinessPathname(): string {
  return stripBusinessPrefix(usePathname());
}

export function BusinessLink({ href, ...props }: Omit<ComponentProps<typeof Link>, "href"> & { href: string }) {
  const businessId = useBusinessId();
  const isGlobal = href === "/businesses" || href.startsWith("/businesses/") || href === "/admin" || href.startsWith("/admin/") || href === "/sign-in";
  const target = businessId && href.startsWith("/") && !href.startsWith("//") && !isGlobal ? businessHref(businessId, href) : href;
  return <Link href={target} {...props} />;
}
