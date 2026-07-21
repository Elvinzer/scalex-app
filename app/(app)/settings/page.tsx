import { Button } from "@/components/ui/button";
import { decrypt } from "@/lib/crypto";
import { getCurrentUser, requireUserId } from "@/lib/current-user";
import { requireOwnerOrRedirect } from "@/lib/team/context";

import { ApiKeyForm } from "./api-key-form";

// Owner-only: BYOK key, Stripe Connect, billing, team & role management are
// all account-level actions, never delegable to a role — see
// lib/team/permissions.ts.
export default async function SettingsPage() {
  const userId = await requireUserId();
  await requireOwnerOrRedirect(userId);

  const { user } = await getCurrentUser();

  // Decrypted only to build a masked preview — the plaintext key is never
  // sent to the client past this point, per CLAUDE.md's BYOK rules.
  const maskedKey = user?.anthropicApiKeyEncrypted
    ? `sk-ant-...${decrypt(user.anthropicApiKeyEncrypted).slice(-4)}`
    : null;
  const keyInvalid = Boolean(user?.anthropicApiKeyInvalid);

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
        <p className="text-sm font-bold text-muted-foreground">Mon business</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Décris ton offre, ton acquisition et ta delivery pour que Scale X calcule des
          chiffres justes.
        </p>
        <Button asChild variant="outline" className="mt-4">
          <a href="/business">Modifier mon business →</a>
        </Button>
      </div>

      <div className="sticker-card p-8">
        <p className="text-sm font-bold text-muted-foreground">Clé API Anthropic (BYOK)</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Ton agent utilise toujours ta propre clé : jamais partagée, jamais affichée en
          clair.
        </p>

        {maskedKey && !keyInvalid && (
          <p className="mt-4 inline-flex items-center rounded-full bg-signal/15 px-3 py-1 font-mono text-sm font-bold text-signal">
            {maskedKey}
          </p>
        )}

        {maskedKey && keyInvalid && (
          <div className="mt-4 rounded-xl border border-state-critical/40 bg-state-critical/10 p-3">
            <p className="inline-flex items-center gap-2 font-mono text-sm font-bold text-state-critical">
              <span className="size-2 rounded-full bg-state-critical" />
              {maskedKey} — ne fonctionne plus
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Cette clé a été révoquée ou a expiré côté Anthropic. Génères-en une nouvelle
              ci-dessous pour débloquer à nouveau les insights.
            </p>
          </div>
        )}

        <div className="mt-6 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          <p className="font-bold text-foreground">Comment obtenir ta clé</p>
          <ol className="mt-2 list-decimal space-y-1 pl-4">
            <li>
              Va sur{" "}
              <a
                href="https://console.anthropic.com/settings/keys"
                target="_blank"
                rel="noreferrer"
                className="font-bold text-signal underline"
              >
                console.anthropic.com
              </a>{" "}
              et connecte-toi (ou crée un compte).
            </li>
            <li>Ajoute quelques dollars de crédit dans Billing - sans ça, l&apos;API refuse tout appel.</li>
            <li>
              Dans API Keys, clique « Create Key », donne-lui un nom (ex. « Scale X »), et copie
              la valeur qui commence par sk-ant-.
            </li>
            <li>Colle-la ci-dessous. Elle ne sera plus jamais affichée en clair une fois enregistrée.</li>
          </ol>
        </div>

        <div className="mt-6">
          <ApiKeyForm />
        </div>
      </div>

      <div className="sticker-card p-8">
        <p className="text-sm font-bold text-muted-foreground">Facturation</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Ton abonnement Scale X - nécessaire pour inviter des membres d&apos;équipe.
        </p>
        <Button asChild variant="outline" className="mt-4">
          <a href="/settings/facturation">Gérer mon abonnement →</a>
        </Button>
      </div>

      <div className="sticker-card p-8">
        <p className="text-sm font-bold text-muted-foreground">Équipe</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Invite des membres et attribue-leur des rôles (setting, closing, financier...).
        </p>
        <div className="mt-4 flex gap-3">
          <Button asChild variant="outline">
            <a href="/settings/equipe">Gérer l&apos;équipe →</a>
          </Button>
          <Button asChild variant="outline">
            <a href="/settings/roles">Rôles &amp; permissions →</a>
          </Button>
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
            <Button asChild variant="outline" className="mt-4">
              <a href="/api/stripe/connect">Connecter Stripe</a>
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
