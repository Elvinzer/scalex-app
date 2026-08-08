# Tâches d'implémentation

Les tâches sont ordonnées par dépendance. Les tests de contrat et de sécurité doivent être ajoutés avec la fonctionnalité concernée ; la vérification visuelle `agent-browser` intervient une fois les états reliés.

## 1. Contrat de données et actions serveur

- [x] 1.1 Définir `CopiloteInsightSnapshot` versionné avec `kind`, `version`, `problem`, `actionText` et `successCriterion`, sans transcript.
- [x] 1.2 Ajouter le schéma Zod du contrat de capture : UUID de conversation, titre 1–120, problème 1–800, action 1–2 000, critère 1–1 000.
- [x] 1.3 Créer l'action serveur de capture Copilote qui vérifie la session, le compte courant et l'appartenance de la conversation.
- [x] 1.4 Dériver côté serveur le sujet et le `sourceLabel` `Falco · {sujet}` ; ne jamais accepter ces valeurs depuis le client.
- [x] 1.5 Persister les valeurs éditées dans les colonnes d'exécution existantes et dans le snapshot typé, avec `sourceType: "copilote"`, `sourceId: conversationId` et `decision: "todo"`.
- [x] 1.6 Préserver les adaptateurs des autres sources et éviter qu'un appel Copilote repasse par la reconstruction automatique d'une recommandation.
- [x] 1.7 Ajouter une contrainte unique dédiée aux lignes `source_type = 'copilote'` sur `(user_id, source_id)` et l'index nécessaire à la lecture par conversation.
- [x] 1.8 Générer la migration Drizzle ; vérifier les éventuels doublons avant contrainte, conserver la sauvegarde la plus ancienne et relier l'initiative existante si nécessaire.
- [x] 1.9 Vérifier et conserver les policies RLS sur `insight_records`, `improvement_initiatives`, `conversations` et les messages.
- [x] 1.10 Rendre la capture idempotente et sûre en concurrence : conflit unique, retour de l'insight existant, aucune initiative créée par effet de bord.
- [x] 1.11 Ajouter la projection publique de l'insight Copilote, de son snapshot et de son initiative pour la conversation, le Journal et l'historique.
- [x] 1.12 Ajouter une requête d'historique en lot qui joint la décision Copilote et le nombre de messages persistés sans N+1.
- [x] 1.13 Vérifier que `launchInsight` réutilise l'initiative unique et conserve le statut observable existant (`in_progress` après lancement actuel).

## 2. Sortie structurée et qualité Falco

- [x] 2.1 Définir le schéma de l'événement optionnel `falco_insight_proposal` et le valider aux frontières serveur et client.
- [x] 2.2 Étendre le prompt Falco pour demander les quatre champs uniquement lorsqu'une action concrète, une raison et un critère testable sont présents.
- [x] 2.3 Interdire au prompt de recalculer ou d'inventer les métriques ; injecter seulement les faits calculés côté serveur et accepter un critère qualitatif lorsque nécessaire.
- [x] 2.4 Émettre l'événement structuré dans le flux SSE sans modifier le message assistant normal ni sa persistance.
- [x] 2.5 Ignorer proprement les événements absents, interrompus, invalides, trop longs ou rattachés à une autre conversation.
- [x] 2.6 Implémenter la réponse guidée vague avec au moins deux réponses rapides et aucune action de sauvegarde.
- [x] 2.7 Créer un jeu de fixtures : action formulable, conseil vague, événement malformé, chiffres non calculables, conversation déjà liée et texte long.
- [x] 2.8 Vérifier que les logs de proposition ne contiennent ni transcript complet, ni secret, et que le comptage de tokens existant reste actif.

## 3. Composants UX partagés

