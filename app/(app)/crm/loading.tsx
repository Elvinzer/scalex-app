import { getTranslations } from "next-intl/server";

export default async function CrmLoading() {
  const t = await getTranslations("crm");
  return <div className="flex flex-col gap-4" role="status" aria-busy="true"><span className="sr-only">{t("activation.loadingPage")}</span><div className="h-8 w-48 animate-pulse rounded bg-muted motion-reduce:animate-none" /><div className="h-24 animate-pulse rounded-[var(--radius-card)] bg-muted motion-reduce:animate-none" /><div className="h-48 animate-pulse rounded-[var(--radius-card)] bg-muted motion-reduce:animate-none" /></div>;
}
