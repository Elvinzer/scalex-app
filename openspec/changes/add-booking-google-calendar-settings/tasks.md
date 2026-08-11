## 1. Accès équipe et périmètre de données

- [x] 1.1 Cartographier les permissions d'équipe existantes et définir un helper serveur de périmètre booking qui prend toujours l'utilisateur authentifié comme closer courant.
- [x] 1.2 Filtrer côté serveur l'agenda unifié, les événements, les liens publics internes, les fiches et les actions natives pour un closer invité ; conserver la vue account-wide des owners/admins autorisés.
- [x] 1.3 Empêcher les contournements par filtre URL, route profonde, server action ou endpoint et ajouter les tests d'autorisation pour deux closers d'un même compte.

## 2. Modèle de données et migrations

- [x] 2.1 Étendre `native_calendar_connections` avec l'identifiant stable du compte Google et remplacer l'unicité closer/fournisseur par une unicité adaptée à un compte fournisseur ; préserver le chiffrement des tokens et l'état de connexion.
- [x] 2.2 Ajouter la configuration booking par closer pour la cible d'invitation et les lignes de calendriers de conflits, avec contraintes d'intégrité, index account/closer et policies RLS.
- [x] 2.3 Ajouter le snapshot du lien Meet et les états nécessaires au suivi de synchronisation sur `native_bookings`, sans casser les références et liens legacy des réservations existantes.
- [x] 2.4 Générer puis appliquer les migrations Drizzle avec `npm run db:generate` et `npm run db:migrate` ; vérifier les policies et ne pas utiliser `drizzle-kit push`.

## 3. OAuth Google et services de configuration

- [x] 3.1 Modifier le flux OAuth pour lier l'autorisation à la session du closer authentifié, récupérer le `sub` Google, distinguer ajout et reconnexion et forcer la sélection du compte lors de l'ajout d'un compte supplémentaire.
- [x] 3.2 Implémenter les lectures et mutations de configuration avec validation Zod : comptes connectés, calendriers accessibles, cible unique écrivable, sélection d'au moins un calendrier de conflit, reconnexion et déconnexion réversible.
- [x] 3.3 Remplacer la sélection implicite de la connexion la plus récente par un resolver explicite de readiness et de cible, réutilisé par les créneaux, l'activation et la confirmation finale.
- [x] 3.4 Vérifier qu'un owner ou un manager ne peut pas connecter ni modifier le compte Google d'un autre closer en forgeant un identifiant dans le payload.

## 4. UX des paramètres et de la prise de rendez-vous

- [x] 4.1 Construire `/settings/calendars` dans le style iClosed observé : cartes de comptes répétables, action d'ajout, bloc cible d'invitation et bloc conflits, en respectant les tokens de Scale X et les recommandations `ui-ux-pro-max`.
- [x] 4.2 Ajouter les états loading, empty, success, error et disconnected, une confirmation avant déconnexion, les labels de formulaire, le focus clavier, les annonces `aria-live`/`role=alert` et les chemins de reprise.
- [x] 4.3 Ajouter l'entrée de navigation et les liens de redirection nécessaires. Rédiger d'abord les chaînes anglaises, les passer au humanizer, puis produire une version française naturelle ; synchroniser les clés, structures et placeholders dans `locales/en` et `locales/fr`.
- [x] 4.4 Afficher sur `/ventes/rdv` une alerte actionnable lorsque le closer courant n'est pas prêt, puis retirer de l'éditeur d'événement les contrôles OAuth et la sélection des calendriers ; conserver seulement l'état de readiness et le lien vers les paramètres.
- [x] 4.5 Adapter l'agenda et la liste des événements à la vue personnelle du closer : aucun sélecteur permettant d'explorer les autres closers, état vide contextualisé et liens disponibles uniquement pour les événements rattachés.

## 5. Readiness et disponibilité

- [x] 5.1 Bloquer l'activation d'un événement si un closer actif du pool n'a pas de compte Google actif, de calendrier cible écrivable ou de calendrier de conflit sélectionné.
- [x] 5.2 Faire calculer les créneaux à partir des seuls calendriers de conflit sélectionnés, en tenant compte des réservations et buffers, avec revalidation serveur au dernier moment.
- [x] 5.3 Revalider la readiness pendant la sélection publique et la confirmation pour gérer une déconnexion ou une révocation survenue entre deux écrans.

## 6. Création Google Calendar et Google Meet

