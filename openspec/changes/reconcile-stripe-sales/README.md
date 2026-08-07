# reconcile-stripe-sales

Refonte du Suivi des ventes : le Stripe connecté du client alimente la page en
transactions individuelles, réconciliées avec les deals existants (merge auto),
avec impayés, remboursements, paiements orphelins et reste à payer.

Deux volets indissociables :

- **Backend / données** — étendre la sync Stripe aux charges succeeded, réconcilier
  par email+montant (deals) et par customer (abonnements), créer les deals orphelins,
  écrire les statuts payé / impayé / remboursé, rester idempotent. Zones sensibles :
  `lib/stripe/`, `db/schema.ts`, job Inngest.
- **Affichage / DA** — 1 ligne par prélèvement (explosion purement visuelle, les
  métriques restent comptées par deal), encart de réconciliation, taxonomie de badges,
  reste à payer, création de vente depuis un orphelin. Voir `design.md`.

Périmètre strict : lit **uniquement** le Stripe Connect du client (read-only).
Jamais le Stripe Billing Scale X ni le système de parrainage.
