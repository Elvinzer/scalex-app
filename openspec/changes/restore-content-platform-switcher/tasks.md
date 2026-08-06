## 1. Préparer le contrat de données

- [ ] 1.1 Adapter le chargement serveur de `/acquisition/contenu` pour fournir les données Instagram, YouTube, les connexions et les états de synchronisation nécessaires aux deux panneaux.
- [ ] 1.2 Conserver les garde-fous de données : filtrer les publications Instagram par source et exclure les vidéos YouTube privées ou non listées avant tout calcul ou affichage global.
- [ ] 1.3 Vérifier que les statistiques commerciales YouTube restent associées aux bonnes vidéos sans modifier le schéma ni les APIs existantes.

## 2. Construire le shell de sélection de plateforme

- [ ] 2.1 Créer le conteneur interactif de la page Contenu avec Instagram et YouTube, leurs statuts de connexion et une sélection par défaut stable.
- [ ] 2.2 Afficher une seule plateforme à la fois et rendre les plateformes non connectées sélectionnables afin d’exposer leur carte de connexion.
- [ ] 2.3 Réintégrer la carte complète de connexion/synchronisation de la plateforme active avant ses filtres et métriques.
- [ ] 2.4 Utiliser les composants d’interface et tokens de la DA existants, avec un état actif visible et sans couleurs de plateforme ajoutées en dur.

## 3. Réintégrer les vues spécialisées sans perte de données

- [ ] 3.1 Recomposer le panneau Instagram avec ses KPI, période, top 3, tableau paginé, colonnes, explications et dialogue de détail actuels.
- [ ] 3.2 Recomposer le panneau YouTube avec ses KPI, période, format, top 3, tableau paginé, colonnes commerciales, explications et dialogue de détail actuels.
- [ ] 3.3 Hoister la période dans le shell et conserver les filtres propres à chaque plateforme lors d’un aller-retour entre Instagram et YouTube.
- [ ] 3.4 Vérifier que chaque changement de filtre réinitialise uniquement la pagination nécessaire et que KPI, top 3 et tableau utilisent les cohortes prévues.

## 4. Assurer la navigation et les URLs

- [ ] 4.1 Synchroniser la plateforme active avec `?platform=instagram|youtube`, gérer les valeurs invalides et restaurer l’état au rechargement.
- [ ] 4.2 Préserver les anciennes URLs `/acquisition/contenu/instagram` et `/acquisition/contenu/youtube` en les faisant aboutir au panneau canonique correspondant.
- [ ] 4.3 Vérifier que le changement de plateforme reste immédiat et ne réintroduit pas le détour overview → détail.

## 5. Vérifier accessibilité et responsive

- [ ] 5.1 Garantir l’utilisation clavier du sélecteur, un focus visible, un état sélectionné annoncé sémantiquement et des libellés compréhensibles sans dépendre de la couleur.
- [ ] 5.2 Vérifier des cibles interactives d’au moins 44 pixels et un espacement suffisant entre les plateformes et CTA.
- [ ] 5.3 Vérifier les viewports 375, 768 et 1440 pixels : pas de débordement de la page, sélecteur lisible, tableaux confinés à leur défilement local.
- [ ] 5.4 Lancer un audit `agent-browser a11y` et traiter toute nouvelle violation introduite par la page Contenu ; documenter séparément les violations globales préexistantes.

## 6. Tester et valider

- [ ] 6.1 Tester avec `agent-browser` les états aucune connexion, une seule connexion et deux connexions, avec capture des transitions de plateforme.
- [ ] 6.2 Tester les filtres Instagram et YouTube, la conservation de période/format, les top 3, la pagination et l’ouverture des dialogues de détail.
- [ ] 6.3 Tester les deep links query param et les anciennes URLs de détail, puis vérifier le comportement du retour navigateur.
- [ ] 6.4 Exécuter `npm run typecheck` et `npm run lint`, puis vérifier que la modification ne nécessite aucune migration Drizzle.
