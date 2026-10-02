## 1. Planning and contracts

- [x] 1.1 Créer la proposition, la spécification comportementale et le design du changement.

## 2. Post-auth landing

- [x] 2.1 Modifier la destination post-auth des propriétaires ayant terminé l’onboarding vers `/dashboard`, sans changer les branches onboarding ou membres.
- [x] 2.2 Ajouter ou ajuster les tests de destination post-auth pour propriétaire existant, nouveau propriétaire et membre.

## 3. Bottleneck source clarity

- [x] 3.1 Ajouter les clés FR/EN pour le libellé de provenance et mapper chaque type de source vers son nom de page et son URL existante.
- [x] 3.2 Afficher le texte de source visible et cliquable dans chaque étape du funnel, y compris pour une étape non mesurée.
- [x] 3.3 Remplacer `sourceLink` par « Saisir les données » et son miroir anglais dans les deux catalogues.

## 4. Inline bottleneck details

- [x] 4.1 Déplacer le résumé actuellement dans le dialogue sous le funnel, avec une hiérarchie et des tokens de texte lisibles.
- [x] 4.2 Supprimer le bouton et le dialogue « Voir le détail » sans retirer le dialogue Falco d’une étape.
- [x] 4.3 Nettoyer les états et traductions devenus inutiles.

## 5. Verification

- [x] 5.1 Ajouter ou mettre à jour les tests ciblés du composant et des catalogues FR/EN.
- [ ] 5.2 Vérifier le rendu authentifié du Dashboard, les liens source, le changement de parcours et l’ouverture Falco avec `agent-browser`.
  - Le compte de test actif n’a qu’un parcours, donc le sélecteur ne s’affiche pas. Le test du composant couvre deux parcours; il reste à vérifier le changement interactif dans le navigateur avec un compte qui en possède plusieurs.
  - Recontrôle local en lecture seule le 2 octobre 2026 avec `agent-browser` : le Dashboard authentifié rend le funnel et son résumé inline. Les liens source ouvrent `/crm/appels` et `/ventes/suivi`; le dialogue d’étape Falco s’ouvre puis se ferme sans retirer le résumé. Le compte n’a toujours qu’un parcours, donc aucun sélecteur à actionner.
  - Le CTA « Améliorer » du dialogue n’a pas été activé : son handler écrit `improve_chat_opened`, monte le chat avec une question initiale et déclenche une requête IA. Il faut un compte de test à plusieurs parcours pour finir le changement de parcours; l’autorisation du clic Falco en production est demandée séparément. Tâche maintenue ouverte.
- [x] 5.3 Exécuter `npm run typecheck`, `npm run lint` et `npm run test`.
- [x] 5.4 Vérifier le diff final, les clés FR/EN et l’absence de secrets ou de migration non prévue.
