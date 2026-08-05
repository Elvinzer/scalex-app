## Context

Le Dashboard calcule déjà une liste `OverdueAction` à partir des décisions de closing en retard, des rappels de leads et de quelques alertes techniques. Les appels sont rendus dans `/ventes/appels`, les leads manuels dans `/acquisition/pipeline`, et le changement `add-native-booking-scheduler` ajoute `native_booking_leads` ainsi qu’un panneau `À relancer` dans `/ventes/rdv`.

Ces trois domaines ne sont pas encore un modèle de contact commun : `leads` porte les étapes et rappels du Kanban, `sales_calls` porte les appels et leur issue, et `native_booking_leads` porte le parcours d’abandon, le consentement et l’attribution marketing. Le design doit donc unifier la lecture et la navigation sans dédupliquer les données métier.

## Goals / Non-Goals

**Goals:**

- Donner une priorité quotidienne claire aux actions qui peuvent faire avancer du revenu.
- Réutiliser les statuts et transitions déjà possédés par chaque source.
- Garantir une projection account-scoped et permission-aware, sans lien cassé vers une page inaccessible.
- Permettre au Dashboard d’ouvrir le contexte précis d’un lead, d’un appel ou d’un prospect natif.
- Préserver la direction visuelle existante : cartes sticker, tokens sémantiques, corail pour le CTA prioritaire, violet pour le Copilote/analytics.
- Fournir une première tranche sans nouvelle table ni migration de données.

**Non-Goals:**

- Construire un modèle `contacts` ou une timeline universelle dans cette tranche.
- Créer une table générique `follow_up_actions` ou une machine d’état transverse.
- Envoyer des emails, SMS ou messages WhatsApp depuis la file.
- Ajouter une page ou une entrée de navigation appelée `CRM` ou `Relances`.
- Déduire un seuil de stagnation métier sans validation produit ; les leads stagnants sont réservés à une tranche ultérieure.
- Mettre les alertes techniques dans la file de revenu.

## Decisions

### 1. Utiliser une projection de lecture plutôt qu’un nouveau modèle de données

L’agrégateur construira des actions à partir de `leads`, `sales_calls` et `native_booking_leads` au moment du rendu du Dashboard. Chaque action comportera une identité stable fondée sur sa source, une raison lisible, une urgence, une date de référence éventuelle, une valeur si disponible, une permission requise et une destination.

Cette option est choisie parce qu’elle respecte les décisions du scheduler natif et évite de dupliquer les noms, emails, téléphones et statuts dans une quatrième table.

Alternative écartée : créer immédiatement `contacts` et `follow_up_actions`. Ce serait utile à terme, mais cela ferait de cette tranche un chantier de CRM et imposerait une politique de déduplication avant d’avoir observé l’usage réel.

### 2. Définir quatre sources d’actions explicites

La première projection couvre :

- `lead_reminder` : rappel actif arrivé à échéance aujourd’hui ou déjà en retard ;
- `call_decision` : appel en `awaiting_decision`, avec priorité selon la date de réponse attendue ;
- `lead_no_show` : lead encore en `rdv_fixe` avec `isNoShow`, tant qu’il n’a pas été récupéré ou déplacé ;
- `native_booking_lead` : tentative de réservation native ouverte et non convertie.

Un lead manuel ne doit produire qu’une seule action à la fois. Si un no-show possède aussi un rappel actif, le no-show devient la raison affichée et le rappel reste géré par la fiche source.

Les erreurs de clé API et de synchronisation restent dans une surface opérationnelle distincte. Elles ne sont pas des actions commerciales et ne doivent pas prendre la place d’une relance susceptible de récupérer du cash.

### 3. Laisser chaque source posséder son cycle de vie

La file centrale est d’abord un système de priorisation et de navigation. Elle ne marque pas directement une action comme terminée et ne permet pas encore de la reporter dans un état générique.

- Un rappel se termine depuis la fiche Pipeline.
- Une décision se résout depuis l’appel.
- Un no-show se récupère via les transitions du Pipeline.
- Un prospect natif est marqué contacté ou ignoré depuis `Ventes → Rendez-vous`.

Cette contrainte est volontaire : elle évite d’avoir deux vérités pour un même état. Une future table d’actions ne sera justifiée que si les utilisateurs demandent un vrai traitement transverse `terminer / reporter / assigner`.

### 4. Prioriser avec une règle déterministe et explicable

L’ordre initial sera :

1. actions dont l’échéance est dépassée, de la plus ancienne à la plus récente ;
2. actions dues aujourd’hui, de la plus proche à la plus éloignée ;
3. no-shows ouverts, du plus ancien `updatedAt` au plus récent ;
4. prospects natifs non convertis, du plus récent `lastSeenAt` au plus ancien.

