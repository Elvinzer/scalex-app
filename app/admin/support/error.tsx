"use client";

import { useTranslations } from "next-intl";

export default function AdminSupportError() {
  const t = useTranslations("support");
  return <div className="mx-auto max-w-6xl"><p role="alert" className="sticker-card p-6 text-sm font-semibold text-state-critical">{t("admin.error")}</p></div>;
}

