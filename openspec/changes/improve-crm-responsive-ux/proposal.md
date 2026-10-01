## Why

Les pages CRM restent difficiles à parcourir quand les listes grandissent et quand l’espace d’écran diminue : les leads et les étapes de pipeline sont plafonnés, les filtres d’appels prennent le dessus sur les résultats et la sous-navigation peut se replier sur plusieurs lignes. Le handoff Claude Design fournit une direction cohérente pour remettre les actions au premier plan et rendre toutes les surfaces CRM réellement responsive.

## What Changes

- Réorganiser Aujourd’hui, Leads, Pipeline, Actions, Appels, fiche lead, import et extension selon le handoff, sur mobile, tablette et desktop.
- Rendre la portée des résultats Leads et Pipeline explicite, avec un chargement progressif adapté aux filtres et à chaque étape.
- Remplacer le sélecteur d’association d’appel limité aux leads préchargés par une recherche serveur dans les leads autorisés du compte.
- Garder la sous-navigation CRM sur une seule ligne en mode compact et rendre l’accès Extension permanent.
- Garder les contrats métier existants pour les actions, les étapes, les appels, les imports et la fiche lead ; traiter le prototype comme référence visuelle et interactionnelle, pas comme code à intégrer.
- Préserver la direction artistique et les règles de localisation du projet, même lorsque le prototype les contredit.

## Capabilities

### New Capabilities

- `crm-responsive-workspace`: navigation, hiérarchie des pages CRM, recherche et consultation à grande échelle, ainsi que leur comportement responsive.

### Modified Capabilities

Aucune capability CRM principale n’existe encore dans `openspec/specs/`. Les changes CRM actifs restent des contrats de référence : cette proposition ne les remplace pas et ne modifie pas leurs règles de métier.

## Impact

- Surfaces : `/crm`, `/crm/leads`, `/crm/pipeline`, `/crm/actions`, `/crm/appels`, la fiche lead, l’import et `/crm/extension`.
- UI : layout CRM, `PillarTabs`, cartes d’action, liste/tableau de leads et d’appels, board de pipeline, association manuelle d’appel, fiche lead et formulaires d’import/capture.
- Données : requêtes CRM bornées et paginées pour Leads et par étape du Pipeline ; recherche serveur pour l’association d’appel. Aucun changement de source de vérité CRM n’est prévu.
- Locales : clés FR et EN synchronisées pour tout libellé ou état modifié.
- Compatibilité : conserver les invariants du change `improve-crm-mobile-setter-workflow`, les liens canoniques d’appels et le rapprochement Falco existant.
- Design system : réutiliser les tokens et composants du dépôt ; aucun nouveau package n’est nécessaire au cadrage.
