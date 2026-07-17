import { Button } from "@/components/ui/button";
import { decrypt } from "@/lib/crypto";
import { getCurrentUser } from "@/lib/current-user";

import { ApiKeyForm } from "./api-key-form";

export default async function SettingsPage() {
  const { user } = await getCurrentUser();

  // Decrypted only to build a masked preview — the plaintext key is never
  // sent to the client past this point, per CLAUDE.md's BYOK rules.
  const maskedKey = user?.anthropicApiKeyEncrypted
    ? `sk-ant-...${decrypt(user.anthropicApiKeyEncrypted).slice(-4)}`
    : null;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold">Réglages</h1>
        <p className="mt-1 text-muted-foreground">
          Ton compte, ta clé Anthropic et tes intégrations.
        </p>
      </div>

      <div className="sticker-card p-8">
        <p className="text-sm font-bold text-muted-foreground">Compte</p>
        <p className="mt-2 text-lg font-bold">{user?.email}</p>
      </div>

      <div className="sticker-card p-8">
        <p className="text-sm font-bold text-muted-foreground">Clé API Anthropic (BYOK)</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Ton agent utilise toujours ta propre clé : jamais partagée, jamais affichée en
          clair.
        </p>

        {maskedKey && (
          <p className="mt-4 inline-flex items-center rounded-full bg-signal/15 px-3 py-1 font-mono text-sm font-bold text-signal">
            {maskedKey}
          </p>
        )}

        <div className="mt-6">
          <ApiKeyForm />
        </div>
      </div>

      <div className="sticker-card p-8">
        <p className="text-sm font-bold text-muted-foreground">Stripe</p>
        {user?.stripeConnectId ? (
          <div className="mt-2 flex items-center gap-2">
            <span className="size-2 rounded-full bg-state-healthy" />
            <p className="text-sm font-bold">Connecté : {user.stripeConnectId}</p>
          </div>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted-foreground">
              Connecte ton compte Stripe pour lancer le diagnostic.
            </p>
            <Button asChild className="mt-4">
              <a href="/api/stripe/connect">Connecter Stripe</a>
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
