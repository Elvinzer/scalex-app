## 1. Modèle et normalisation

- [x] 1.1 Ajouter le modèle Drizzle `crm_lead_profiles` avec les clés account-scoped, les contraintes d'un profil par réseau et les policies RLS.
- [x] 1.2 Centraliser la normalisation des profils, des noms, des emails et des téléphones avec un contexte pays explicite.
- [x] 1.3 Ajouter le helper WhatsApp qui produit `https://wa.me/<digits>` uniquement pour un téléphone validé.

## 2. Migration et compatibilité legacy

- [x] 2.1 Générer la migration Drizzle additive, vérifier les index/RLS et préparer le rapport de collisions avant toute écriture de données.
- [x] 2.2 Backfiller les profils legacy dans le compte correspondant sans supprimer les colonnes historiques ni les événements CRM.
- [x] 2.3 Extraire les numéros valides des anciennes URLs `wa.me`, remplir les téléphones manquants et conserver les conflits pour revue.
- [x] 2.4 Adapter les imports et écritures legacy pour ajouter un profil sans remplacer les profils existants, avec idempotence.

## 3. Résolution cross-réseaux

- [x] 3.1 Implémenter la résolution URL exacte en priorité, strictement limitée au compte serveur courant, avec une réponse légère.
- [x] 3.2 Ajouter les clés de recherche et index nécessaires pour téléphone/email, nom/pseudo normalisés et le fallback de proximité mesuré.
- [x] 3.3 Implémenter le classement déterministe borné à cinq candidats avec les signaux affichables et sans chargement d'historique ni appel IA.
- [x] 3.4 Ajouter la recherche manuelle current-account pour les cas où les informations visibles ne suffisent pas.
- [x] 3.5 Rendre le rattachement de profil transactionnel, idempotent et explicite en cas de conflit de réseau ou d'URL.

## 4. Compte, session et cache de l'extension

- [x] 4.1 Lier les résolutions du cache au profil capturé et au contexte de session/compte, puis invalider le cache lors d'un changement de compte.
- [x] 4.2 Ignorer les réponses tardives d'un ancien compte et revérifier côté serveur le candidat avant toute mutation.
- [x] 4.3 Conserver un contrat de réponse compatible avec l'extension précédente pendant le déploiement progressif.

## 5. Interfaces CRM et extension

- [x] 5.1 Afficher plusieurs profils sociaux dans la fiche lead, séparés de la source marketing et du téléphone.
- [x] 5.2 Ajouter l'action WhatsApp sur la fiche et les états manquant/invalide sans afficher de lien fabriqué.
- [x] 5.3 Mettre à jour la carte extension pour afficher les suggestions cross-réseaux, leurs signaux, la confirmation et la création séparée.
- [x] 5.4 Ajouter le parcours de recherche manuelle dans l'extension et conserver le responsable en lecture seule.
- [x] 5.5 Ajouter les clés i18n FR/EN, vérifier les placeholders et tester les états unknown, known, ambiguous, session et conflict.

## 6. Versionnement et publication de l'extension

- [x] 6.1 Passer `extension/manifest.json` à `0.3.0` et synchroniser les assertions de version de l'extension et de l'API release.
- [x] 6.2 Recompiler `extension/dist`, produire les archives versionnée/latest et vérifier que le ZIP ne contient que les fichiers runtime autorisés.
- [x] 6.3 Mettre à jour la documentation de release et vérifier que la version précédente est refusée par le packageur.

## 7. Vérification et déploiement

- [x] 7.1 Ajouter les tests de normalisation, de migration, d'idempotence, de rattachement sans écrasement et d'isolation entre comptes.
- [x] 7.2 Ajouter les tests de classement avec homonymes, accents, séparateurs, contacts partagés et signaux contradictoires.
- [x] 7.3 Ajouter les tests extension de contrat, cache/changement de compte, package versionné et endpoint de release.
- [x] 7.4 Générer puis appliquer la migration, lancer `npm run typecheck`, `npm run lint` et `npm run test`.
- [x] 7.5 Vérifier le runtime des fiches CRM et de l'extension avec Next/Turbopack et les parcours visibles correspondants avant activation sur `clubvipfinance`.
