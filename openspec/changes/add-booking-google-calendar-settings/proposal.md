## Why

La prise de rendez-vous native sait déjà synchroniser un événement externe, mais elle ne permet qu'une connexion Google par closer et mélange encore la configuration des calendriers avec l'éditeur d'un événement. Elle doit proposer le même modèle que l'UX iClosed : plusieurs comptes Google connectés par closer, un compte cible pour les nouvelles invitations et une sélection indépendante des calendriers utilisés pour détecter les conflits.

La réservation doit aussi créer automatiquement un événement Google Calendar avec une conférence Google Meet unique, conserver ce lien sur la réservation et empêcher les nouveaux rendez-vous lorsqu'un closer n'a pas de configuration Google valide.

## What Changes

- Ajouter une page de paramètres dédiée aux calendriers de la prise de rendez-vous, accessible à chaque closer invité depuis ses paramètres personnels.
- Utiliser l'invitation de l'équipe et la session du closer comme frontière d'identité : chaque closer connecte ses propres comptes Google et ne peut voir que ses appels à venir.
- Limiter la liste des liens de prise de rendez-vous internes aux événements auxquels le closer est rattaché ; les contrôles d'accès doivent être appliqués côté serveur, y compris sur les accès directs aux routes et actions.
- Permettre à un closer de connecter plusieurs comptes Google, de les reconnecter ou de les désactiver sans écraser les autres connexions.
- Séparer le compte/calendrier qui reçoit les nouvelles invitations des comptes/calendriers utilisés pour vérifier les conflits de disponibilité.
- Utiliser un identifiant stable du compte Google pour distinguer plusieurs autorisations, sans utiliser l'adresse email comme identifiant technique.
- Rendre la configuration Google obligatoire pour qu'un closer puisse recevoir de nouveaux créneaux natifs ; conserver les rendez-vous existants lors d'une modification ou d'une déconnexion.
- Afficher un avertissement actionnable sur `/ventes/rdv` lorsqu'un closer concerné n'a pas de compte cible ou de calendrier de conflit configuré, avec redirection vers les paramètres.
- Empêcher l'activation d'un événement qui contient un closer actif non configuré.
- Créer automatiquement l'événement Google Calendar et une conférence Google Meet unique lors de la confirmation d'une réservation.
- Stocker le lien Google Meet sur chaque réservation, séparément du lien vers l'événement Google Calendar, et le propager à la confirmation publique, aux emails, aux rappels et au fichier `.ics`.
- Rendre la création Google idempotente et récupérable lorsque la génération de la conférence est asynchrone ou échoue.
- Conserver les réglages et connexions Outlook existants pour compatibilité, mais une connexion Outlook seule ne satisfait plus la readiness requise pour la prise de rendez-vous native.

## Capabilities

### New Capabilities

- `booking-calendar-settings`: configuration par closer de plusieurs comptes Google, du compte cible d'invitation et des calendriers de vérification des conflits.

### Modified Capabilities

- `calendar-availability-sync`: sélection explicite du compte/calendrier cible, exigence d'une configuration Google valide, création d'événements Google avec Google Meet et reprise idempotente.
- `native-booking-events`: readiness et activation conditionnées par la configuration calendrier de chaque closer actif.
- `unified-booking-agenda`: visibilité des appels et des liens d'événement filtrée par le closer connecté, avec conservation des droits account-wide des owners/admins autorisés.
- `public-booking-flow`: retour et affichage du lien de réunion généré sur la confirmation d'une réservation native.
- `booking-notifications`: utilisation du lien Meet propre à la réservation dans les emails, rappels et exports `.ics`.

## Impact

- **Base de données** : évolution de `native_calendar_connections` pour autoriser plusieurs comptes Google par closer et identifier le compte fournisseur de façon stable ; ajout de la configuration booking cible/conflits ; ajout du lien Meet snapshoté sur `native_bookings` ; migrations Drizzle et politiques RLS associées.
- **OAuth et adaptateur calendrier** : routes de connexion/callback, récupération de l'identité Google, sélection des calendriers accessibles en écriture, création/polling de `conferenceData` et gestion des connexions désactivées.
- **Domaine booking** : attribution d'un closer configuré, confirmation idempotente, synchronisation Google Calendar, annulation/déplacement et retries Inngest.
- **Interface** : nouvelle page paramètres Calendriers, avertissement sur `/ventes/rdv`, readiness des événements et retrait des contrôles de connexion depuis l'éditeur d'événement.
- **Accès équipe** : invitation des closers, garde serveur par utilisateur courant, vue agenda personnelle et filtrage des événements rattachés ; aucun filtrage ne repose uniquement sur le client.
- **Surfaces publiques et emails** : confirmation, lien de gestion, rappels et `.ics` doivent utiliser le lien Meet de la réservation sans exposer de secret OAuth ou de jeton de gestion.
- **Internationalisation et validation** : chaque nouveau texte visible, y compris l'interface, les emails et les erreurs, sera présent dans `locales/en` et `locales/fr`. L'anglais sera réécrit avec le skill humanizer avant sa traduction française. Les clés, placeholders et structures resteront synchronisés, sans fallback qui masque une traduction manquante.
