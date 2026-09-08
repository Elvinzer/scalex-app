# Fiabilité et temps de chargement, 8 septembre 2026

Le timeout `diagnostic-kpi-raw` provenait d'un chargement commun à de nombreuses pages : 14 sources de données historiques étaient attendues ensemble, y compris des statistiques de réseaux sociaux inutilisées sur `/datas`. Une source bloquée pouvait faire échouer la page. Le dashboard abandonnait ce même chargement après 5 secondes et remplaçait les chiffres par un jeu vide.

L'erreur React 441 est le message public d'une erreur de rendu serveur. Dans l'incident fourni, son digest correspond à celui du timeout. Référence : [décodeur React](https://react.dev/errors/441).

## Changements

- Le diagnostic possède des sources canoniques avec cache par compte et déduplication des lectures simultanées. Le contenu financier, le contenu nécessaire au dashboard et les statistiques complètes utilisent les mêmes sources.
- `/datas` et la sidebar utilisent les 10 sources financières. Les statistiques Instagram, YouTube et les attributions vidéo ne conditionnent plus leur affichage.
- Le dashboard lit uniquement les identifiants et la visibilité des vidéos YouTube ; il ne charge plus les statistiques complètes YouTube ou Instagram.
- Les statistiques média et les attributions vidéo sont isolées comme données optionnelles : une panne de ces sources laisse les chiffres financiers utilisables et journalise la source dégradée.
- Les lectures Meta ne sélectionnent que les totaux des campagnes et les colonnes des calculs. Les leads de réservation ne chargent que leur date et leur statut.
- `/datas` réutilise ses lignes mensuelles, ventes et transitions de pipeline au lieu de les relire pour les résumés annuels.
- Un délai JavaScript borne l'attente d'une source à 10 secondes. Si ce délai expire, la lecture reste partagée jusqu'à sa fin réelle. Une nouvelle navigation ne relance donc pas cette lecture encore active. Cette protection n'annule pas la requête SQL.
- Une source essentielle indisponible affiche un état explicite et un bouton de reprise. Le dashboard ne remplace plus son diagnostic ou son profil métier par des chiffres vides.
- Le pool PostgreSQL est réutilisé pendant les rechargements de modules en développement.
- Le suivi de synchronisation Stripe attend la réponse précédente, suspend ses lectures quand l'onglet est masqué et espace ses vérifications jusqu'à 30 secondes. Une réponse terminale arrête le suivi.

## Mesures sur le compte de l'incident

Lectures PostgreSQL seules, séquentielles, avec une connexion. Aucune écriture métier ni migration.

| Source | Avant | Après |
| --- | ---: | ---: |
| Meta, JSON des lignes | 1 127 947 octets, 391 lignes | 5 985 octets, 34 campagnes |
| Leads de réservation, JSON | 36 136 octets | 2 143 octets |
| Instagram dans `/datas` et sidebar | 468 084 octets | Source supprimée de ces lectures |
| YouTube dans `/datas` et sidebar | 171 772 octets | Source supprimée de ces lectures |

Les lectures mesurées prenaient 81 à 221 ms, avec moins de 0,23 ms d'exécution PostgreSQL dans les plans examinés. Ces observations ne justifiaient pas un nouvel index. La charge inutile portait surtout sur les transferts, le cache et les lectures répétées.

Le pooler transaction de la base retourne `statement_timeout=20s` et `idle_in_transaction_session_timeout=30s`, même lorsque le client demande 25s et 15s dans les paramètres de connexion. Les commentaires du client ont été corrigés pour ne pas présenter ces demandes comme des plafonds garantis. Référence : [modes de connexion Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres).

## Vérifications

- `npm run typecheck`, `npm run lint`, `npm run test` : réussite, 476 tests sur 112 fichiers.
- Build Next.js de production : réussite.
- Préflight `next-dev-loop` : Next.js 16.3.0, Turbopack, agent-browser 0.33.2. Diagnostics de compilation et erreurs runtime Next.js vides après restauration du fonctionnement normal.
- Vérifications navigateur locales sur `/datas`, son détail mensuel, `/dashboard`, `/diagnostic-app` et `/ventes/suivi`, puis vérifications authentifiées sur `/datas` et `/dashboard` en production avec le compte concerné. Les montants et le score observés avant modification sont conservés.
- Panne de source simulée temporairement en développement : `/datas` et `/dashboard` affichent le message de disponibilité, la navigation reste utilisable. Après retrait de la simulation, « Réessayer » recharge l'historique. Aucune simulation ne subsiste dans le code final.
- Message de disponibilité FR vérifié dans les pages concernées ; version EN vérifiée avec le même composant et son catalogue dans une fixture temporaire, ensuite restaurée. Aucune clé brute affichée.
- Test automatisé : 100 demandes concurrentes du même compte partagent une seule lecture de chaque source ; un autre compte reçoit sa propre lecture. Tests des dates sérialisées, des médias en panne, des lectures expirées encore actives, du comptage Meta et du polling Stripe.
- Série locale de trois lectures par page, cache chaud : `/datas` 584 à 613 ms ; `/dashboard` 664 à 853 ms ; `/ventes/suivi` 627 à 774 ms. Ces durées couvrent la réponse HTML complète via le navigateur, pas une mesure de Web Vitals en production.
- Rafale locale de 12 lectures de `/datas` et `/dashboard` : 12 réponses 200 avec le titre métier attendu, aucune indisponibilité. Durées de 2,8 à 6,9 secondes. Ce test a partagé la machine avec les contrôles de code et subi la limite de connexions HTTP du navigateur : il démontre la reprise des requêtes, pas une capacité de 12 utilisateurs actifs en production.

## Déploiements

Le code validé correspond au commit `dcc692d51967714a81238fc31a80fc7eef1f1927`, poussé pendant la session.

- Production : [déploiement Vercel](https://scalex-nen9amn34-cedrics-projects-87cca661.vercel.app), état `READY`, alias `www.minaly.io`.
- Preview : [déploiement de vérification](https://scalex-duqmyqpwk-cedrics-projects-87cca661.vercel.app), build et déploiement `READY`.
- Vérification des fichiers envoyés à Vercel : exclusion des fichiers d'environnement, dépendances locales et répertoires d'agents. Aucun motif de secret détecté dans les 21 fichiers modifiés depuis le commit initial.

Le parcours production a été vérifié après connexion Supabase avec `ced.benard31@gmail.com`. Aucun timeout diagnostic n'a été observé dans les logs récents de production.

## Limites des mesures

Ces résultats ne certifient pas une capacité de centaines ou milliers d'utilisateurs simultanés. Les lectures financières et certains historiques restent complets par compte ; un historique suffisamment volumineux peut encore dépasser la limite d'une entrée Data Cache de Next.js. Pour fixer une capacité commerciale, il faut mesurer des comptes représentatifs sur une infrastructure de staging, avec une cible explicite de concurrence et de latence, puis partitionner les historiques ou agréger les lectures qui dépassent cette cible.
