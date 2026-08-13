# Tasks

> Les blocs 1 à 3 (backend / données) sont la vraie plomberie : sans eux, l'affichage
> reste vide. Les blocs 4+ (front) en dépendent. Zones sensibles (`lib/stripe/`,
> `db/schema.ts`, job Inngest) : résumer l'approche en 2-3 phrases avant d'éditer.

## 1. Modèle de données (db/schema.ts — sensible, migration Drizzle)
- [x] 1.1 Ajouter le statut d'échéance `refunded` (aujourd'hui : upcoming|paid|failed) dans `lib/sales/types.ts` + `schema.ts` (Zod)
- [x] 1.2 Distinguer la nature d'une vente : one-shot / échéancier / **abonnement** (nouvelle valeur `paymentType` ou champ dédié — trancher au design d'implé)
- [x] 1.3 Marquer l'origine Stripe d'un deal (`source = "stripe"`) et l'état orphelin « à rattacher »
- [x] 1.4 Stocker le customer Stripe d'un abonnement (clé de rattachement des prélèvements récurrents)
- [x] 1.5 `npm run db:generate` puis `db:migrate` (JAMAIS push), committer le `.sql` + `meta/`
- [x] 1.6 Vérifier les policies RLS sur `sales` restent correctes après migration

## 2. Sync & réconciliation Stripe (lib/stripe/ — sensible, read-only Connect uniquement)
- [x] 2.1 Étendre le scan aux charges `succeeded` (aujourd'hui `failed` only) — même fenêtre `monthsBack`
- [x] 2.2 Merge auto : matcher un deal existant par email + montant avant toute création
- [x] 2.3 Match trouvé → marquer l'échéance concernée `paid` (et `failed` pour les échouées, comportement conservé)
- [x] 2.4 Garde-fou : >1 deal candidat ou match ambigu → laisser orphelin, **jamais** fusionner
- [x] 2.5 Aucun match → créer le deal `source = "stripe"`, nature détectée (one-shot par défaut)
- [x] 2.6 Abonnements : rattacher les prélèvements par **customer Stripe** (pas par montant), marquer « abonnement »
- [x] 2.7 Remboursements : charge remboursée → écrire statut `refunded` sur l'échéance
- [x] 2.8 Idempotence : `stripeChargeId` déjà enregistré → skip (re-sync safe)
- [x] 2.9 Ne jamais toucher `STRIPE_SECRET_KEY` / Billing Minaly / parrainage — assertion de périmètre
- [x] 2.10 Câbler dans `lib/inngest/functions/sync-stripe-account.ts` (re-run safe) + logguer counts (matched / created / orphaned)
- [x] 2.11 Tests unitaires du matcher (merge, ambiguïté→orphelin, abonnement par customer, remboursement, idempotence)

## 3. Server action — créer une vente depuis un orphelin
- [x] 3.1 Action pré-remplie depuis la charge (montant, date, email), validée Zod
- [x] 3.2 Vérif session Supabase côté serveur + scoping au compte courant
- [x] 3.3 Lever l'état « à rattacher » une fois la vente créée / liée à la charge

## 4. Encart réconciliation
- [x] 4.1 Remplacer `failed-payments-banner.tsx` par `ReconciliationSummary`
- [x] 4.2 Compteur impayés (count + montant) en state-critical
- [x] 4.3 Compteur orphelins en warning-soft
- [x] 4.4 Rendu conditionnel : impayés > 0 || orphelins > 0
- [x] 4.5 Aucun CTA global dans l'encart (l'action « rattacher » est par ligne)

## 5. StripeStatusLine
- [x] 5.1 Réécrire la copie (« tes paiements alimentent ce suivi automatiquement »)
- [x] 5.2 Pastille positive + lien « Déconnecter » discret

## 6. Métriques (garder le calcul PAR DEAL)
- [x] 6.1 Confirmer que les 4 cartes se calculent depuis les deals, jamais depuis les lignes explosées (anti double-compte ×N)
- [x] 6.2 CA contracté / CA encaissé / En attente / Impayés
- [x] 6.3 Sous-libellé « N ventes » sur chaque carte

## 7. Filtres
- [x] 7.1 Ajouter les filtres Nature et Statut aux filtres Setter / Paiement existants

## 8. Tableau
- [x] 8.1 Passer à 1 ligne par prélèvement (explosion depuis `installments[]`, données inchangées)
- [x] 8.2 Colonnes Nature (`Échéancier 2/3`, `Abonnement`) et Reste à payer (`—` si abonnement/one-shot)
- [x] 8.3 Badges `refunded` (neutre) et `orphan`/« à rattacher » (warning)
- [x] 8.4 Action de ligne : Supprimer (ghost) / Créer la vente (outline)
- [x] 8.5 Conteneur à défilement horizontal sous ~940px

## 9. Drawer
- [x] 9.1 Reste à payer agrégé par client en tête
- [x] 9.2 Liste des échéances avec statut par ligne (dont `refunded`)
- [x] 9.3 Bloc « Créer la vente » pré-rempli (outline) si orphelin

## 10. Vérification
- [x] 10.1 Audit DA : un seul bouton corail sur l'écran
- [x] 10.2 États vides : aucun impayé, aucun orphelin, aucune vente
- [x] 10.3 Vérifier qu'un paiement en 3x n'inflate pas le CA contracté (compté 1×)
- [x] 10.4 `npm run typecheck` + `npm run lint` verts
- [x] 10.5 Preview Vercel qui build + migration appliquée
