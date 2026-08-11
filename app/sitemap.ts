import type { MetadataRoute } from "next";

import { getPublicSiteUrl } from "@/lib/seo/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getPublicSiteUrl();
  const pages = [
    { path: "/", priority: 1, changeFrequency: "weekly" as const },
    { path: "/ressources/coach-business-scaling", priority: 0.9, changeFrequency: "monthly" as const },
    { path: "/politique-de-confidentialite", priority: 0.2, changeFrequency: "yearly" as const },
  ];

  return pages.map(({ path, priority, changeFrequency }) => ({
    url: siteUrl + path,
    changeFrequency,
    priority,
  }));
}