- [x] 3.1 Créer `InsightActionCard` avec une machine d'états explicite : proposal, editing, saving, saved, launched, completed, vague, error et duplicate.
- [x] 3.2 Créer les champs éditables avec les labels exacts `Titre de l'action`, `L'action à implémenter` et `Critère de réussite`.
- [x] 3.3 Créer `InsightStatusBadge` avec un libellé écrit pour `À traiter`, `Lancé`, `À reprendre`, `Écartée` et `Terminée`.
- [x] 3.4 Créer `InsightSourceLine` affichant `Falco · {sujet de la conversation}` avec une icône Lucide de conversation.
- [x] 3.5 Créer `VagueActionPrompt` en bordure pointillée avec la microcopy validée et les réponses rapides.
- [x] 3.6 Créer `ExistingActionBanner` avec `Cette conversation a déjà une action associée.` et `Voir l'action`.
- [x] 3.7 Appliquer uniquement les tokens et variantes du design system : accent violet pour l'artefact Falco, corail pour l'action métier dominante, aucun hex ou emoji d'action.
- [x] 3.8 Reprendre les textes de `microcopy.md` et harmoniser les labels de statut avec `INITIATIVE_STATUS_LABELS` existants.

## 4. Intégration conversation et brouillon

- [x] 4.1 Rendre la carte comme dernier bloc du message Falco concerné, dans le flux de scroll, sans modale.
- [x] 4.2 Câbler `Garder cette action` vers l'état d'édition sans requête d'écriture.
- [x] 4.3 Câbler `Continuer à creuser` vers la poursuite normale de la conversation sans supprimer la carte.
- [x] 4.4 Câbler `Enregistrer l'insight` vers le contrat de capture avec les valeurs courantes et un verrou anti-double-clic.
- [x] 4.5 Afficher l'état `Enregistrement`, conserver les champs et fournir `Réessayer` en cas d'erreur `role="alert"`.
- [x] 4.6 Afficher `Insight conservé`, `À traiter`, le titre exact, `Lancer dans le Journal` et `Modifier` après succès.
- [x] 4.7 Stocker le brouillon d'édition dans `sessionStorage` par conversation, sans transcript, avec gestion SSR, quota et stockage indisponible.
- [x] 4.8 Restaurer exactement le brouillon à la réouverture du drawer et le nettoyer après sauvegarde ou annulation explicite.
- [x] 4.9 Afficher l'état existant pour `todo`, `launched`, `later`, `dismissed` et `completed` ; ne jamais afficher une seconde proposition persistable.
- [x] 4.10 Synchroniser le même composant dans la page Copilote et le drawer flottant, y compris après changement de conversation.

## 5. Lancement et cycle de vie

- [x] 5.1 Ouvrir le `InsightLaunchDialog` existant depuis `Lancer dans le Journal` sans créer un second contrat de lancement.
- [x] 5.2 Conserver le choix tâche/projet, l'échéance, le responsable soumis aux permissions et la priorité hebdomadaire cochée par défaut.
- [x] 5.3 Présenter le dialog comme feuille mobile sur la hauteur disponible tout en gardant les contrôles accessibles au clavier.
- [x] 5.4 Refléter immédiatement sur la carte le résultat retourné par `launchInsight` : statut `Lancé`, initiative, échéance et focus.
- [x] 5.5 Ne modifier aucune initiative ni priorité lors d'une annulation ou d'une fermeture avant confirmation.
- [x] 5.6 Vérifier la transition `todo → launched` et l'absence de bouton corail après lancement.
- [x] 5.7 Relier les contrôles existants `Plus tard`, `Écarter` et `Réactiver` sans créer de nouvel identifiant ou insight.
- [x] 5.8 Synchroniser `launched → completed` depuis le Journal et afficher `Terminée` dans la conversation et l'historique.
- [x] 5.9 Tester le remplacement de la priorité hebdomadaire et la conservation de l'ancienne initiative sans focus.

## 6. Journal et retours

- [x] 6.1 Afficher le titre exact, le corps exact de l'action et la source textuelle dans la vue Journal appropriée.
- [x] 6.2 Afficher le problème et le critère exact sous `Critère de réussite` dans le détail de l'action.
- [x] 6.3 Ne pas reformuler, tronquer définitivement ni régénérer le texte utilisateur ; fournir une vue détail pour les contenus longs.
- [x] 6.4 Ajouter `Voir la conversation` avec `/copilote?conversation=<conversationId>`.
- [x] 6.5 Faire sélectionner la conversation cible côté serveur/client et conserver le fallback sûr pour un identifiant absent, invalide ou étranger.
- [x] 6.6 Afficher la source en texte, indépendamment de la couleur ou du badge.
- [x] 6.7 Intégrer l'action dans la surface `Priorité de la semaine` existante sans dupliquer la logique de focus.
- [x] 6.8 Vérifier que le statut et le critère restent synchronisés après pause, reprise, terminaison ou suppression de la tâche liée.

