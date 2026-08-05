## 1. Contract and dependency check

- [x] 1.1 Vérifier que `add-native-booking-scheduler` fournit les tables, statuts, permission `ventes:rdv` et panneau `À relancer` attendus par ce changement
- [x] 1.2 Cartographier les permissions de destination pour Pipeline, Appels et Rendez-vous et définir le comportement owner/membre
- [x] 1.3 Documenter les formats d’identifiant et de deep link pour les quatre types d’actions

## 2. Revenue action projection

- [x] 2.1 Ajouter les types de projection pour rappel, décision de closing, no-show et prospect natif
- [x] 2.2 Implémenter la lecture account-scoped des sources existantes sans ajouter de table ni de migration
- [x] 2.3 Implémenter la déduplication d’un lead manuel entre no-show et rappel
- [x] 2.4 Implémenter l’ordre déterministe et les libellés d’urgence explicables
- [x] 2.5 Filtrer les actions par permissions de destination côté serveur
- [x] 2.6 Ajouter les tests unitaires de projection, de priorité, de déduplication et de cloisonnement de compte

## 3. Dashboard action center

- [x] 3.1 Séparer la projection de revenu des alertes techniques existantes dans le modèle de données du Dashboard
- [x] 3.2 Remplacer la présentation actuelle par le bloc `À faire maintenant` avec une seule action principale et des actions secondaires neutres
- [x] 3.3 Ajouter les états vide, chargement, erreur et liste longue sans créer de nouvelle entrée de navigation
- [x] 3.4 Afficher raison, urgence, valeur éventuelle et destination sans utiliser la couleur comme seul signal

## 4. Source deep links

- [x] 4.1 Ajouter le paramètre ciblé et le focus d’un lead dans Pipeline
- [x] 4.2 Ajouter le paramètre ciblé et le focus/ouverture d’un appel dans Appels
- [x] 4.3 Ajouter le paramètre ciblé et la mise en évidence d’un prospect dans Rendez-vous
- [x] 4.4 Prévoir une sortie clavier et un retour vers le Dashboard depuis chaque contexte ciblé

## 5. UX, responsive and accessibility

- [x] 5.1 Respecter les tokens de la DA, le CTA corail unique et le violet réservé au Copilote/analytics
- [x] 5.2 Vérifier les états focus, les noms accessibles, les annonces d’erreur et les zones interactives d’au moins 44 px
- [x] 5.3 Prévoir une présentation empilée à 375 px et supprimer tout scroll horizontal essentiel sur la file d’actions
- [x] 5.4 Respecter la préférence de réduction des animations et limiter les transitions à des feedbacks utiles
- [ ] 5.5 Parcourir le Dashboard, Pipeline, Appels et Rendez-vous avec `agent-browser` aux largeurs 375, 768, 1024 et 1440 px

## 6. Validation and rollout

- [x] 6.1 Ajouter les scénarios de permission owner/membre et les cas sans aucune action accessible
- [x] 6.2 Vérifier qu’aucune PII ou action d’un autre compte n’est exposée dans la projection ou les URLs
- [x] 6.3 Lancer `npm run typecheck` et `npm run lint`
- [x] 6.4 Vérifier qu’aucune migration n’est nécessaire et ne pas lancer `db:push` pour cette tranche
- [ ] 6.5 Effectuer une revue visuelle finale avec `agent-browser` et comparer la présence/absence des blocs revenue et technique
