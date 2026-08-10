## 1. Connexion, permissions et modèle de données

- [x] 1.1 Définir les schémas Zod et enums : statut de connexion, scope accordé, statut de sync, statut d'accès au compte, type de campagne, `source` / `calculation` / `attribution`
- [x] 1.2 Ajouter les tables `meta_connections`, `meta_ad_accounts`, `meta_campaigns`, `meta_ad_sets`, `meta_ads`, `meta_metrics_daily` avec RLS et index account-scoped
- [x] 1.3 Chiffrer les tokens via `lib/crypto.ts` ; persister le scope réellement accordé ; ne jamais logger ni exposer les tokens
- [x] 1.4 Ajouter les tables `meta_campaign_settings` (type + cibles business), `meta_touchpoints` (attribution) et `meta_action_log` (audit)
- [x] 1.5 Persister sur chaque série la fenêtre de consolidation effective (`consolidation_until`, fenêtre d'attribution, délai de traitement)
- [x] 1.6 Générer et appliquer la migration Drizzle ; vérifier les policies owner/membre ; ne jamais utiliser `db push`

## 2. OAuth lecture et step-up écriture

- [x] 2.1 Implémenter `/api/meta/connect` avec `ads_read` uniquement et `state` signé, sur le modèle d'Instagram
- [x] 2.2 Implémenter le modal de consentement : données lues, permission demandée, absence totale d'écriture à ce stade
- [x] 2.3 Implémenter l'écran de sélection de compte : liste, identifiant masqué, devise, fuseau, statut d'accès, aucune sélection par défaut
- [x] 2.4 Implémenter `/api/meta/upgrade` : step-up OAuth `ads_management` déclenché par la première action directe, avec son propre écran de consentement
- [x] 2.5 Implémenter le refus de step-up : repli sur le deep-link Meta, connexion en lecture préservée
- [x] 2.6 Implémenter les états de connexion : skeleton, redirection, retour réussi, erreur d'autorisation, permission refusée, aucun compte publicitaire
- [x] 2.7 Implémenter `Rafraîchir maintenant`, `Changer de compte`, `Déconnecter` et la révocation côté Meta

## 3. Synchronisation

- [x] 3.1 Implémenter la fonction Inngest de synchronisation initiale (90 jours) avec budget de temps et reprise en arrière-plan
- [x] 3.2 Implémenter le rafraîchissement périodique (6 h) et la resynchronisation à la demande, idempotents
- [x] 3.3 Calculer la fenêtre de consolidation par compte et par série ; réécrire les jours non consolidés et journaliser toute correction d'un jour déjà consolidé
- [x] 3.4 Implémenter les états d'erreur persistants : token expiré, permission supprimée, sync échouée, données partielles, compte inaccessible
- [x] 3.5 Ajouter les tests de cloisonnement de compte et de non-régression des données déjà lues en cas d'erreur

## 4. Provenance et métriques

- [x] 4.1 Implémenter les calculs dérivés déterministes : hook rate, hold rate, CTR sortant, CPL/CPA, fréquence, part de budget
- [x] 4.2 Implémenter le triplet de provenance `source` / `calculation` / `attribution` sur chaque métrique exposée, et le libellé UI dérivé
- [x] 4.3 Implémenter le calcul de couverture par source, par niveau de rattachement et par période
- [x] 4.4 Implémenter l'état `indisponible` d'une étape de funnel dont la source n'est pas connectée, avec la source manquante nommée
- [x] 4.5 Ajouter les tests sur données manquantes, périodes incomplètes et absence de zéro artificiel

## 5. Chaîne d'attribution

- [x] 5.1 Spécifier et implémenter les paramètres sortants attendus sur les URL Meta (`utm_*`, `campaign_id`, `adset_id`, `ad_id`) et le guide de configuration côté utilisateur
- [x] 5.2 Implémenter la capture first-party du touchpoint sur la landing page, avec durée de vie bornée et sans PII
- [x] 5.3 Propager le touchpoint aux formulaires et au lead créé
- [x] 5.4 Transporter le touchpoint vers le booking natif, Calendly et iClosed (champ caché / query param) et le relire au webhook
- [ ] 5.5 Écrire l'identifiant de lead/session dans les `metadata` Stripe et refermer la boucle jusqu'au cash — volontairement non implémenté : Stripe Connect est encapsulé en lecture seule par la règle de sécurité du projet ; aucune écriture du Stripe client n'est autorisée.
- [x] 5.6 Implémenter les quatre niveaux de rattachement (`ad`, `adset`, `campaign`, `utm_seul`) et l'état `non_rattachee`
- [x] 5.7 Ajouter les tests : aucune vente n'est attribuée par défaut, aucune répartition au prorata, couverture correctement calculée

## 6. Typage de campagne et modules

- [x] 6.1 Remplacer la classification automatique par une configuration manuelle du type (VSL, Webinaire, Trafic Instagram ou Retargeting) ; demander Appel/Vente pour VSL et Webinaire
- [x] 6.2 Implémenter le funnel et les KPI du module VSL, avec étapes indisponibles tant que la source d'événements n'est pas branchée
- [x] 6.3 Implémenter le funnel et les KPI du module Webinar, même règle sur présence live et présence au pitch
- [x] 6.4 Implémenter le module Croissance Instagram avec distinction attribué / observé et coût par follower `estimee`
- [x] 6.5 Implémenter le module Retargeting : segments, ladder d'audiences, fréquence vs CTR/CPA, exclusions
- [x] 6.6 Afficher un état d'attente explicite tant que le type n'est pas configuré ; ne pas afficher de funnel générique ambigu

## 7. UI Acquisition / Ads et détail campagne

- [x] 7.1 Implémenter les états amont : non connecté, sync en cours, données insuffisantes
- [x] 7.2 Implémenter le header, le sélecteur de période, la comparaison et l'affichage de la date de consolidation
- [x] 7.3 Implémenter les KPI principaux avec valeur, évolution, période, provenance et cible
- [x] 7.4 Implémenter le funnel avec son alternative tabulaire visible
- [x] 7.5 Implémenter l'analyse créative : matrice, classement, part de budget, fréquence, fatigue créative
- [x] 7.6 Implémenter l'analyse audiences et placements avec drill-down et avertissements seuillés
- [x] 7.7 Implémenter `/acquisition/ads/[campaignId]` : header, résumé économique, ensembles, publicités, créatifs, historique
- [x] 7.8 Implémenter le constructeur de deep-link serveur (ad → adset → campaign → compte) avec validation d'appartenance et ouverture externe sécurisée
- [x] 7.9 Vérifier responsive 1440 / tablette / 390, clavier, focus, reduced motion et CTA corail unique — fixture Meta Ads locale vérifiée avec `agent-browser` à 1440 / 768 / 390 px : aucune largeur horizontale, axe sans violation, focus clavier et `prefers-reduced-motion` contrôlés ; le parcours authentifié relève de 11.4.

## 8. Insights

- [x] 8.1 Implémenter le catalogue de règles nommées par type de campagne, avec conditions chiffrées et seuils configurables
- [x] 8.2 Implémenter le gel d'une règle dont les données sont indisponibles ou sous le seuil de couverture
- [x] 8.3 Implémenter l'empreinte `hash(accountId, campaignId, campaignType, conversionGoal, ruleKey, metric, period)` et la re-matérialisation idempotente
- [x] 8.4 Brancher les insights Meta sur les `insightRecords` existants et sur `launchInsight`, sans créer de seconde source de vérité
- [x] 8.5 Implémenter le mode sans cible business : comparaisons historiques uniquement, aucun jugement absolu
- [x] 8.6 Implémenter l'adoption dans le Journal avec métrique de départ figée et lien retour vers la campagne
- [x] 8.7 Vérifier qu'aucune adoption n'écrit dans Meta

## 9. Actions directes

- [x] 9.1 Implémenter l'étape de proposition : action, campagne, valeur actuelle, nouvelle valeur, justification, impact, risque, deep-link
- [x] 9.2 Déclencher le step-up `ads_management` si le scope d'écriture n'est pas accordé, avant toute confirmation
- [x] 9.3 Implémenter l'étape de confirmation, avec confirmation supplémentaire pour la pause
- [x] 9.4 Implémenter la limite de sécurité sur le budget et le repli vers le deep-link au-delà
- [x] 9.5 Implémenter la resynchronisation préalable et l'arrêt sur divergence de valeur
- [x] 9.6 Implémenter les six états de résultat et la relecture post-écriture avant toute annonce de succès
- [x] 9.7 Implémenter le journal d'audit dans la campagne et dans le Journal, y compris pour les échecs

## 10. Paramètres de pilotage

- [x] 10.1 Implémenter le panneau de cibles business avec pré-remplissage depuis `Mon business`
- [x] 10.2 Implémenter la propagation des cibles aux KPI, seuils et règles d'insight
- [x] 10.3 Ajouter les tests du mode dégradé sans cible

## 11. Validation

- [x] 11.1 Tests unitaires : calculs dérivés, triplet de provenance, niveaux de rattachement, empreinte d'insight, idempotence des actions, account scoping
- [x] 11.2 Tests des états d'erreur, du refus de step-up et de la conservation des données partielles
- [x] 11.3 Tests de la fenêtre de consolidation et des corrections rétroactives
- [ ] 11.4 Parcourir avec `agent-browser` : connexion, sélection de compte, consultation de campagne, adoption, step-up, confirmation d'action — parcours authentifié impossible sans identifiants de test ; les routes publiques redirigent correctement vers la connexion.
- [x] 11.5 Lancer `npm run typecheck`, `npm run lint` et la validation OpenSpec
- [x] 11.6 Vérifier l'absence de tokens, secrets ou PII dans les logs, URLs, touchpoints, snapshots et événements
