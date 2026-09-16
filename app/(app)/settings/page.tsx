import { AlertTriangle } from "lucide-react";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { tryDecrypt } from "@/lib/crypto";
import { getCurrentUser, requireUserId } from "@/lib/current-user";
import { requireOwnerOrRedirect } from "@/lib/team/context";
import { getRequestLocale, getStoredUserLocale } from "@/lib/i18n/locale";
import { getTranslations } from "next-intl/server";

import { ApiKeyForm } from "./api-key-form";
import { DangerZoneForm } from "./danger-zone-form";
import { FalcoPreferencesForm } from "./falco-preferences-form";
import { LanguageForm } from "./language-form";
import { ProfileForm } from "./profile-form";
import { ThemePreferenceForm } from "./theme-preference-form";

// Owner-only: BYOK key, Stripe Connect, billing, team & role management are
// all account-level actions, never delegable to a role — see
// lib/team/permissions.ts.
export default async function SettingsPage() {
  const userId = await requireUserId();
  await requireOwnerOrRedirect(userId);

  const { user } = await getCurrentUser();

  // Decrypted only to build a masked preview — the plaintext key is never
  // sent to the client past this point, per CLAUDE.md's BYOK rules.
  // tryDecrypt (non-throwing) : si l'ENCRYPTION_KEY a changé depuis le
  // chiffrement, une clé illisible ne doit pas casser toute la page /settings —
  // on bascule sur un état "à re-saisir" plutôt qu'un 500.
  const decryptedKey = user?.anthropicApiKeyEncrypted ? tryDecrypt(user.anthropicApiKeyEncrypted) : null;
  const maskedKey = decryptedKey ? `sk-ant-...${decryptedKey.slice(-4)}` : null;
  const keyUnreadable = Boolean(user?.anthropicApiKeyEncrypted) && decryptedKey === null;
  const keyInvalid = Boolean(user?.anthropicApiKeyInvalid);

  // storedLocale === null marks an account that predates the language choice:
  // it keeps French and gets the dismissable note, never a replayed onboarding.
  const [resolvedLocale, storedLocale, tPreferences, tPage, tBooking] = await Promise.all([
    getRequestLocale(),
    getStoredUserLocale(),
    getTranslations("settings.preferences"),
    getTranslations("settings.page"),
    getTranslations("app.booking.customization"),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold">{tPage("title")}</h1>
        <p className="mt-1 text-muted-foreground">{tPage("subtitle")}</p>
      </div>

      <nav aria-label={tPage("quickNav")} className="sticky top-20 z-10 -mx-1 flex gap-1 overflow-x-auto rounded-[var(--radius-control)] border border-border bg-background/95 p-1 backdrop-blur-sm md:top-6">
        {(["profile", "business", "booking", "anthropicKey", "billing", "team", "integrations", "crmModule", "deleteData"] as const).map((section) => <a key={section} href={`#settings-${section}`} className="min-h-11 shrink-0 rounded-[var(--radius-control)] px-3 py-2.5 text-sm font-bold text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent-2">{tPage(`sections.${section}`)}</a>)}
      </nav>

      <div id="settings-account" className="sticker-card p-8">
        <p className="text-sm font-bold text-muted-foreground">{tPage("account")}</p>
        <p className="mt-2 text-lg font-bold">{user?.email}</p>
      </div>

      <div id="settings-profile" className="sticker-card p-8">
        <p className="text-sm font-bold text-muted-foreground">{tPage("profile")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{tPage("profileHelp")}</p>
        <div className="mt-4">
          <ProfileForm userId={userId} initialDisplayName={user?.displayName ?? null} initialAvatarUrl={user?.avatarUrl ?? null} />
        </div>
        <div className="mt-6 border-t border-border pt-6">
          <FalcoPreferencesForm initialReduceAnimations={user?.reduceFalcoAnimations ?? false} />
        </div>
      </div>

      <div id="settings-preferences" className="sticker-card p-8">
        <p className="text-sm font-bold text-muted-foreground">{tPreferences("title")}</p>
        <div className="mt-4">
          <LanguageForm initialLocale={resolvedLocale} showNewLanguageNotice={storedLocale === null} />
        </div>
        <div className="mt-6 border-t border-border pt-6">
          <ThemePreferenceForm initialPreference={user?.themePreference ?? "light"} />
        </div>
      </div>

      <div id="settings-business" className="sticker-card p-8">
        <p className="text-sm font-bold text-muted-foreground">{tPage("business")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{tPage("businessHelp")}</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/business" prefetch={true}>{tPage("editBusiness")}</Link>
        </Button>
      </div>

      <div id="settings-booking" className="sticker-card p-8">
        <p className="text-sm font-bold text-muted-foreground">{tBooking("title")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{tBooking("subtitle")}</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/settings/reservation" prefetch={true}>{tBooking("preview")}</Link>
        </Button>
      </div>

      <div id="settings-anthropicKey" className="sticker-card p-8">
        <p className="text-sm font-bold text-muted-foreground">{tPage("anthropicKey")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{tPage("anthropicKeyHelp")}</p>

        {maskedKey && !keyInvalid && (
          <p className="mt-4 inline-flex items-center rounded-full bg-signal/15 px-3 py-1 font-mono text-sm font-bold text-accent-text">
            {maskedKey}
          </p>
        )}

        {maskedKey && keyInvalid && (
          <div className="mt-4 rounded-xl border border-state-critical/40 bg-state-critical/10 p-3">
            <p className="inline-flex items-center gap-2 font-mono text-sm font-bold text-state-critical">
              <AlertTriangle className="size-4 shrink-0" />
              {maskedKey} : {tPage("keyInvalidLabel")}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {tPage("keyInvalid")}
            </p>
          </div>
        )}

        {keyUnreadable && (
          <div className="mt-4 rounded-xl border border-state-critical/40 bg-state-critical/10 p-3">
            <p className="inline-flex items-center gap-2 text-sm font-bold text-state-critical">
              <AlertTriangle className="size-4 shrink-0" />
              {tPage("keyUnreadableTitle")}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {tPage("keyUnreadable")}
            </p>
          </div>
        )}

        <div className="mt-6 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          <p className="font-bold text-foreground">{tPage("getKey")}</p>
          <ol className="mt-2 list-decimal space-y-1 pl-4">
            <li>
              {tPage("getKeyStep1")}{" "}
              <a
                href="https://console.anthropic.com/settings/keys"
                target="_blank"
                rel="noreferrer"
                className="font-bold text-accent-text underline"
              >
                console.anthropic.com
              </a>{" "}{tPage("getKeyStep1End")}
            </li>
            <li>{tPage("getKeyStep2")}</li>
            <li>
              {tPage("getKeyStep3")}
            </li>
            <li>{tPage("getKeyStep4")}</li>
          </ol>
        </div>

        <div className="mt-6">
          <ApiKeyForm />
        </div>
      </div>

      <div id="settings-billing" className="sticker-card p-8">
        <p className="text-sm font-bold text-muted-foreground">{tPage("billing")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{tPage("billingHelp")}</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/settings/facturation" prefetch={true}>{tPage("manageBilling")}</Link>
        </Button>
      </div>

      <div id="settings-team" className="sticker-card p-8">
        <p className="text-sm font-bold text-muted-foreground">{tPage("team")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{tPage("teamHelp")}</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/settings/equipe" prefetch={true}>{tPage("manageTeam")}</Link>
        </Button>
      </div>

      <div id="settings-integrations" className="sticker-card p-8">
        <p className="text-sm font-bold text-muted-foreground">{tPage("integrations")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{tPage("integrationsHelp")}</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/integrations" prefetch={true}>{tPage("viewIntegrations")}</Link>
        </Button>
      </div>

      <div id="settings-crmModule" className="sticker-card p-8">
        <p className="text-sm font-bold text-muted-foreground">{tPage("crmModule")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{tPage("crmModuleHelp")}</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/settings/modules/crm" prefetch={true}>{tPage("manageCrm")}</Link>
        </Button>
      </div>

      <div id="settings-deleteData" className="sticker-card border-state-critical/30 p-8">
        <p className="text-sm font-bold text-state-critical">{tPage("deleteData")}</p>
        <div className="mt-4">
          <DangerZoneForm email={user?.email ?? ""} />
        </div>
      </div>
    </div>
  );
}
