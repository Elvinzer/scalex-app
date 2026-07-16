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
        <h1 className="text-3xl font-semibold tracking-tight">Réglages</h1>
        <p className="mt-1 text-muted-foreground">
          Ton compte, ta clé Anthropic et tes intégrations.
        </p>
      </div>

      <div className="rounded-3xl border border-border bg-card p-8">
        <p className="text-sm font-medium text-muted-foreground">Compte</p>
        <p className="mt-2 text-lg font-medium">{user?.email}</p>
      </div>

      <div className="rounded-3xl border border-border bg-card p-8">
        <p className="text-sm font-medium text-muted-foreground">
          Clé API Anthropic (BYOK)
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Ton agent utilise toujours ta propre clé — jamais partagée, jamais affichée en
          clair.
        </p>

        {maskedKey && (
          <p className="mt-4 inline-flex items-center rounded-full bg-primary/10 px-3 py-1 font-mono text-sm text-primary">
            {maskedKey}
          </p>
        )}

        <div className="mt-6">
          <ApiKeyForm />
        </div>
      </div>

      <div className="rounded-3xl border border-border bg-card p-8">
        <p className="text-sm font-medium text-muted-foreground">Stripe</p>
        {user?.stripeConnectId ? (
          <div className="mt-2 flex items-center gap-2">
            <span className="size-2 rounded-full bg-state-healthy" />
            <p className="text-sm font-medium">Connecté — {user.stripeConnectId}</p>
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
