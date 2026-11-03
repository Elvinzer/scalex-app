import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getRequestLocale } from "@/lib/i18n/locale";
import { loadMessagesFor } from "@/lib/i18n/messages";

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default async function InviteLayout({ children }: { children: React.ReactNode }) {
  const locale = await getRequestLocale();
  const messages = await loadMessagesFor(locale, ["billing"]);
  return <NextIntlClientProvider locale={locale} messages={messages}>{children}</NextIntlClientProvider>;
}
