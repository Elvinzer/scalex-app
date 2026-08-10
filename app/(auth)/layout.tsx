import { NextIntlClientProvider } from "next-intl";
import { getRequestLocale } from "@/lib/i18n/locale";
import { loadMessagesFor } from "@/lib/i18n/messages";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const locale = await getRequestLocale();
  const messages = await loadMessagesFor(locale, ["common", "auth"]);
  return <NextIntlClientProvider locale={locale} messages={messages}>{children}</NextIntlClientProvider>;
}