## 7. Historique des conversations

- [x] 7.1 Ajouter la projection batch conversation → insight → décision → compteur de messages.
- [x] 7.2 Afficher les indicateurs exacts `Action à traiter`, `Action lancée`, `Action à reprendre`, `Action écartée` et `Action terminée`.
- [x] 7.3 Ne rien afficher pour une conversation sans insight tout en réservant la même hauteur de ligne.
- [x] 7.4 Garder la ligne limitée au sujet, à la date, au compteur de messages et à l'indicateur éventuel.
- [x] 7.5 Ouvrir la conversation et son état actuel au clic sans recréer de proposition.
- [x] 7.6 Vérifier l'isolation par compte et l'absence de N+1 sur une liste de conversations réaliste.

## 8. Deep-links et permissions

- [x] 8.1 Étendre les paramètres de `/copilote` pour accepter `conversation` en plus de `topic`.
- [x] 8.2 Sélectionner une conversation existante uniquement après vérification `conversation.userId = accountId`.
- [x] 8.3 Conserver le comportement actuel des liens `?topic=...` et des conversations créées par sujet.
- [x] 8.4 Définir le fallback UI sans révéler l'existence d'un UUID invalide ou étranger.
- [x] 8.5 Tester les lectures et mutations avec un membre d'équipe autorisé, non autorisé et un compte différent.

## 9. Responsive et accessibilité

- [x] 9.1 Vérifier les viewports 375 × 812, 390 × 844 et 1440 × 900, conformément à la maquette.
- [x] 9.2 Vérifier que le drawer mobile utilise la hauteur disponible et que le clavier ne masque ni carte ni composer.
- [x] 9.3 Garantir des cibles tactiles d'au moins 44 × 44 px et aucun scroll horizontal.
- [x] 9.4 Vérifier le focus visible, l'ordre de tabulation et les noms accessibles des boutons et champs.
- [x] 9.5 Annoncer chargements et erreurs, utiliser `role="alert"` pour les erreurs et ne jamais coder un état par couleur seule.
- [x] 9.6 Désactiver les animations de carte et de transitions sous `prefers-reduced-motion`.
- [x] 9.7 Vérifier les textes longs, le retour à la ligne et la lisibilité des badges à tous les viewports.
- [x] 9.8 Comparer les états à la maquette sans copier son HTML ni ses couleurs brutes.

## 10. Vérification automatisée et QA

- [x] 10.1 Tester les schémas Zod et les limites de longueur du contrat de capture.
- [x] 10.2 Tester la capture réussie, l'accès étranger, la conversation inexistante, l'erreur de base et le retour idempotent.
- [x] 10.3 Tester la contrainte unique et la course de deux sauvegardes concurrentes avec une base de test.
- [x] 10.4 Vérifier qu'aucune écriture n'a lieu avant `Enregistrer l'insight`.
- [x] 10.5 Tester la restauration et le nettoyage du brouillon `sessionStorage`, y compris storage indisponible.
- [x] 10.6 Tester l'événement SSE valide, absent, malformé, interrompu et périmé.
- [x] 10.7 Rejouer les fixtures de prompt et vérifier l'absence de proposition lorsque l'action est vague.
- [x] 10.8 Tester le lancement, l'annulation, la cible invalide, la priorité unique et la terminaison.
- [x] 10.9 Tester le deep-link valide, invalide, supprimé et étranger sans fuite de données.
- [x] 10.10 Utiliser `agent-browser` pour parcourir les états proposal, édition, saving, saved, launch dialog, launched, completed, vague, error, duplicate, long text et history sur desktop et mobile.
- [x] 10.11 Vérifier au navigateur les focus, labels, alertes, touch targets, reduced motion et absence de scroll horizontal.
- [x] 10.12 Exécuter `npm run typecheck`, `npm run lint`, les tests ciblés et la validation OpenSpec stricte.
- [x] 10.13 Vérifier le diff final qu'il ne contient aucun secret, transcript complet ou contenu sensible dans les logs, snapshots de test ou URLs.
- [x] 10.14 Préparer les réponses rapides contenant `[à compléter]` dans le composer avec focus, sans envoyer le placeholder avant personnalisation.
