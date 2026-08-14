## Why

Minaly n'a pas encore de canal structuré pour recevoir les problèmes et demandes d'évolution. Les retours risquent de rester dispersés, sans contexte de page, sans capture exploitable, sans historique de traitement et sans file de suivi commune pour l'équipe.

Le module doit fournir un support intégré à Minaly, sans abonnement Helpdesk ni service payant supplémentaire : PostgreSQL et le Storage existants portent les tickets, tandis que Discord sert de canal de notification interne.

## What Changes

- Ajouter un parcours utilisateur global pour signaler un problème, poser une question ou proposer une évolution depuis n'importe quelle page authentifiée.
- Préremplir le contexte de la page courante : écran métier, route nettoyée, langue, navigateur, viewport et horodatage côté serveur.
- Proposer par défaut une capture de la page visible, avec prévisualisation, retrait possible et limites de taille/rétention.
- Ajouter une page utilisateur `/support` pour consulter ses tickets, leur statut et les échanges avec Minaly.
- Ajouter une console interne `/admin/support` avec liste, recherche, filtres, détail, assignation, priorité, statuts, commentaires publics, notes internes et historique.
- Définir un cycle de vie complet des tickets : réception, triage, traitement, attente utilisateur, résolution, fermeture, doublon et refus.
- Ajouter une permission interne dédiée `support:tickets`, séparée des rôles des équipes clientes et des droits fondateurs.
- Prévoir les rôles internes `support_agent` et `support_manager`, sans donner au support l'accès aux abonnements, clés API, données Stripe ou impersonation.
- Envoyer une notification Discord à la création d'un ticket, avec référence, identité, compte, page, contenu, contexte et lien Admin.
- Enregistrer l'état de livraison Discord et permettre une nouvelle tentative depuis la console si la notification échoue.
- Conserver Minaly comme source de vérité ; Discord reste un canal d'alerte et ne remplace pas l'historique du ticket.
- Ne pas introduire de SaaS de ticketing, de serveur dédié ou de dépendance payante.

## Capabilities

### New Capabilities

- `support-ticket-intake`: création de tickets côté utilisateur, contexte automatique, capture facultative, consultation et échanges liés à ses tickets.
- `support-ticket-management`: console Admin, cycle de vie, recherche, assignation, commentaires, notes internes, historique et contrôle d'accès dédié au support.
- `support-discord-notifications`: notification Discord server-side, récapitulatif, liaison avec le ticket Minaly, suivi des erreurs et nouvelle tentative.

### Modified Capabilities

Aucune capacité existante documentée dans `openspec/specs/` ne change directement de contrat.

## Impact

- Nouvelles routes et composants sous `app/(app)/support/`, `app/admin/support/` et le shell global authentifié.
- Extension de `app/admin/layout.tsx` et de l'autorisation interne afin de distinguer fondateurs et agents support.
- Nouvelles tables Drizzle pour les tickets, pièces jointes, commentaires, événements et membres/rôles internes, avec migration additive et RLS adaptée.
- Nouvelles fonctions serveur et route handler authentifié avec validation Zod, rate limiting et contrôle d'accès indépendant sur chaque mutation.
- Utilisation du Storage Supabase existant pour les captures privées, avec quota, compression et rétention bornée.
- Nouvelle variable d'environnement server-only pour le webhook Discord ; sa valeur ne doit apparaître ni dans le dépôt, ni dans les logs, ni dans le frontend.
- Utilisation des mécanismes existants de notification/retry et des tests i18n, sécurité, permissions, migration et parcours responsive.
