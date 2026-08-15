import { getTranslations } from "next-intl/server";

export default async function AdminSupportLoading() {
  const t = await getTranslations("support");
  return <div className="mx-auto max-w-6xl"><p role="status" className="text-sm text-muted-foreground">{t("admin.loading")}</p></div>;
}

