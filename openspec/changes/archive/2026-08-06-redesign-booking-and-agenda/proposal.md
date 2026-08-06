## Why

La réservation native possède déjà les briques de disponibilité, d’attribution et de synchronisation, mais son parcours public reste monolithique et son écran de gestion ne couvre que les réservations natives. Cette refonte doit transformer la prise de rendez-vous en parcours progressif qualifiant, fournir une vision opérationnelle de tous les rendez-vous et rendre les communications prospect configurables, sans perdre l’historique ni l’attribution existants.

## What Changes

- Remplacer le formulaire public unique par un parcours progressif : téléphone, identité, email/questions, puis calendrier.
- Valider les coordonnées au blur et côté serveur, avec téléphone international E.164 et `+33` par défaut.
- Permettre à chaque événement de définir cinq types de questions dynamiques : `radio`, `checkbox`, `text`, `textarea` et `select`.
- Afficher par défaut les créneaux publics dans le fuseau de l’événement, avec bascule vers le fuseau du prospect.
- Conserver la confirmation publique, l’annulation et le déplacement sécurisés, ajouter l’email prospect et proposer un fichier `.ics`.
- Ajouter des emails prospect de confirmation, d’annulation et de déplacement.
- Ajouter des rappels email configurables par événement : message, variables et délai avant le rendez-vous ; les rappels sont idempotents, supprimés à l’annulation et recalculés lors d’un déplacement.
- Remplacer l’écran `/ventes/rdv` par un agenda unifié natif, iClosed et Calendly, avec distinction par source et actions en lecture seule pour les sources externes.
- Rendre fonctionnelles les vues Agenda, Semaine et Liste, les filtres combinables synchronisés dans l’URL et le drawer de fiche.
- Autoriser le déplacement et l’annulation uniquement des rendez-vous natifs ; un déplacement conserve toujours le closer et ne réattribue jamais les rendez-vous existants.
- Ajouter l’affichage `.ics` et préserver `/ventes/appels` comme journal/funnel détaillé.
- Utiliser une durée externe optionnelle ; afficher 30 minutes par défaut lorsque iClosed ou Calendly ne fournissent pas de durée.

## Capabilities

### New Capabilities

- `unified-booking-agenda`: agenda account-scoped réunissant les rendez-vous natifs, iClosed et Calendly, avec vues, filtres, sources, fiches et actions autorisées.
- `booking-qualification-questions`: configuration, rendu public, validation et persistance des questions dynamiques d’un événement.
- `booking-notifications`: emails transactionnels prospect, rappels configurables, variables de message et export `.ics`.

### Modified Capabilities

- `public-booking-flow`: le parcours devient progressif, collecte l’email et les réponses, utilise le fuseau de l’événement par défaut et conserve les actions de gestion post-réservation.
- `native-booking-events`: la configuration d’un événement inclut les questions et les règles de rappels ; l’interface de personnalisation les expose.
- `booking-closer-routing`: un déplacement natif conserve le closer courant et le round-robin ; le rééquilibrage ne réattribue aucun rendez-vous existant.

## Impact

- Schéma Drizzle et migrations pour les questions, réponses, règles de rappels, exécutions de notifications et données de durée/source nécessaires à l’agenda.
- Page publique `/book/[slug]`, route publique de réservation et validation serveur.
- Pages et actions `/ventes/rdv`, éditeur d’événement et données de lecture unifiées avec `/ventes/appels`.
- Inngest, Resend, génération de fichiers `.ics` et mécanismes d’idempotence des notifications.
- Ajout de `libphonenumber-js` pour la validation et la normalisation internationale du téléphone.
- Tests de concurrence, sécurité account-scoped, accessibilité, responsive et parcours de bout en bout avec `agent-browser`.
- Aucun changement de code n’est inclus dans cette étape de spécification.
