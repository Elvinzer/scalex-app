## Context

Le code actuel possède deux sources de lecture séparées : `nativeBookings` pour les réservations natives et `salesCalls` pour les appels iClosed, Calendly, manuels et natifs. La page publique et sa route utilisent encore un formulaire de coordonnées unique, tandis que l’éditeur d’événement ne possède ni questions persistées ni règles de rappels. Les notifications natives existent déjà via Resend/Inngest, mais l’email prospect est actuellement nullable et les rappels métier n’existent pas.

Les règles existantes à préserver sont l’account scoping/RLS, l’attribution round-robin persistée, la réservation transactionnelle, la synchronisation Google/Outlook, les tokens publics de gestion et les limites d’abonnement. La DA du handoff et les tokens Minaly restent prioritaires sur toute suggestion visuelle générique ; les recommandations `ui-ux-pro-max` servent uniquement aux interactions non maquettées.

## Goals / Non-Goals

**Goals:**

- Introduire un contrat de lecture unifié sans fusionner les tables métier natives et `salesCalls`.
- Faire évoluer le parcours public sans casser les réservations, leads et tokens de gestion déjà existants.
- Ajouter des données historisées pour les questions, réponses, rappels et notifications afin de rendre les reprises idempotentes.
- Rendre les nouvelles surfaces utilisables au clavier, sur mobile et dans le fuseau du navigateur.
- Conserver `/ventes/appels` comme surface d’analyse/funnel et `/ventes/rdv` comme surface opérationnelle d’agenda.

**Non-Goals:**

- Modifier, annuler ou déplacer les appels iClosed/Calendly depuis Minaly.
- Inclure les appels manuels dans l’agenda unifié.
- Réattribuer les rendez-vous existants lors d’un rééquilibrage ou d’un changement de pool.
- Envoyer automatiquement des messages WhatsApp ; le lien prérempli reste une action manuelle.
- Construire un moteur générique de CRM, une table `contacts` ou une synchronisation bidirectionnelle avec iClosed/Calendly.
- Refaire la DA globale de l’application ou remplacer les maquettes autoritaires du handoff.

## Decisions

### 1. Conserver les tables métier et construire une projection d’agenda

L’agenda sera alimenté par une projection account-scoped assemblant :

- les lignes `salesCalls` de source `native`, enrichies par `nativeBookings`, l’événement, le lead et le closer ;
- les lignes `salesCalls` de source `iclosed` et `calendly` ;
- aucune ligne de source `manual`.

Le contrat de projection expose un identifiant stable, une source, un début UTC, une fin éventuelle, une durée d’affichage, un statut projeté, les coordonnées disponibles, le closer et les actions autorisées. Les données externes ne sont pas recopiées dans `nativeBookings`.

Alternative écartée : créer une table générique `appointments` et migrer toutes les sources dedans. Cette option ferait perdre les contrats d’intégration existants et rendrait les règles natives de modification ambiguës.

### 2. Ajouter une durée externe nullable avec fallback explicite

`salesCalls` recevra une durée ou une fin normalisée lorsqu’une intégration la fournit. Les adaptateurs tenteront de conserver la durée native de la source ; si elle est absente, la projection utilisera 30 minutes pour dimensionner le bloc dans Agenda/Semaine et indiquera que cette durée est estimée. L’instant de début reste la seule donnée temporelle obligatoire pour les sources externes.

Alternative écartée : inventer systématiquement une durée métier propre à chaque intégration. Le résultat serait trompeur pour les comptes dont les événements ont des durées différentes.

### 3. Utiliser des tables dédiées pour les questions et les rappels

Les questions seront stockées dans une table fille de l’événement, avec ordre, libellé, aide, type, options et obligatoire. Les réponses seront stockées comme snapshot sur le lead et la réservation native ; le snapshot évite qu’une modification ultérieure d’une question réécrive l’interprétation historique.

Les règles de rappel seront également des lignes filles de l’événement, avec délai en minutes, sujet/message, état actif et ordre. Les exécutions seront suivies dans une table de livraison liée à la réservation et à la règle, avec une contrainte d’unicité qui rend l’envoi re-jouable sans doublon.

Alternative écartée : conserver questions et rappels dans un seul JSON de l’événement. Cette approche compliquerait le réordonnancement, les validations, les RLS et l’idempotence des rappels.

### 4. Faire des rappels un outbox durable piloté par l’état du rendez-vous

À la confirmation, les rappels futurs sont matérialisés avec leur échéance. Un job Inngest récupère les livraisons échues, vérifie que la réservation est toujours confirmée et envoie l’email prospect. Les changements de configuration mettent à jour les livraisons non envoyées des rendez-vous futurs ; une annulation les désactive et un déplacement recalcule les échéances. Une réservation trop proche de l’échéance crée une livraison immédiatement exécutable.

Les emails de confirmation, annulation et déplacement restent séparés des rappels et des préférences de notification du closer. Le prospect doit recevoir les emails transactionnels lorsque son adresse existe ; les contrôles existants `notifyCloserOn*` continuent de piloter uniquement le closer.

Alternative écartée : un `sleepUntil` Inngest indépendant par rappel sans table de suivi. Il serait difficile à annuler ou à recalculer proprement après modification d’un événement ou déplacement.

### 5. Garder la route publique et la durcir par un contrat discriminé

La route publique existante peut conserver ses modes `capture`, `unlock`, `book`, `cancel` et `reschedule`, mais les payloads seront validés par un schéma discriminé avant tout accès aux données. Les nouveaux paliers utiliseront des opérations logiques de création/actualisation du lead et de sauvegarde des réponses sans imposer une multiplication de routes publiques.