- [x] 6.1 Adapter l'adaptateur Google pour créer dans le calendrier cible choisi, inviter le prospect lorsque son email est disponible et demander `conferenceData` avec une clé Meet et un `requestId` déterministe par réservation.
- [x] 6.2 Extraire le lien vidéo, gérer l'état `pending` avec un polling borné puis un job Inngest, et reprendre l'événement externe existant sans recréer une conférence.
- [x] 6.3 Rendre la création, la mise à jour, l'annulation et la reconnexion idempotentes ; conserver les identifiants externes et signaler les erreurs de synchronisation sans perdre l'état Scale X.
- [x] 6.4 Vérifier les scopes OAuth, les droits d'écriture et l'expiration des tokens sans exposer de secrets dans les logs, le frontend ou les erreurs utilisateur.

## 7. Réservation et surfaces utilisateur

- [x] 7.1 Revalider le créneau, le closer, la readiness et l'idempotence dans la confirmation ; protéger le créneau en état récupérable si Meet reste `pending`, sans retourner de confirmation complète avant d'avoir un lien valide.
- [x] 7.2 Snapshotter le lien Meet sur la réservation et utiliser ce snapshot pour la confirmation publique, le lien de gestion, les rappels, les emails du prospect/closer et l'ICS ; garder le lien d'événement Calendar séparé.
- [x] 7.3 Préserver le fallback du `meetingUrl` d'événement pour les anciennes réservations et ne jamais réécrire le lien d'une réservation existante lorsqu'un événement de booking est modifié.
- [x] 7.4 Tester et documenter le comportement des invitations Google et des emails Scale X afin d'éviter les doublons tout en conservant l'invitation au bon compte cible.

## 8. Tests unitaires, intégration et sécurité

- [ ] 8.1 Couvrir les resolvers multi-comptes, l'identité `sub`, la cible unique, les conflits multi-calendriers, la readiness Google et la migration des connexions existantes.
- [ ] 8.2 Couvrir l'idempotence de création et de retry, Meet `pending`, expiration/révocation OAuth, changement de cible, déconnexion, déplacement et annulation.
- [ ] 8.3 Couvrir les policies RLS et les loaders/actions avec owner, closer A et closer B : agenda, événement, lien, fiche, recherche et mutation hors périmètre.
- [x] 8.4 Vérifier le parsing JSON des locales, l'absence de clés manquantes ou dupliquées et la présence de chaque nouvelle clé dans `locales/en` et `locales/fr` ; relire les textes anglais et français pour retirer les tournures artificielles, les fallbacks et les tirets cadratins ou demi-cadratins anglais.

## 9. Parcours E2E avec agent-browser

- [x] 9.1 Charger les commandes du skill avec `rtk agent-browser skills get core --full`, préparer des fixtures et un fournisseur Google Calendar/Meet simulé ou de test, sans utiliser de secrets réels.
- [ ] 9.2 Inviter puis authentifier un owner et deux closers ; vérifier que chaque closer arrive sur ses propres paramètres et que l'OAuth est attaché à la bonne session.
- [ ] 9.3 Depuis le closer A, connecter deux comptes Google, choisir une cible et plusieurs calendriers de conflit, changer la cible, déconnecter un compte et vérifier les états de readiness et de reprise.
- [ ] 9.4 Vérifier avec `agent-browser` que le closer A ne voit que ses appels à venir et les liens des événements qui lui sont rattachés, que les événements du closer B sont absents et qu'une URL directe non rattachée est refusée.
- [ ] 9.5 Réserver un créneau public rattaché au closer A et vérifier l'événement Google cible, l'unicité du lien Meet, la confirmation, l'email et l'ICS ; rejouer la confirmation pour vérifier l'absence de doublon.
- [ ] 9.6 Vérifier les scénarios Meet `pending`, retry, déplacement, annulation et déconnexion du compte cible ; confirmer que le lien existant reste attaché au bon rendez-vous.
- [ ] 9.7 Contrôler la page paramètres et l'agenda à 390, 768, 1280 et 1440 px, au clavier et avec les états loading/error/empty, en vérifiant focus visible, labels et annonces d'erreur.

## 10. Validation finale

- [x] 10.1 Exécuter `npm run typecheck` et `npm run lint`, puis corriger les erreurs sans introduire de chaîne UI non traduite.
- [x] 10.2 Vérifier le diff et les logs pour confirmer l'absence de secrets, tokens OAuth, clés API ou données de session.
- [x] 10.3 Valider la proposition avec `rtk openspec validate add-booking-google-calendar-settings --type change --strict --no-interactive` et vérifier que tous les artefacts sont présents et cohérents.

> Les scénarios 8.1 à 9.7 qui nécessitent deux sessions Scale X, un fournisseur Google de test et l'accès à la page authentifiée restent à exécuter dans l'environnement E2E dédié. Le smoke test local couvre le parcours public, la redirection OAuth non authentifiée, les fixtures Calendar/Meet, les scopes owner/closer, le responsive 390/1280 px et l'audit axe.
