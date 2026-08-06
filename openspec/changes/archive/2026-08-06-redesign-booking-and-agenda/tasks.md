## 1. Contracts, dependencies and data model

- [x] 1.1 Auditer les types actuels de réservation, appel, lead et notification et figer les contrats partagés de l’agenda, des questions et des rappels.
- [x] 1.2 Ajouter `libphonenumber-js` après vérification de son statut de maintenance et définir la normalisation E.164 commune au client et au serveur.
- [x] 1.3 Ajouter les schémas Zod discriminés pour chaque mode de réservation publique, les questions, les réponses, les filtres d’agenda et les règles de rappels.
- [x] 1.4 Ajouter les tables de questions d’événement et les colonnes/snapshots de réponses sur les leads et réservations natives, avec RLS et index account-scoped.
- [x] 1.5 Ajouter les tables de règles de rappels et de livraisons par réservation, avec statuts, idempotence, index d’échéance et RLS.
- [x] 1.6 Ajouter la durée externe nullable et les métadonnées nécessaires à la projection des appels iClosed/Calendly, sans casser les identifiants existants.
- [x] 1.7 Produire la migration Drizzle additive, mettre à jour les métadonnées de migration et vérifier qu’elle conserve les données historiques.

## 2. Domain services and read models

- [x] 2.1 Implémenter le service de configuration/validation des questions : types, options, ordre, obligatoire et historique des réponses.
- [x] 2.2 Implémenter le service de projection account-scoped de l’agenda pour les sources native, iClosed et Calendly, en excluant `manual`.
- [x] 2.3 Implémenter la projection des statuts `Confirmé`, `Annulé` et `Passé`, en conservant les statuts détaillés du suivi des appels dans la fiche.
- [x] 2.4 Implémenter la résolution de durée : durée native ou source si disponible, sinon fallback visuel estimé de 30 minutes.
- [x] 2.5 Adapter les lecteurs iClosed et Calendly pour conserver une durée lorsqu’elle est disponible et laisser `null` lorsqu’elle ne peut pas être vérifiée.
- [x] 2.6 Implémenter la validation du fuseau navigateur/utilisateur et la conversion des périodes locales en bornes UTC account-scoped.
- [x] 2.7 Implémenter le générateur `.ics` sans token de gestion, avec début/fin UTC, titre, closer, consignes et lien de réunion.

## 3. Public progressive booking flow

- [x] 3.1 Remplacer l’état du formulaire public par les paliers monotones téléphone, identité, email/questions et calendrier.
- [x] 3.2 Ajouter le sélecteur international de pays, `+33` par défaut, l’affichage du numéro formaté et la validation au blur.
- [x] 3.3 Ajouter la persistance de brouillon en `sessionStorage` sans créer de lead account-scoped au palier téléphone seul.
- [x] 3.4 Adapter la route publique pour valider chaque palier, créer le lead après l’identité et enregistrer email/réponses au palier suivant.
- [x] 3.5 Rendre les cinq types de questions sur la page publique avec leurs règles obligatoire/facultatif et leurs erreurs accessibles.
- [x] 3.6 Modifier l’affichage public pour utiliser le fuseau de l’événement par défaut et permettre la bascule vers le fuseau du prospect.
- [x] 3.7 Conserver les UTM, le referrer, le lien nommé, la sélection de date et le contexte de session pendant toutes les transitions.
- [x] 3.8 Conserver la confirmation, l’annulation et le déplacement publics sécurisés, et ajouter le téléchargement `.ics`.
- [x] 3.9 Ajouter les états de chargement, de conflit de créneau, de doublon, de réseau et de confirmation avec récupération actionnable.

## 4. Event configuration UI

- [x] 4.1 Ajouter à la création et à l’édition d’événement une section de questions vide par défaut, avec ajout, édition, suppression et ordre.
- [x] 4.2 Ajouter l’édition des options, du type, de l’aide et du caractère obligatoire avec validation inline et aperçu du rendu public.
- [x] 4.3 Fournir une alternative clavier au glisser-déposer et protéger la sortie lorsqu’il existe des modifications non enregistrées.
- [x] 4.4 Ajouter à l’éditeur une section de rappels avec lignes répétables, délai, activation, sujet/message et suppression.
- [x] 4.5 Ajouter les variables autorisées, une insertion compréhensible, un aperçu avec données d’exemple clairement identifiées et les erreurs de variable.
- [x] 4.6 Séparer visuellement les rappels prospect des notifications existantes du closer et afficher l’état enregistré de chaque section.

## 5. Unified back-office agenda

