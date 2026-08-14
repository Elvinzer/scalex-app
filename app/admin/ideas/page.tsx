import type { Metadata } from "next";
import { Lightbulb } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { getAdminIdeas } from "@/lib/admin/ideas";
import { getRequestLocale } from "@/lib/i18n/locale";

import { AdminIdeasBoard, type AdminIdeasCopy } from "./admin-ideas-board";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.adminIdeas");
  return { title: t("title"), robots: { index: false, follow: false, nocache: true } };
}

export default async function AdminIdeasPage() {
  const t = await getTranslations("app.adminIdeas");
  const [ideas, locale] = await Promise.all([getAdminIdeas(), getRequestLocale()]);
  const copy: AdminIdeasCopy = {
    boardTitle: t("boardTitle"),
    boardHelp: t("boardHelp"),
    add: t("add"),
    ideaCount: {
      zero: t("ideaCount.zero"),
      one: t("ideaCount.one", { count: "{count}" }),
      other: t("ideaCount.other", { count: "{count}" }),
    },
    columns: {
      backlog: { title: t("columns.backlog.title"), description: t("columns.backlog.description") },
      in_progress: { title: t("columns.in_progress.title"), description: t("columns.in_progress.description") },
      completed: { title: t("columns.completed.title"), description: t("columns.completed.description") },
    },
    empty: { backlog: t("empty.backlog"), in_progress: t("empty.in_progress"), completed: t("empty.completed") },
    form: {
      title: t("form.title"),
      titleLabel: t("form.titleLabel"),
      titlePlaceholder: t("form.titlePlaceholder"),
      descriptionLabel: t("form.descriptionLabel"),
      descriptionPlaceholder: t("form.descriptionPlaceholder"),
      cancel: t("form.cancel"),
      create: t("form.create"),
      creating: t("form.creating"),
    },
    card: {
      createdAt: t("card.createdAt", { date: "{date}" }),
      dragHint: t("card.dragHint"),
      moveTo: t("card.moveTo", { status: "{status}" }),
    },
    saving: t("saving"),
    errors: {
      invalid: t("errors.invalid"),
      create_failed: t("errors.create_failed"),
      not_found: t("errors.not_found"),
      move_failed: t("errors.move_failed"),
    },
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-accent-soft text-accent-text" aria-hidden="true">
            <Lightbulb className="size-5" />
          </div>
          <div>
            <h1 className="text-[22px] leading-[1.2] font-bold tracking-[-0.01em]">{t("title")}</h1>
            <p className="mt-1 max-w-2xl text-sm leading-5 text-muted-foreground">{t("subtitle")}</p>
          </div>
        </div>
      </header>
      <AdminIdeasBoard initialIdeas={ideas} copy={copy} locale={locale === "fr" ? "fr-FR" : "en-US"} />
    </div>
  );
}
