## Context

Le modèle CRM actuel sépare les cinq étapes opérationnelles (`crmStage`) du résultat (`crmOutcome`) et du motif de perte (`lostReason`). Le même champ `leads.lostReason` est utilisé par le CRM canonique et par l’ancien Pipeline compatible. Les deux interfaces alimentent déjà leurs sélecteurs depuis des listes de motifs distinctes, tandis que la base utilise un enum PostgreSQL partagé.

La proposition et la spécification définissent le comportement attendu. Ce design fixe l’intégration additive et la compatibilité avec les flux existants.

## Goals / Non-Goals

**Goals:**

- Ajouter une seule valeur contrôlée `non_interesse` au vocabulaire partagé des motifs de perte.
- Réutiliser les mutations, événements, notes et règles de réouverture déjà en place.
- Garder les cinq étapes, les KPI et la file d’actions inchangés.
- Garantir la même valeur dans le CRM, l’ancien Pipeline et les imports.
- Déployer la modification avec une migration Drizzle réversible au niveau applicatif.

**Non-Goals:**

- Ajouter une étape, une colonne ou un résultat CRM.
- Introduire un indicateur « ne plus contacter » ou une règle de suppression des relances.
- Reclasser les anciens motifs ou convertir automatiquement les lignes existantes.
- Ajouter une métrique dédiée au motif de perte.

## Decisions

### 1. Stocker le motif dans `lostReason`

Le motif reste attaché à `crmOutcome = lost`, comme les motifs existants. Ajouter un stage ou un outcome créerait une seconde dimension pour exprimer le même fait, obligerait à modifier les KPI et compliquerait la réouverture.

Alternative écartée : une sixième colonne « Non intéressé » dans le Kanban. Elle polluerait le funnel et contredirait la séparation déjà appliquée entre étapes et résultats.

### 2. Utiliser le code partagé `non_interesse`

Les valeurs historiques de l’enum `lead_lost_reason` sont déjà nommées en français (`pas_le_budget`, `pas_le_moment`, etc.). Le nouveau code reste dans cette convention pour éviter de mélanger les conventions dans le même enum partagé avec le legacy. Les libellés affichés restent entièrement séparés dans les catalogues FR/EN.

Alternative écartée : introduire uniquement un code CRM anglophone. Cela fonctionnerait techniquement, mais rendrait le vocabulaire partagé moins cohérent sans bénéfice utilisateur.

### 3. Étendre les deux listes TypeScript et l’enum SQL

`CRM_LOST_REASONS`, `LEAD_LOST_REASONS` et `leadLostReasonEnum` recevront la valeur. Les schémas Zod existants en déduiront automatiquement l’acceptation dans le CRM et le legacy. La migration sera additive avec `ALTER TYPE`; aucune ligne existante ne sera modifiée.

Alternative écartée : conserver la valeur uniquement dans le CRM et mapper le legacy sur `autre`. Cela perdrait l’information et casserait la cohérence entre les deux URLs qui lisent la même table.

### 4. Réutiliser les sélecteurs existants

Les dialogues de perte continueront à parcourir leurs constantes de motifs. Il faudra seulement ajouter la clé dans `crm.json` et `pipeline.json`, dans les deux locales. Le board ne changera pas son rendu : il continuera à afficher le résultat perdu plutôt qu’une nouvelle pastille dédiée.

### 5. Normaliser les imports sans élargir silencieusement les correspondances

Le normaliseur CRM reconnaîtra les formes accentuées, non accentuées et anglaises usuelles du motif, toutes vers `non_interesse`. Une valeur non reconnue restera en revue ou invalide selon le flux d’import existant.

### 6. Conserver les effets de bord existants

La mutation de perte continuera d’écrire le résultat, le motif, l’événement et la note optionnelle selon les règles actuelles. Elle ne modifiera pas les actions ouvertes. Un futur besoin de blocage des relances ou de suppression marketing devra être traité comme une capacité distincte.

## Risks / Trade-offs

- [L’enum PostgreSQL partagé ne peut pas être facilement rétrogradé] → Déployer la migration avant le code qui peut écrire la valeur ; en cas de rollback applicatif, laisser la valeur SQL inutilisée.
- [Les deux listes de motifs peuvent diverger] → Ajouter un test de synchronisation des valeurs et vérifier les deux dialogues en runtime.
- [Les imports historiques utilisent des libellés variables] → Couvrir les variantes connues et conserver l’état de revue pour les valeurs ambiguës.
- [Le motif ne sera pas visible directement sur chaque carte du board] → Le rendre visible dans le drawer/la fiche et conserver le tableau sobre ; une vue de filtrage dédiée pourra être proposée séparément si nécessaire.

## Migration Plan

1. Ajouter `non_interesse` aux constantes, à l’enum Drizzle et aux catalogues FR/EN.
2. Générer puis appliquer la migration Drizzle additive ; ne pas utiliser `db push`.
3. Ajouter les alias de normalisation et les tests unitaires/catalogue/migration.
4. Vérifier le dialogue de perte CRM et l’ancien dialogue Pipeline en français et en anglais, puis vérifier qu’aucune sixième colonne n’apparaît.
5. En cas de rollback applicatif, retirer les écritures et l’affichage de la valeur ; conserver l’entrée enum SQL pour éviter une opération destructive.
