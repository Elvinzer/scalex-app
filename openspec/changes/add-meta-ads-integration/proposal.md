## Why

Scale X lit déjà Stripe, Calendly, iClosed, Instagram et YouTube, mais l'acquisition payante reste saisie à la main dans `/acquisition/ads`. L'utilisateur ne peut ni voir où son budget publicitaire se perd, ni relier une dépense Meta au cash réellement encaissé, ni décider quoi corriger en premier.

Cette change connecte Meta Ads en lecture, produit des recommandations orientées décision, et autorise un nombre volontairement réduit d'écritures — toujours derrière une confirmation explicite. Scale X n'est pas un clone du gestionnaire de publicités Meta.

## What Changes

- Connecter un compte publicitaire Meta via OAuth en demandant **`ads_read` uniquement**. `ads_management` est demandée plus tard, en step-up, au moment de la première action directe.
- Exiger une sélection explicite du compte publicitaire quand plusieurs sont accessibles ; ne jamais sélectionner silencieusement, même s'il n'y en a qu'un.
- Synchroniser en lecture campagnes, ensembles, publicités, dépenses, impressions, reach, fréquence, CPM, CTR sortant, CPC, leads, conversions, CPA/CPL, ROAS Meta, métriques vidéo, placements et évolution temporelle.
- Poser la chaîne d'attribution : UTMs et `campaign_id` / `adset_id` / `ad_id` propagés jusqu'aux formulaires, à Calendly, à iClosed et à Stripe, avec un niveau de rattachement explicite et une couverture mesurée.
- Qualifier chaque métrique sur trois axes indépendants — `source`, `calculation`, `attribution` — au lieu d'un seul libellé ambigu.
- Afficher dans `/acquisition/ads` les KPI, le funnel du type de campagne, l'analyse créative, les audiences et les placements. Une étape de funnel sans source connectée est `indisponible`, jamais estimée ni nulle.
- Configurer explicitement chaque campagne (VSL, Webinaire, Trafic Instagram ou Retargeting), sans classification automatique. Pour VSL et Webinaire, demander aussi l'objectif de conversion Appel ou Vente ; adapter le funnel, les KPI et les **règles de diagnostic** à cette configuration.
- Produire des insights structurés et idempotents, matérialisés dans les `insightRecords` existants, sans créer une seconde source de vérité à côté du Journal.
- Adopter un insight dans le Journal via `launchInsight`, sans aucune écriture dans Meta.
- Appliquer trois actions seulement — pause, réactivation, budget quotidien borné — via un flux proposition → confirmation → résultat, avec journal d'audit.
- Construire les deep-links `Ouvrir dans Meta Ads` côté serveur, au bon niveau d'objet, avec repli sur le compte.
- Paramétrer les cibles business. Sans cible, Scale X compare à l'historique et n'émet aucun jugement absolu.

## Non-goals

- Créateur de campagnes, éditeur de ciblage, éditeur de créatifs, upload de créatifs, éditeur de copy, gestionnaire d'audiences.
- Tout clone du gestionnaire de publicités Meta.
- Toute exécution automatique sans confirmation utilisateur.
- Toute reconstruction d'un modèle d'attribution multi-touch : Scale X rattache ou ne rattache pas, il ne pondère pas.

## Capabilities

### New Capabilities

- `meta-ads-connection`: OAuth `ads_read`, step-up `ads_management`, sélection explicite du compte, états de synchronisation et d'erreur, révocation.
- `meta-ads-performance-reading`: lecture normalisée des entités et métriques, typage de campagne, modèle de provenance à trois axes, fenêtre de consolidation calculée.
- `meta-ads-attribution`: propagation des identifiants de campagne jusqu'aux formulaires, au booking et à Stripe, niveaux de rattachement et couverture.
- `meta-ads-insights`: règles de diagnostic par type de campagne, insights idempotents, adossement aux cibles business, adoption dans le Journal.
- `meta-ads-direct-actions`: pause, réactivation et modification de budget bornée, step-up de permission, confirmation explicite, vérification post-écriture, audit, deep-links.

### Modified Capabilities

Aucune capacité publiée dans `openspec/specs/` n'est modifiée. Cette change **réutilise** `insight-execution-history` (`insightRecords`, `launchInsight`, initiatives Journal) livrée par `add-insight-execution-loop` : les insights Meta sont une nouvelle source d'insight, pas un nouveau système. La page `/acquisition/ads` existante reste accessible et devient une source secondaire quand un compte Meta est connecté.

## Impact

- Nouvelles tables Drizzle : connexion Meta, compte publicitaire sélectionné, entités (campagnes/ensembles/publicités), séries de métriques quotidiennes avec fenêtre de consolidation, typage de campagne, cibles business, touchpoints d'attribution et journal d'actions. RLS et account scoping obligatoires, chiffrement des tokens via `lib/crypto.ts`.
- Nouvelles routes OAuth `/api/meta/connect`, callback, et `/api/meta/upgrade` pour le step-up `ads_management`.
- Nouvelle fonction Inngest de synchronisation initiale et de rafraîchissement périodique, avec budget de temps et reprise en arrière-plan, sur le modèle d'Instagram.
- Extension des surfaces de capture existantes (formulaires, liens de booking natifs, Calendly, iClosed) pour transporter UTMs et identifiants Meta jusqu'à Stripe.
- UI : carte d'intégration dans `/acquisition/ads` et `/integrations`, refonte de `/acquisition/ads`, nouvelle route `/acquisition/ads/[campaignId]`, adoption via le dialogue Journal existant.
- Aucune nouvelle dépendance côté client, aucun nouveau canal d'envoi, aucun leaderboard.
