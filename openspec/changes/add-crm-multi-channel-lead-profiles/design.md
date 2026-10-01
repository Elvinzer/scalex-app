## Context

La table `leads` contient aujourd'hui un seul triplet `platform`,
`canonicalProfileUrl` et `normalizedHandle`. La résolution de l'extension est
donc limitée au réseau visité, et la confirmation d'une correspondance remplace
ce triplet. Le téléphone est déjà stocké et normalisé dans certains flux, mais
le helper WhatsApp actuel ajoute encore un `+` dans le chemin `wa.me` et déduit
le pays par défaut du contexte français.

L'extension utilise un jeton bearer court lié à un compte CRM et conserve une
résolution en cache. Les recherches génériques de leads chargent des actions et
des appels ; elles ne conviennent pas au chemin critique de l'extension. Le pool
Postgres est volontairement petit, ce qui rend les allers-retours et les scans
complets particulièrement visibles.

## Goals / Non-Goals

**Goals:**

- Stocker plusieurs profils sociaux par lead et préserver les colonnes legacy
  pendant la migration.
- Résoudre un profil exact en priorité, puis produire quelques suggestions
  cross-réseaux explicables dans le seul compte courant.
- Utiliser des clés de recherche préparées et des index account-scoped pour
  garder le parcours fluide, sans charger l'historique du lead ni appeler l'IA.
- Générer un lien WhatsApp conforme depuis un téléphone validé et conserver les
  conflits de données visibles.
- Publier la capture avec une release d'extension monotone et compatible avec
  la version précédente.

**Non-Goals:**

- Fusion automatique de personnes sur le seul nom, handle, setter, réseau ou
  date de dernière activité.
- Recherche dans un autre compte, base globale de personnes ou enrichissement
  via l'API Instagram, LinkedIn ou Meta.
- Vérification que le numéro possède effectivement un compte WhatsApp : le
  lien est une destination click-to-chat, pas une preuve d'existence.
- Refonte du moteur de rapprochement des appels dans cette évolution ; il ne
  sera pas réutilisé pour la résolution instantanée de l'extension.

## Decisions

### 1. Ajouter une table de profils account-scoped

Créer `crm_lead_profiles` avec `accountId`, `leadId`, `platform`,
`canonicalProfileUrl`, `normalizedHandle`, `displayName`,
`searchNameNormalized`, `capturedAt`, `createdAt` et `updatedAt`. Ajouter deux
contraintes logiques : une URL canonique ne peut appartenir qu'à un compte et
un réseau, et un lead ne porte qu'un profil actif par réseau. Ajouter des
index sur `(accountId, platform, canonicalProfileUrl)`,
`(accountId, platform, normalizedHandle)` et les champs de recherche utiles.

Le compte est toujours dérivé de la session serveur. Les policies RLS et les
requêtes applicatives vérifient à la fois le compte et l'appartenance du lead.
Les anciennes colonnes restent présentes pour les écrans et extensions
legacy ; elles représentent le profil principal de compatibilité et ne sont
plus la source de vérité pour les profils supplémentaires.

Alternative écartée : ajouter une colonne par réseau sur `leads`. Cela rendrait
les migrations et l'ajout d'un nouveau réseau coûteux, et compliquerait les
contraintes d'unicité et la provenance de chaque profil.

### 2. Faire une résolution en cascade à coût borné

Le endpoint de résolution suit ce chemin :

1. rechercher l'URL canonique dans `crm_lead_profiles` pour le compte courant ;
2. en cas d'absence, rechercher les téléphones E.164 et emails normalisés
   fournis par une recherche manuelle ou un import ;
3. comparer les clés de nom et de handle normalisées ;
4. utiliser une recherche de proximité indexée uniquement si aucun signal exact
   n'est décisif.

La première étape retourne immédiatement un lead connu et ne lance pas le
fallback. Les étapes suivantes retournent au maximum cinq candidats avec un
petit résumé et les signaux de correspondance. Elles ne chargent ni actions,
ni appels, ni timeline, et n'appellent pas Falco ou un autre modèle.

Les clés de nom suppriment casse, accents et séparateurs. Un handle et un nom
qui donnent la même clé sont un seul indice. Les téléphones sont comparés sur
leur forme E.164 complète ; les suffixes de neuf chiffres ne servent pas de
preuve d'identité.

Pour le fallback, activer `pg_trgm` par migration uniquement si les mesures sur
des comptes représentatifs le justifient, avec un index trigramme sur la clé
de recherche et un filtre `accountId` appliqué dans la même requête. Ne jamais
sélectionner un top global avant de filtrer le compte. Les plans et buffers
seront vérifiés avec `EXPLAIN` sur des volumes comprenant un compte dominant et
beaucoup d'homonymes.

Alternative écartée : réutiliser `getCrmLeads` ou le rapprochement des appels.
Ces chemins chargent des données secondaires ou parcourent tous les leads et
leur classement contient des heuristiques qui ne prouvent pas une identité.

