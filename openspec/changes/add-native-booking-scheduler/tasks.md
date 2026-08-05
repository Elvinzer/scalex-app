## 1. Fondations de données et sécurité

- [ ] 1.1 Ajouter dans `db/schema.ts` les tables Drizzle des événements, disponibilités récurrentes, exceptions, closers associés, réservations, liens UTM et connexions calendaires.
- [ ] 1.2 Ajouter les états de réservation et de synchronisation, les index account-scoped, l’unicité des slugs/idempotency keys et les contraintes nécessaires à l’absence de chevauchement.
- [ ] 1.3 Ajouter les politiques RLS et vérifier les cas propriétaire, membre autorisé, membre non autorisé et visiteur anonyme pour chaque nouvelle table.
- [ ] 1.4 Étendre `sales_calls` avec le lien vers une réservation native, le closer structuré et la source `native`, en conservant la compatibilité de `iclosed_call_id`.
- [ ] 1.5 Créer et vérifier la migration additive avec le workflow Drizzle du projet, sans modifier ni supprimer les données iClosed/Calendly existantes.

## 2. Abonnements et autorisations

- [ ] 2.1 Étendre `planInputSchema`, le formulaire admin des plans et l’action de sauvegarde avec `nativeBookingEnabled` et `maxBookingEvents` incluant l’option illimitée.
- [ ] 2.2 Ajouter les guards centralisés de réservation native et de limite d’événements dans `lib/billing`, avec le bypass admin déjà prévu par le projet.
- [ ] 2.3 Appliquer les guards côté serveur à la création et à l’activation d’un événement, y compris pour les membres d’équipe agissant pour le compte propriétaire.
- [ ] 2.4 Afficher dans `/admin/plans` et dans l’espace événement le nombre d’événements utilisés, la limite effective et les messages de downgrade sans supprimer les événements existants.

## 3. Domaine événement et calcul des disponibilités

- [ ] 3.1 Créer les schémas Zod et fonctions de normalisation pour les slugs, fuseaux IANA, plages horaires, durées, buffers, délai minimal et horizon de réservation.
- [ ] 3.2 Implémenter les requêtes et actions account-scoped de création, modification, pause, activation et archivage d’un événement.
- [ ] 3.3 Implémenter le calcul des créneaux à partir des plages hebdomadaires, exceptions, buffers, rendez-vous existants et fenêtre demandée.
- [ ] 3.4 Ajouter la gestion des changements d’heure et vérifier que les instants UTC restent cohérents avec le fuseau de l’événement.
- [ ] 3.5 Ajouter la validation de readiness : disponibilité valide, durée valide, closer éligible et avertissements actionnables avant activation.
- [ ] 3.6 Exposer une projection publique minimale par slug pour un événement actif ou une réponse d’état non sensible pour un événement inactif.

## 4. Closers et round robin

- [ ] 4.1 Ajouter les actions de gestion du pool de closers d’un événement avec les permissions team existantes.
- [ ] 4.2 Implémenter le curseur de round robin persistant et l’attribution transactionnelle d’un closer éligible.
- [ ] 4.3 Implémenter l’exclusion des closers désactivés, retirés, mis off ou sans disponibilité compatible avec le créneau.
- [ ] 4.4 Ajouter la revalidation finale et la stratégie de fallback vers un autre closer avant de refuser un créneau.

## 5. Connexions Google et Outlook

- [ ] 5.1 Définir l’interface serveur fournisseur-neutre pour lire les périodes busy, créer, mettre à jour et annuler un événement externe.
- [ ] 5.2 Ajouter le flux OAuth Google Calendar séparé de `youtube_connections`, avec callback protégé, sélection de calendriers et stockage serveur des tokens.
- [ ] 5.3 Ajouter le flux OAuth Microsoft/Outlook, la sélection des calendriers et la gestion des erreurs de consentement ou de refresh.
- [ ] 5.4 Ajouter l’écran de gestion des connexions par closer avec états connecté, reconnexion nécessaire, erreur et déconnexion.
- [ ] 5.5 Implémenter la lecture des périodes busy avec cache court contrôlé et exclusion des calendriers sélectionnés.
- [ ] 5.6 Implémenter la création externe idempotente, les retries Inngest et les états `pending`/`sync_failed` sans envoyer de confirmation trompeuse.
- [ ] 5.7 Implémenter la synchronisation des annulations et déplacements, avec journalisation de l’erreur et reprise manuelle.

## 6. Administration des événements

