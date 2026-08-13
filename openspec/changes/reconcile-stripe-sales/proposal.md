# Réconciliation Stripe → Suivi des ventes

## Why

Le Suivi des ventes n'affiche **aucune transaction Stripe**. La sync Stripe
(`lib/stripe/sync-write.ts`) n'écrit que des **agrégats mensuels** dans
`monthly_metrics` ; elle ne crée jamais de ligne dans la table `sales`, qui
n'est alimentée que par la saisie manuelle, iClosed/Calendly et le pipeline.
Résultat : Stripe est « connecté et synchronisé », mais la page reste vide — et
la copie « synchronisation automatique active » laisse croire le contraire.

Le seul pont Stripe → `sales` qui existe (`lib/stripe/failed-payments.ts`) ne
traite que les charges **échouées** et jette silencieusement toute charge
réussie non rattachée. Il manque donc : la prise en compte des paiements réussis,
la création des ventes absentes, la gestion des abonnements et des remboursements,
et l'affichage transaction par transaction avec le reste à payer.

## What Changes

### Données & réconciliation (le cœur du fix — zones sensibles)

- **Sync étendue aux charges `succeeded`** (aujourd'hui : `failed` uniquement),
  branchée dans le job Inngest `sync-stripe-account`, idempotente (une charge déjà
  vue via `stripeChargeId` est ignorée).
- **Merge auto** : une charge cherche d'abord un deal existant par email + montant.
  Match → complète l'échéance (payé / échoué). Aucun match → **crée le deal**
  (`source = "stripe"`), nature détectée.
- **Garde-fou anti-faux-merge** : si plusieurs deals candidats matchent (ou match
  ambigu), la charge reste **orpheline** (« à rattacher »), jamais fusionnée.
- **Abonnements** : rattachés par **customer Stripe** (pas par montant, qui se répète),
  une ligne par prélèvement, marqués « abonnement » (récurrent, pas de reste à payer).
- **Remboursements** : une charge remboursée écrit un statut `refunded` sur l'échéance
  (donnée, pas seulement badge).
- **Modèle de données** : distinguer la nature (one-shot / échéancier / abonnement),
  marquer l'origine Stripe et l'orphelin, stocker le customer d'abonnement, ajouter le
  statut d'échéance `refunded`. Migration Drizzle (`db:generate` + `db:migrate`, jamais push).
- **Server action** : créer une vente depuis une charge orpheline, pré-remplie
  (montant, date, email), validée par Zod.

### Périmètre (non négociable)

Lit **uniquement** le Stripe Connect du client (read-only OAuth). Jamais le Stripe
Billing Minaly (`lib/billing/`, `STRIPE_SECRET_KEY`) ni le parrainage. Le mot
« abonnement » désigne toujours l'abonnement d'un **client final du client**, jamais
l'abonnement SaaS Minaly.

### Affichage & DA (voir `design.md`)

- **Encart réconciliation** (remplace `failed-payments-banner.tsx`) : deux compteurs
  (impayés / à rattacher), sans fond d'accent, sans CTA global. Affiché seulement si
  `impayés > 0 || orphelins > 0`.
- **StripeStatusLine** : copie corrigée, pastille positive.
- **4 cartes métriques** : comptées **par deal**, jamais par ligne de prélèvement
  (l'explosion en lignes est purement visuelle — le CA ne doit pas gonfler ×N).
- **Filtres** : Setter, Paiement, Nature, Statut.
- **Tableau** : 1 ligne par prélèvement, colonnes Nature (`Échéancier 2/3`) et Reste à
  payer, taxonomie de 5 badges (2 nouveaux : Remboursé, À rattacher).
- **Drawer** : reste à payer agrégé par client en tête + « Créer la vente » si orphelin.
- **Agent banner** : inchangé (accent-2 violet, IA).

## Non-goals

- Pas de conversion de devises (les charges hors devise dominante restent exclues du
  calcul, comportement actuel conservé).
- Pas de webhook Stripe Connect temps réel : la sync reste par job / refresh.
- Ne touche ni le Stripe Billing Minaly ni le parrainage.

## Impact

- **Affected specs**: `suivi-ventes`
- **Affected code (données/sync — sensible)**: `lib/stripe/failed-payments.ts` (→ étendu
  aux succeeded/refunds), `lib/stripe/sync-write.ts`, `lib/inngest/functions/sync-stripe-account.ts`,
  `lib/sales/queries.ts`, `lib/sales/types.ts` + `schema.ts`, `db/schema.ts` (+ migration Drizzle)
- **Affected code (affichage)**: `failed-payments-banner.tsx`, `stripe-status-line.tsx`,
  `sales-table.tsx`, `sale-detail-drawer.tsx`, `page.tsx`, nouvelle server action « créer depuis orphelin »
- **Maquette de référence** : `Suivi des ventes.dc.html`