### 3. Confirmer un rattachement sans remplacer l'identité

Le endpoint de capture revalide le candidat depuis le résultat de résolution,
le compte et le profil capturé dans une transaction. Une confirmation ajoute le
profil dans `crm_lead_profiles`, conserve le profil existant et journalise
l'acteur, le compte, la source et la clé d'idempotence. Une collision de même
réseau ou d'URL est une erreur explicite, jamais une mise à jour silencieuse.

Les suggestions par nom, pseudo, téléphone ou email restent ambiguës tant que
l'utilisateur n'a pas confirmé. Une création séparée laisse le candidat
inchangé. La réponse d'extension expose uniquement les champs nécessaires à la
décision : nom, profils, état CRM, responsable et signaux de correspondance.

### 4. Rendre le contexte d'extension explicite

Le jeton d'extension reste court et lié au compte résolu côté serveur. Le
service worker associe chaque cache à l'identité du profil et au contexte de
session, puis efface le jeton et les résolutions lors d'un changement de compte
ou d'une nouvelle authentification. Le content script ignore toute réponse
arrivée après une nouvelle opération ou un changement de contexte.

Le serveur ne fait jamais confiance à un `accountId` envoyé par le client et
revérifie le candidat sélectionné avant la mutation. Une version antérieure du
jeton ou de la carte ne peut donc pas rattacher une fiche dans un autre compte.

### 5. Centraliser le téléphone et le lien WhatsApp

Extraire la normalisation téléphone dans un utilitaire partagé qui reçoit un
contexte pays explicite, produit une valeur E.164 et refuse les numéros
invalides. Le compte devra fournir ce contexte pour les numéros nationaux ; à
défaut, le numéro reste en revue manuelle plutôt que d'être interprété selon la
langue de l'interface. Le lien WhatsApp retire le `+`, espaces, parenthèses et
tirets du numéro international.

Lors du backfill, les anciennes URLs `wa.me` sont analysées uniquement si leur
numéro est valide. Un téléphone existant différent reste un conflit auditable.
La migration ne supprime pas l'URL legacy et ne déclare pas que le numéro est
inscrit à WhatsApp.

### 6. Publier l'extension avec la version du changement

Le manifeste passe de `0.2.0` à `0.3.0` pour cette évolution. Le package garde
la validation d'une version strictement supérieure et produit l'archive
versionnée, l'alias latest et le manifeste JSON. Les fichiers `dist` sont
recompilés depuis `extension/src` avant l'archive ; les tests vérifient la
version, le contenu du ZIP et le contrat de résolution/capture.

Le backend est déployé avec une compatibilité de lecture pour l'ancienne
extension avant la publication du package. En cas de problème, le point
d'entrée peut être masqué et la table de profils conservée ; aucune suppression
de données n'est nécessaire pour revenir en arrière.

## Risks / Trade-offs

- **Faux rapprochement par nom** → garder le nom comme suggestion, afficher le
  signal utilisé et exiger une confirmation ; ne pas fusionner automatiquement.
- **Compte avec beaucoup de leads** → clés pré-calculées, index account-scoped,
  cinq résultats maximum et fallback trigramme mesuré ; contrôler les plans
  avec `EXPLAIN`.
- **Homonymes et téléphones partagés** → présenter les candidats concurrents et
  ne pas imposer d'unicité métier sur téléphone ou email.
- **Anciennes extensions en circulation** → migration additive, miroir legacy
  temporaire et contrat backend compatible pendant la release `0.3.0`.
- **Cache d'un ancien compte** → clé de cache liée au contexte de session,
  invalidation sur changement de compte et revalidation serveur avant écriture.
- **Données legacy incohérentes** → rapport de backfill et conflits conservés
  pour revue, sans fusion ou suppression automatique.

## Migration Plan

1. Ajouter la table de profils, ses contraintes, ses index et ses policies RLS
   dans une migration Drizzle additive.
2. Backfiller les profils legacy et produire un rapport des collisions par
   compte, réseau et URL ; remplir les téléphones manquants issus des liens
   `wa.me` lorsqu'ils sont validés.
3. Déployer les services de lecture/écriture multi-profils en conservant les
   colonnes legacy et l'ancienne réponse d'extension.
4. Ajouter la résolution en cascade, le cache lié au compte, la recherche
   manuelle et l'affichage multi-profils/WhatsApp.
5. Recompiler l'extension, passer le manifeste à `0.3.0`, générer le ZIP et
   vérifier le endpoint de release.
6. Activer d'abord sur `clubvipfinance`, mesurer les latences exactes et les
   suggestions, puis étendre aux autres comptes après vérification de
   l'isolation et des conflits.

La migration est réversible au niveau fonctionnel : désactiver l'entrée de
résolution multi-profils ou la nouvelle extension laisse les données additives
en place. Aucun rollback destructif de la table ou des profils n'est prévu.
