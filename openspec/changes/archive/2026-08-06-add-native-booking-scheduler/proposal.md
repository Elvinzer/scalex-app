## Why

Minaly doit pouvoir récupérer des appels de vente sans dépendre exclusivement d’iClosed ou de Calendly. Une expérience native permettra aux utilisateurs de publier des liens de réservation, de contrôler leurs disponibilités et closers, puis de rattacher chaque rendez-vous à sa source marketing tout en conservant les règles métier de suivi des ventes.

Le parcours public doit aussi qualifier le prospect avant de révéler les créneaux, comme le parcours iClosed observé dans le screenshot fourni, afin de sécuriser les coordonnées et d’éviter les réservations multiples. Les coordonnées saisies avant un abandon doivent rester exploitables par l’équipe commerciale pour relancer une intention chaude.

## What Changes

- Ajouter la création et la gestion d’événements de réservation natifs dans Minaly.
- Permettre des disponibilités hebdomadaires, des exceptions par date, une mise en pause rapide et un fuseau horaire propre à chaque événement.
- Limiter le plan le moins cher à un événement ; rendre la création d’événements illimitée à partir du niveau d’abonnement supérieur, avec des entitlements administrables depuis `/admin/plans`.
- Permettre d’associer plusieurs closers à un événement et d’attribuer les réservations en round robin.
- Connecter les calendriers Google et Outlook de chaque closer pour exclure les périodes occupées et créer l’événement externe après réservation.
- Ajouter une page publique qui collecte d’abord le prénom, le nom et le téléphone avant de dévoiler les disponibilités, avec affichage dans le fuseau du prospect ou celui de l’événement.
- Bloquer côté serveur une nouvelle réservation lorsqu’un prospect possède déjà un rendez-vous futur non annulé, avec un avertissement compréhensible côté public.
- Publier des liens partageables et conserver les paramètres UTM, y compris la vidéo ou le canal d’origine, sur la réservation et l’appel de vente.
- Enregistrer directement une tentative de réservation dès qu’au moins une information est saisie, conserver sa dernière étape et le créneau consulté, puis l’exposer comme prospect à relancer tant qu’aucun rendez-vous n’est confirmé.
- Afficher ces prospects dans l’espace « Ventes → Rendez-vous » avec leurs coordonnées, leur événement, leur activité récente et leur attribution, ainsi que des actions « contacté » et « ignoré » account-scoped.
- Introduire les Rendez-vous comme nouvelle source de `sales_calls` sans casser les flux iClosed, Calendly ou manuels existants.
- Prévoir les confirmations, les états de réservation et les notifications nécessaires au suivi opérationnel.

## Capabilities

### New Capabilities

- `native-booking-events`: création, configuration, activation, pause et publication des événements natifs, disponibilités, exceptions, limites et fuseau horaire.
- `booking-closer-routing`: gestion des closers associés à un événement, round robin déterministe et attribution persistée de chaque réservation.
- `calendar-availability-sync`: connexion Google/Outlook par closer, lecture des périodes occupées et création idempotente des événements externes.
- `public-booking-flow`: collecte d’informations avant révélation des créneaux, suivi des tentatives abandonnées, sélection horaire, fuseaux, contrôle des rendez-vous futurs et confirmation.
- `booking-attribution`: liens de réservation nommés, capture UTM et rattachement de la source à la tentative, à la réservation et à l’appel de vente.
- `booking-entitlements`: droits d’abonnement administrables pour activer la fonctionnalité et limiter ou autoriser le nombre d’événements.

### Modified Capabilities

Aucune capacité existante n’a encore de spécification OpenSpec à modifier.

## Impact

- Schéma Postgres/Supabase, migrations, RLS et règles d’accès account/team pour les événements, disponibilités, closers, connexions calendaires, réservations, liens et attributions.
- Modèle et vues des appels de vente afin d’ajouter la source native et un identifiant de réservation sans renommer brutalement les champs historiques iClosed.
- Pages et actions authentifiées de `/ventes`, nouvel espace de configuration d’événement et extension de `/admin/plans`.
- Nouvelles routes publiques de réservation hors du layout authentifié, avec validation serveur, idempotence et rate limiting.
- Nouveau suivi account-scoped des prospects ayant abandonné le parcours, avec liaison vers une réservation en cas de conversion et affichage PII réservé aux membres autorisés.
- OAuth Google distinct de la connexion YouTube existante et OAuth Microsoft pour Outlook ; stockage sécurisé des tokens et traitement des erreurs de reconnexion.
- Notifications email, confirmations et éventuels jobs Inngest pour les opérations asynchrones.
- Tests fonctionnels et responsive de tous les parcours avec `agent-browser`, notamment l’opt-in, le blocage d’un rendez-vous existant, les UTM, les fuseaux, le round robin et les conflits calendaires.