- [ ] 6.1 Ajouter l’entrée « Rendez-vous » dans la navigation ventes et la liste des événements avec statut, limite, closers et lien public.
- [ ] 6.2 Construire l’en-tête d’édition avec retour, aperçu public, copie du lien, intégration, statut actif/en pause et indicateur de readiness.
- [ ] 6.3 Construire l’éditeur des détails de l’événement, durée, lieu, fuseau, délai minimal et horizon.
- [ ] 6.4 Construire l’éditeur des disponibilités récurrentes et des exceptions par date avec aperçu des créneaux générés.
- [ ] 6.5 Construire l’éditeur closers/round robin et afficher les connexions calendrier manquantes comme avertissements actionnables.
- [ ] 6.6 Construire la section Informations invité avec opt-in obligatoire, champs prénom/nom/email/téléphone et réglages de questions complémentaires.
- [ ] 6.7 Construire la section Notifications, confirmation et personnalisation minimale de la page publique.
- [ ] 6.8 Construire le gestionnaire de liens nommés et UTM avec copie, désactivation et affichage de l’historique non destructif.

## 7. Parcours public de réservation

- [ ] 7.1 Ajouter la page publique hors layout authentifié et les handlers publics de lecture de l’événement, recherche de créneaux et confirmation.
- [ ] 7.2 Construire le layout desktop à deux colonnes avec formulaire à gauche et disponibilités floutées/verrouillées à droite avant opt-in.
- [ ] 7.3 Implémenter le formulaire prénom, nom, email et téléphone avec labels visibles, normalisation, validation inline, état de chargement et erreurs récupérables.
- [ ] 7.4 Révéler les créneaux sans rechargement destructif après validation, conserver les données saisies et déplacer le focus vers le calendrier.
- [ ] 7.5 Implémenter l’affichage par défaut dans le fuseau du prospect et la bascule vers le fuseau de l’événement sans modifier l’instant réservé.
- [ ] 7.6 Implémenter la détection account-scoped d’un rendez-vous futur non annulé et le warning de blocage avant toute nouvelle réservation.
- [ ] 7.7 Implémenter le hold court, la clé d’idempotence, la revalidation finale, la confirmation atomique et les erreurs de créneau pris.
- [ ] 7.8 Construire la page de confirmation avec date, fuseau, closer, lieu, instructions et état de synchronisation.
- [ ] 7.9 Ajouter la protection rate limit, la validation serveur stricte et des réponses publiques qui ne divulguent aucune donnée d’un autre prospect.
- [ ] 7.10 Adapter le parcours aux écrans 375 px, 768 px et desktop, avec navigation clavier, focus visible, annonces d’erreur et respect de `prefers-reduced-motion`.

## 8. Attribution et suivi des appels

- [ ] 8.1 Capturer les paramètres UTM et la page d’entrée dès l’arrivée, puis les conserver pendant le formulaire, le changement de fuseau et la sélection du créneau.
- [ ] 8.2 Enregistrer le snapshot UTM et le lien utilisé au moment de la confirmation sans réécrire l’historique après modification du lien.
- [ ] 8.3 Créer ou upserter l’appel `sales_calls` natif avec les coordonnées, l’horaire, le closer, l’événement et l’attribution marketing.
- [ ] 8.4 Afficher la source native, la plateforme, la campagne et le contenu dans le suivi et le détail des appels sans régression des sources existantes.
- [ ] 8.5 Ajouter les emails de confirmation, d’annulation et de déplacement, ainsi que les jobs de retry idempotents nécessaires.

## 9. Vérification avec agent-browser et livraison

- [ ] 9.1 Préparer un compte de test, des événements fixtures, des closers fixtures, des liens UTM et un fournisseur calendrier contrôlé pour les scénarios reproductibles.
- [ ] 9.2 Tester avec `agent-browser` le lien public inactif, l’opt-in, le flou non interactif, la validation des quatre champs et la révélation des créneaux.
- [ ] 9.3 Tester avec `agent-browser` la réservation réussie, la confirmation, la conservation des UTM et l’apparition dans le suivi des appels.
- [ ] 9.4 Tester avec `agent-browser` le blocage d’un rendez-vous futur, le créneau déjà pris, la mise en pause et l’absence de divulgation d’informations.
- [ ] 9.5 Tester avec `agent-browser` le fuseau du prospect, le fuseau de l’événement, les exceptions, le round robin et le fallback de closer.
- [ ] 9.6 Tester avec `agent-browser` les parcours Google/Outlook simulés, la reconnexion nécessaire, le conflit calendrier et le retry idempotent.
- [ ] 9.7 Tester avec `agent-browser` les limites du plan d’entrée, l’illimité du plan supérieur et le downgrade sans suppression de données.
- [ ] 9.8 Tester avec `agent-browser` les layouts 375 px, 768 px et desktop, le clavier, les focus, les erreurs et les états de chargement.
- [ ] 9.9 Exécuter `npm run typecheck`, `npm run lint`, la validation OpenSpec et les vérifications de migration avant d’activer la fonctionnalité pour les utilisateurs.
