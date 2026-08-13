import type { MetadataRoute } from "next";

import { getPublicSiteUrl } from "@/lib/seo/site";

const privatePaths = [
  "/dashboard",
  "/business",
  "/acquisition",
  "/ventes",
  "/diagnostic-app",
  "/datas",
  "/journal",
  "/copilote",
  "/settings",
  "/integrations",
  "/admin",
  "/onboarding",
  "/sign-in",
  "/auth",
  "/invite",
  "/e2e",
  "/api",
  "/book",
  "/r",
];

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getPublicSiteUrl();
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: privatePaths }],
    sitemap: siteUrl + "/sitemap.xml",
    host: siteUrl,
  };
}