Le téléphone sera normalisé en E.164 avec la même bibliothèque côté client et serveur. Le brouillon du palier et des champs restera en `sessionStorage`, tandis que le lead account-scoped ne sera créé qu’après validation de l’identité, conformément au nouveau contrat.

### 6. Séparer les fuseaux de calcul, d’affichage public et d’affichage back-office

Les disponibilités et réservations resteront calculées dans le fuseau IANA de l’événement et persistées comme instants UTC. La page publique affichera par défaut le fuseau de l’événement, avec bascule vers le fuseau détecté du prospect. Le back-office formatera les instants dans le fuseau du navigateur/utilisateur ; le fuseau utilisé pour la requête de période sera validé comme identifiant IANA et ne servira jamais à contourner l’account scoping.

### 7. Définir une hiérarchie d’actions stricte dans l’agenda

L’agenda sera protégé par la permission `ventes:rdv` et affichera les trois sources convenues. Les actions de lecture sont communes. Les actions de déplacement/annulation ne sont rendues que pour une réservation native et vérifiées côté serveur.

Le déplacement demande d’abord des créneaux du closer courant. Si aucun créneau n’est disponible à la date demandée, l’interface propose une autre date pour ce même closer et ne bascule jamais vers un autre closer. Le curseur round-robin n’est pas avancé. « Rééquilibrer » ne modifie que les futures attributions.

### 8. Appliquer les recommandations UI aux zones non maquettées

- Questions : liste de cartes réordonnables, poignée de déplacement et boutons haut/bas accessibles au clavier, validation inline, prévisualisation du rendu public et ajout explicite d’une question.
- Rappels : lignes répétables avec délai lisible, éditeur de message, variables insérables, aperçu et état actif/inactif ; les erreurs indiquent précisément la correction.
- Semaine : grille horaire sur grand écran ; sur petit écran, jour sélectionné et liste verticale plutôt qu’une grille illisible.
- Liste : table sémantique sur desktop et cartes structurées sur mobile, avec source, statut et actions non dépendantes de la couleur.
- Drawer et modales : fermeture explicite, retour clavier, focus initial/restauré, confirmation pour les actions destructives et annonces `aria-live` pour les erreurs/succès.
- Animations : transitions utiles de 150–300 ms, aucune animation bloquante et respect de `prefers-reduced-motion`.

Ces choix suivent `ui-ux-pro-max` pour les labels, focus, validation au blur, erreurs actionnables, cibles d’au moins 44 px, responsive et navigation clavier, tout en utilisant uniquement les tokens visuels déjà approuvés.

### 9. Générer un `.ics` sans secret de gestion

Le téléchargement `.ics` sera généré à partir de la réservation confirmée et contiendra les informations calendaires utiles, mais aucun token d’annulation ou de déplacement. Les liens de gestion resteront dans les emails ou la page de confirmation sous forme de liens sécurisés séparés.

## Risks / Trade-offs

- **[Hétérogénéité des intégrations]** iClosed/Calendly n’exposent pas toujours une durée ou un closer résolvable → conserver les champs optionnels, afficher la source et marquer la durée de 30 minutes comme estimation.
- **[Retard ou doublon d’email]** un job peut être rejoué ou Resend peut répondre tardivement → table de livraison unique, statuts, tentatives et vérification de l’état du rendez-vous avant envoi.
- **[Évolution des questions]** une question peut être modifiée après une réservation → snapshot des réponses sur le lead et le booking, jamais une lecture historique depuis la configuration courante.
- **[Fuseau côté navigateur]** le serveur ne connaît pas toujours le fuseau du viewer → transmettre un fuseau validé uniquement pour la présentation et borner la requête à la période demandée ; les timestamps restent UTC.
- **[Compatibilité des données existantes]** les anciens leads et bookings n’ont pas forcément d’email ou de réponses → migrations additives, valeurs nulles conservées pour l’historique et nouvelles réservations soumises au contrat renforcé.
- **[Rappels déjà planifiés]** une modification d’événement peut intervenir entre la réservation et l’envoi → recalculer uniquement les livraisons non envoyées et conserver l’immutabilité des messages déjà envoyés.
- **[Mobile dense]** la grille Semaine et les tableaux peuvent devenir illisibles → variante mobile structurée, testée à 390 px, sans dépendance au scroll horizontal essentiel.

## Migration Plan

1. Ajouter les tables/colonnes de manière additive avec RLS et index account-scoped ; ne pas rendre immédiatement non nullable l’email des anciennes lignes.
2. Déployer les types et requêtes de lecture avec questions/rappels vides par défaut ; les événements existants restent publiables sans question ni rappel.
3. Ajouter la normalisation des durées externes et laisser `null` pour les historiques non enrichissables ; appliquer le fallback uniquement à la projection.
4. Déployer la nouvelle page publique derrière le même slug et conserver les tokens de gestion existants.
5. Activer les rappels seulement pour les nouvelles réservations et les livraisons futures explicitement créées ; vérifier la non-répétition des emails lors des retries.
6. Vérifier les parcours public, agenda, déplacement, annulation, `.ics`, permissions et rappels avec `agent-browser`, puis lancer les validations typecheck/lint.

En cas de rollback UI, l’ancien rendu peut être restauré sans supprimer les nouvelles données. Les tables de questions, rappels et livraisons restent compatibles avec un retour temporaire à un événement sans question ni rappel ; aucune suppression destructive de réservation ou de notification ne doit être utilisée.
