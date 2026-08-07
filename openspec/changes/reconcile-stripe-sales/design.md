# Design — direction artistique

> Ce document couvre la couche visuelle. La couche données/réconciliation qui la
> rend possible est décrite dans `proposal.md` et `specs/suivi-ventes/spec.md`.

## Principe d'architecture qui conditionne l'affichage

**Les données restent par deal ; l'affichage explose par prélèvement.**

- En base, une ligne `sales` = un deal, avec son `installments[]` en jsonb. On ne
  stocke **pas** une ligne par charge.
- Le tableau « explose » chaque deal en une ligne par prélèvement (une par échéance /
  charge). C'est purement de l'affichage.
- **Conséquence** : les 4 cartes métriques se calculent depuis les **deals**
  (`sum(totalPrice)` une fois par deal), jamais depuis les lignes affichées — sinon le
  CA gonfle ×N. Il n'y a pas de `deal_id` à regrouper : la ligne `sales` est déjà le deal.

## Règle d'accent (non négociable)

Un seul accent corail par écran.

- ✅ `+ Ajouter une vente` (header) = seul bouton corail (`variant` par défaut / accent)
- ✅ `Créer la vente` sur les lignes orphelines = `variant="outline"`
- ✅ `Améliorer →` (agent banner) = violet (`variant="accent2"`, IA)
- ❌ INTERDIT : bouton corail répété sur chaque ligne orpheline (« mur de couleur »)

Toute action répétée dans une liste est `outline` ou `ghost`, jamais accent.

## Tokens de statut

| Statut         | Fond              | Texte             | État                              |
|----------------|-------------------|-------------------|-----------------------------------|
| ✓ Payé         | positive-soft     | positive          | existe                            |
| ⋯ À venir      | warning-soft      | warning-text      | existe                            |
| ✗ Impayé       | state-critical/10 | state-critical    | existe                            |
| ↩ Remboursé    | bg-muted          | muted-foreground  | NEUF — neutre, pas une erreur     |
| 🔗 À rattacher | warning-soft      | warning-text      | NEUF — orphelin à traiter         |

En cas de doute sur un token, demander plutôt qu'inventer une teinte hors-DA.

## Encart réconciliation (remplace `failed-payments-banner.tsx`)

Pas de fond d'accent, pas de CTA global. L'action « rattacher » est **par ligne** dans
le tableau. Rendu conditionnel : affiché seulement si `impayés > 0 || orphelins > 0`.
Deux compteurs côte à côte :

- `X impayés · montant` → state-critical (texte + /10 en fond doux)
- `Y paiements à rattacher` → warning-soft / warning-text

## Tableau — 1 ligne par prélèvement

| Colonne        | Contenu                                        | Traitement             |
|----------------|------------------------------------------------|------------------------|
| Date           | date du prélèvement                            | text-muted-foreground  |
| Client         | nom, ou « À identifier » si orphelin           | font-bold              |
| Montant        | montant de CE prélèvement                      | tabular-nums           |
| Nature         | `One-shot` · `Échéancier 2/3` · `Abonnement`   | badge bg-muted neutre  |
| Reste à payer  | `1 000€` (échéancier) · `—` (abonnement/one-shot) | tabular-nums, discret |
| Source         | IG / YT / appel / —                            | text-muted-foreground  |
| Statut         | voir taxonomie ci-dessus                       | badge coloré           |
| (action)       | Supprimer (`ghost`) / Créer la vente (`outline`) |                      |

Conteneur à défilement horizontal sous ~940px (`overflow-x-auto`).

**Reste à payer** : n'a de sens que pour un échéancier à durée finie (`reste = total − payé`).
Pour un abonnement (récurrent, sans fin) → `—`, jamais un « reste ». Pour un one-shot → 0.

## Drawer (détail d'une vente)

- Reste à payer **agrégé par client** en tête (utile seulement si le client a plusieurs deals).
- Liste des échéances avec statut par ligne (déjà présente).
- Bloc « Créer la vente » pré-rempli (`variant="outline"`) si la ligne est un orphelin.

## Copie

- Avant : « Stripe connecté — synchronisation automatique active » (trompeur : la page
  était vide malgré la connexion).
- Après : « Stripe connecté — tes paiements alimentent ce suivi automatiquement ».