Chaque ligne affichera sa raison sous forme de texte, par exemple `En retard de 2 j`, `No-show à récupérer` ou `Créneaux consultés sans réservation`. La couleur ne sera jamais le seul signal.

### 5. Séparer les permissions par destination

L’agrégateur recevra l’`accountId` et le contexte d’équipe. Une action ne sera renvoyée que si l’utilisateur peut accéder à sa destination : `acquisition:pipeline`, `ventes:appels` ou `ventes:rdv`. Le propriétaire voit les actions accessibles à son compte ; un membre ne verra pas une action qui l’enverrait vers une page interdite.

Les données sensibles restent filtrées côté serveur. Le navigateur ne reçoit pas une liste account-scoped brute qu’il pourrait réutiliser pour contourner une permission.

### 6. Utiliser des destinations profondes sans créer une nouvelle page

Chaque action pointera vers sa surface existante avec un identifiant ciblé lorsque cela est possible : lead dans Pipeline, appel dans Appels, lead natif dans Rendez-vous. La page source ouvrira ou mettra en évidence l’élément ciblé, déplacera le focus vers lui et conservera une sortie clavier claire.

Si une destination profonde n’est pas encore disponible pour une source, le lien ouvrira au minimum la page source avec un libellé explicite ; ce cas sera instrumenté comme dette UX à traiter avant d’ajouter d’autres types d’actions.

### 7. Faire du Dashboard un point de triage, pas un nouveau CRM

Le bloc actuel `Actions en retard` sera scindé conceptuellement :

- `À faire maintenant` pour les actions de revenu ;
- un bloc secondaire pour les problèmes techniques bloquants, seulement lorsqu’il y en a.

`À faire maintenant` mettra en avant une seule action principale, puis quelques actions secondaires. Les actions équivalentes utiliseront des boutons de lien neutres ou outline ; le corail restera réservé au CTA prioritaire. Aucune nouvelle entrée de sidebar ne sera ajoutée.

### 8. Respecter les contraintes UX existantes

La surface sera dense mais lisible, avec une liste empilée sur mobile plutôt qu’un tableau ou un Kanban horizontal. Les contrôles devront être utilisables au clavier, avoir un focus visible, une cible d’au moins 44 px, un retour de navigation et des erreurs annoncées. Les animations resteront subtiles et désactivables via la préférence de réduction des animations.

## Risks / Trade-offs

- **[Pas de statut transverse]** → La première tranche navigue vers la source et mesure les clics ; ne pas promettre `Terminer/Reporter` depuis le Dashboard.
- **[Données natives encore séparées]** → Utiliser une projection avec identifiants de source ; ne pas dupliquer les contacts.
- **[Action inaccessible pour un membre]** → Filtrer par permission avant rendu et tester chaque combinaison de rôle.
- **[Trop d’actions sur le Dashboard]** → Limiter l’exposition initiale, conserver un ordre déterministe et exclure les leads stagnants tant que leur seuil n’est pas validé.
- **[Double affichage d’une même relance]** → Dédupliquer par source et appliquer la priorité no-show avant rappel générique.
- **[Dépendance au scheduler natif]** → Livrer après les tables et statuts de `add-native-booking-scheduler`, avec une vérification de compatibilité avant activation.
- **[Deep links incomplets]** → Ajouter des paramètres ciblés et un focus source ; documenter les destinations provisoires plutôt que masquer l’élément.

## Migration Plan

1. Vérifier que `add-native-booking-scheduler` expose bien les tables, statuts, permission `ventes:rdv` et panneau source attendus.
2. Ajouter l’agrégateur et ses tests de projection sans migration de schéma.
3. Ajouter le bloc Dashboard en gardant un fallback silencieux si aucun type d’action revenu n’est accessible.
4. Ajouter les destinations ciblées aux pages Pipeline, Appels et Rendez-vous.
5. Tester la surface avec un compte owner et des membres disposant de permissions partielles.
6. Déployer derrière l’état de permission existant ; aucun backfill n’est nécessaire.

Rollback : retirer le bloc `À faire maintenant` et ses appels de lecture, sans toucher aux tables ou aux statuts des sources. Les écrans Pipeline, Appels et Rendez-vous continuent de fonctionner indépendamment.

## Open Questions

Aucune question bloquante pour cette tranche. Le seuil de stagnation, la table d’actions transverse et la timeline universelle restent explicitement hors périmètre et feront l’objet d’une décision séparée si les métriques d’usage le justifient.
