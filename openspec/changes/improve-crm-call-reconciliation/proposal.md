## Why

La vue CRM Appels affiche aujourd’hui tous les appels non reliés avec le même
libellé et masque une partie des informations déjà présentes dans la source
canonique. L’équipe ne peut donc ni identifier rapidement l’appel, ni croiser
un appel historique avec le bon lead sans ouvrir plusieurs outils et prendre
le risque d’une mauvaise association.

## What Changes

- Afficher une identité exploitable pour chaque appel : invité, coordonnées
  disponibles, source, type d’événement, date et heure, durée et référence
  externe lisible et copiable.
- Ajouter une vue détaillée d’un appel et des filtres pour retrouver un appel
  non relié par identité, source, date, statut ou référence.
- Générer une suggestion de rapprochement Falco à partir d’un petit ensemble de
  candidats du même compte, avec niveau de confiance, raisons explicites et
  alternatives éventuelles.
- Permettre de confirmer, refuser ou ignorer une suggestion ; une suggestion ne
  créera et ne modifiera jamais un lien automatiquement.
- Conserver l’origine du rapprochement, l’acteur, la décision, la version de
  suggestion et l’empreinte des données utilisées pour rendre l’opération
  auditable et rejouable.
- Traiter les nouveaux appels de façon asynchrone et permettre de lancer une
  analyse contrôlée du stock historique non relié, sans appeler Falco à chaque
  affichage de la page.
- Conserver `sales_calls` comme source canonique et réutiliser
  `crm_call_links` pour le lien confirmé ; aucune seconde base d’appels ne sera
  créée.

## Capabilities

### New Capabilities

- `crm-call-reconciliation`: rendre les appels identifiables et proposer un
  rapprochement assisté, contrôlé par l’utilisateur, entre appels et leads CRM.

### Modified Capabilities

Aucune capacité existante dans `openspec/specs/` ne porte encore le contrat CRM
V1 ; le nouveau change dépend de `add-crm-lead-capture` pour ses appels
canoniques, ses permissions et ses liens audités.

## Impact

- Surface `/crm/appels`, sa version responsive et la fiche d’un appel.
- Services CRM de lecture, de classement des candidats, de suggestion et de
  confirmation de lien.
- Contrat Falco/agent avec réponse structurée, validation Zod, BYOK prioritaire
  et journalisation des tokens sans exposer de secret.
- Éventuel job Inngest pour les suggestions asynchrones et la reprise du stock.
- Schéma additif pour les suggestions et décisions de rapprochement, avec RLS
  par compte et rollback par désactivation de la fonctionnalité.
- Aucun appel à l’API Instagram, LinkedIn, iClosed ou Calendly supplémentaire
  n’est requis pour le rapprochement.
