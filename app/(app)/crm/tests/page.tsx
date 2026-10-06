import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/current-user";
import { hasCrmPermission, requireCrmAccess } from "@/lib/crm/access";
import { listCrmMessageAbTests } from "@/lib/crm/message-ab-tests";
import type { CrmMessageAbTestStatus } from "@/lib/crm/message-ab-test-rules";

type SearchParams = Promise<{ status?: string }>;

function isStatus(value: string | undefined): value is CrmMessageAbTestStatus {
  return value === "active" || value === "paused" || value === "ended";
}

function statusLabel(status: CrmMessageAbTestStatus, t: Awaited<ReturnType<typeof getTranslations<"crm.messageTests">>>) {
  if (status === "active") return t("status.active");
  if (status === "paused") return t("status.paused");
  return t("status.ended");
}

function formatRate(rate: number | null, notMeasured: string, locale: string) {
  return rate === null ? notMeasured : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(rate)}%`;
}

function formatDate(date: Date, locale: string) {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(date);
}

export default async function CrmMessageTestsPage({ searchParams }: { searchParams: SearchParams }) {
  const [{ userId }, t, locale, params] = await Promise.all([
    getCurrentUser(),
    getTranslations("crm.messageTests"),
    getLocale(),
    searchParams,
  ]);
  const access = await requireCrmAccess(userId, "crm:view");
  if (!access) redirect("/dashboard");

  const tests = await listCrmMessageAbTests(access.accountId);
  const selectedStatus = isStatus(params.status) ? params.status : "active";
  const visibleTests = tests.filter((test) => test.status === selectedStatus);
  const canManage = hasCrmPermission(access, "crm:manage-message-tests");
  const tabs: CrmMessageAbTestStatus[] = ["active", "paused", "ended"];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold tracking-[0.08em] text-muted-foreground uppercase">{t("eyebrow")}</p>
          <h1 className="mt-1 text-3xl font-bold">{t("title")}</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">{t("subtitle")}</p>
        </div>
        {canManage && <Button asChild className="min-h-11"><Link href="/crm/tests/new">{t("create")}</Link></Button>}
      </div>

      <nav aria-label={t("list.filtersLabel")} className="flex gap-2 overflow-x-auto border-b border-border">
        {tabs.map((status) => (
          <Link
            key={status}
            href={`/crm/tests?status=${status}`}
            aria-current={selectedStatus === status ? "page" : undefined}
            className={`inline-flex min-h-11 shrink-0 items-center border-b-2 px-3 text-sm font-bold transition-colors ${selectedStatus === status ? "border-accent text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {statusLabel(status, t)}
            <span className="ml-2 text-xs text-muted-foreground">{tests.filter((test) => test.status === status).length}</span>
          </Link>
        ))}
      </nav>

      {visibleTests.length === 0 ? (
        <section className="sticker-card flex flex-col items-start gap-3 p-5" aria-labelledby="message-tests-empty-title">
          <h2 id="message-tests-empty-title" className="text-lg font-bold">{t("list.emptyTitle")}</h2>
          <p className="max-w-2xl text-sm text-muted-foreground">{t("list.emptyBody")}</p>
          {canManage && <Button asChild variant="outline" className="min-h-11"><Link href="/crm/tests/new">{t("create")}</Link></Button>}
        </section>
      ) : (
        <>
          <div className="sticker-card hidden overflow-x-auto md:block">
            <table className="w-full min-w-[850px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th scope="col" className="px-4 py-3 font-bold">{t("table.test")}</th>
                  <th scope="col" className="px-4 py-3 font-bold">{t("table.status")}</th>
                  <th scope="col" className="px-4 py-3 font-bold">{t("table.split")}</th>
                  <th scope="col" className="px-4 py-3 font-bold">{t("table.sent")}</th>
                  <th scope="col" className="px-4 py-3 font-bold">{t("table.rateA")}</th>
                  <th scope="col" className="px-4 py-3 font-bold">{t("table.rateB")}</th>
                  <th scope="col" className="px-4 py-3 font-bold">{t("table.started")}</th>
                  <th scope="col" className="px-4 py-3"><span className="sr-only">{t("list.viewResults")}</span></th>
                </tr>
              </thead>
              <tbody>
                {visibleTests.map((test) => (
                  <tr key={test.id} className="border-b border-border last:border-b-0">
                    <th scope="row" className="max-w-64 px-4 py-3 align-middle">
                      <Link href={`/crm/tests/${test.id}`} className="font-bold underline-offset-4 hover:underline">{test.name}</Link>
                      <span className="mt-1 block w-fit rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">{test.channel === "instagram" ? t("form.instagram") : t("form.linkedin")}</span>
                    </th>
                    <td className="px-4 py-3"><span className="rounded-full bg-muted px-2.5 py-1 text-xs font-bold">{statusLabel(test.status, t)}</span></td>
                    <td className="px-4 py-3">{t("detail.split")}</td>
                    <td className="px-4 py-3">{test.results.A.confirmedSent + test.results.B.confirmedSent}</td>
                    <td className="px-4 py-3 font-bold text-accent-2">{formatRate(test.results.A.responseRate, t("detail.notMeasured"), locale)}</td>
                    <td className="px-4 py-3 font-bold text-accent-2">{formatRate(test.results.B.responseRate, t("detail.notMeasured"), locale)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{formatDate(test.startedAt, locale)}</td>
                    <td className="px-4 py-3"><Button asChild variant="outline" className="min-h-11"><Link href={`/crm/tests/${test.id}`}>{t("list.viewResults")}</Link></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="grid gap-3 md:hidden">
            {visibleTests.map((test) => (
              <li key={test.id} className="sticker-card flex flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-bold"><Link href={`/crm/tests/${test.id}`} className="underline-offset-4 hover:underline">{test.name}</Link></h2>
                    <span className="mt-1 inline-flex rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">{test.channel === "instagram" ? t("form.instagram") : t("form.linkedin")}</span>
                  </div>
                  <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-bold">{statusLabel(test.status, t)}</span>
                </div>
                <p className="text-sm text-muted-foreground">{t("detail.split")} · {test.results.A.confirmedSent + test.results.B.confirmedSent} {t("table.sent").toLocaleLowerCase(locale)} · {t("table.started").toLocaleLowerCase(locale)} {formatDate(test.startedAt, locale)}</p>
                <p className="text-sm font-bold text-accent-2">A {formatRate(test.results.A.responseRate, t("detail.notMeasured"), locale)} · B {formatRate(test.results.B.responseRate, t("detail.notMeasured"), locale)}</p>
                <Button asChild variant="outline" className="min-h-11 w-full"><Link href={`/crm/tests/${test.id}`}>{t("list.viewResults")}</Link></Button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
