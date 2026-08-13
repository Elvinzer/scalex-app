import { NextIntlClientProvider } from "next-intl";

import { MetaTouchpointCapture } from "@/components/meta-ads/meta-touchpoint-capture";
import { getRequestLocale } from "@/lib/i18n/locale";
import { loadMessagesFor } from "@/lib/i18n/messages";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const locale = await getRequestLocale();
  const messages = await loadMessagesFor(locale, ["common", "marketing", "freeDiagnostic"]);

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <MetaTouchpointCapture />
      {children}
    </NextIntlClientProvider>
  );
}