- [x] 5.1 Remplacer la lecture native actuelle de `/ventes/rdv` par le read model unifié, sans supprimer le panneau de relances natives.
- [x] 5.2 Ajouter les filtres source, closer, statut et période combinables, validés côté serveur et synchronisés dans l’URL.
- [x] 5.3 Implémenter la vue Agenda groupée par jour avec source, horaire, durée, prospect, email/téléphone, closer et actions.
- [x] 5.4 Implémenter la vue Semaine avec grille horaire desktop, positionnement des blocs et alternative jour/liste sur mobile.
- [x] 5.5 Implémenter la vue Liste avec table sémantique desktop, tri lisible et cartes structurées mobile.
- [x] 5.6 Ajouter le code couleur par source avec libellé/texte accessible et respecter les tokens DA sans couleur brute dans les composants.
- [x] 5.7 Ajouter les états vide, chargement, erreur, période sans disponibilité et résultat filtré vide avec actions de récupération.
- [x] 5.8 Ajouter le drawer « Voir la fiche » réutilisant les informations existantes des appels et affichant les réponses natives lorsqu’elles existent.
- [x] 5.9 Formater les dates dans le fuseau du navigateur/utilisateur et conserver les instants UTC dans les contrats et URLs.
- [x] 5.10 Maintenir `/ventes/appels` comme journal/funnel détaillé et ajouter les liens de navigation vers les fiches sans dupliquer sa logique métier.

## 6. Native management actions and routing

- [x] 6.1 Remplacer la saisie libre `datetime-local` par un panneau de déplacement avec créneaux suggérés du closer courant et calendrier « Autre date ».
- [x] 6.2 Modifier la mutation de déplacement pour refuser tout fallback vers un autre closer, préserver le closer et ne pas avancer le round-robin.
- [x] 6.3 Recalculer les conflits calendrier, buffers, délai minimum et créneaux du même closer avant confirmation du déplacement.
- [x] 6.4 Ajouter l’annulation avec confirmation explicite, rollback visuel en cas d’échec et libération du créneau après succès.
- [x] 6.5 Limiter les actions de mutation aux rendez-vous natifs et masquer les actions de déplacement/annulation pour iClosed et Calendly.
- [x] 6.6 Implémenter « Rééquilibrer » comme action limitée aux futures attributions, sans modifier les rendez-vous ou événements de calendrier existants.
- [x] 6.7 Conserver l’historique de déplacement et d’attribution dans la fiche native et les notifications associées.

## 7. Transactional emails, reminders and calendar export

- [x] 7.1 Séparer les destinataires prospect et closer dans les emails de confirmation, annulation et déplacement, sans modifier le rôle des flags `notifyCloserOn*`.
- [x] 7.2 Ajouter les templates email prospect avec les variables approuvées, le fuseau, le lien de réunion, le lien de gestion et le lien `.ics`.
- [x] 7.3 Créer les livraisons de rappel à la confirmation, envoyer immédiatement celles dont l’échéance est dépassée et garantir l’idempotence.
- [x] 7.4 Implémenter le job Inngest de traitement des rappels échus avec retry, vérification de l’état confirmé et absence de secret dans les logs.
- [x] 7.5 Supprimer les livraisons futures lors d’une annulation et recalculer les livraisons non envoyées lors d’un déplacement.
- [x] 7.6 Appliquer les modifications de configuration aux nouvelles réservations et aux rappels futurs non envoyés sans réécrire les emails déjà envoyés.
- [x] 7.7 Ajouter le lien WhatsApp manuel prérempli avec le message V1 et les variables prénom/événement/date, sans envoi automatique.
- [x] 7.8 Vérifier le téléchargement `.ics` depuis la confirmation et la présence du lien dans les emails prospect sans y inclure de token de gestion.

## 8. Tests, sécurité and rollout validation

- [x] 8.1 Ajouter les tests unitaires de téléphone E.164, paliers, questions, réponses, variables et validation des règles de rappels.
- [x] 8.2 Ajouter les tests de projection agenda, sources autorisées, exclusion des appels manuels, fallback 30 minutes, statuts et fuseaux.
- [x] 8.3 Ajouter les tests de mutation native : concurrence, déplacement même closer, absence de fallback, annulation et rééquilibrage non destructif.
- [x] 8.4 Ajouter les tests d’idempotence des confirmations, déplacements, annulations, livraisons email et retries Inngest.
- [x] 8.5 Vérifier RLS, account scoping, permissions `ventes:rdv`, validation de tous les inputs externes et absence de PII/secrets dans les logs ou URLs.
- [x] 8.6 Parcourir le parcours public complet avec `agent-browser` sur l’événement fixture, incluant abandon après identité, questions, réservation, `.ics`, déplacement, annulation et rappels.
- [x] 8.7 Parcourir l’agenda avec `agent-browser` connecté au superuser fourni, en vérifiant natif/iClosed/Calendly, actions read-only et filtres URL.
- [x] 8.8 Vérifier les vues et états à 390 px, 768 px, 1024 px, 1280 px et 1440 px, avec clavier, focus visible et `prefers-reduced-motion`.
- [x] 8.9 Exécuter `npm run typecheck`, `npm run lint`, l’audit de dépendance et `npm run db:push` après validation de la migration.
- [x] 8.10 Vérifier le build Preview Vercel et effectuer une revue finale des changements de schéma, variables d’environnement et secrets avant livraison.
