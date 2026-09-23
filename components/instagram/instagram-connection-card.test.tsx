import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import integrationsMessages from "@/locales/fr/integrations.json";

vi.mock("@/app/(app)/integrations/instagram-actions", () => ({
  disconnectInstagram: vi.fn(),
  refreshInstagramPosts: vi.fn(),
}));

import { InstagramConnectionCard } from "./instagram-connection-card";

function renderCard(tokenUnreadable: boolean) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="fr" messages={{ integrations: integrationsMessages }}>
      <InstagramConnectionCard
        connected
        username="clubvipfinance"
        initialSyncStatus="token_unreadable"
        tokenUnreadable={tokenUnreadable}
      />
    </NextIntlClientProvider>
  );
}

describe("InstagramConnectionCard", () => {
  it("does not show a token error from a stale sync status", () => {
    expect(renderCard(false)).not.toContain(integrationsMessages.instagram.tokenUnreadable);
  });

  it("shows the token error when the current token cannot be decrypted", () => {
    expect(renderCard(true)).toContain(integrationsMessages.instagram.tokenUnreadable);
  });
});
