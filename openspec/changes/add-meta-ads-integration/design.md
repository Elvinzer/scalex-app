## Contexte

Le brief design est livré sous forme de deux Design Components : un sitemap + wireframes de tous les états, et un prototype haute fidélité cliquable construit sur les tokens réels de `app/globals.css`. Ces fichiers ne font pas partie du dossier OpenSpec ; ils sont livrés séparément et référencés en fin de document. Ce fichier fige les décisions structurantes que le code doit respecter.

Les décisions 1, 5, 6, 7, 8, 11 et 12 intègrent la revue technique du 8 août.

## Décisions

### 1. Moindre privilège : `ads_read` d'abord, `ads_management` en step-up

La connexion initiale demande **`ads_read` uniquement**. Aucune permission d'écriture n'est demandée tant que l'utilisateur n'a pas décidé d'appliquer une action depuis Scale X. La première action directe déclenche un step-up OAuth explicite (`/api/meta/upgrade`), présenté comme un second consentement : ce qu'il autorise, sur quel compte, et comment le révoquer. Si l'utilisateur refuse le step-up, l'action bascule sur `Ouvrir dans Meta Ads` et la connexion en lecture reste intacte.

### 2. Sélection de compte toujours explicite

Le callback OAuth ne choisit jamais de compte. Même avec un seul compte accessible, l'utilisateur confirme. Un compte sans accès lecture est listé, non sélectionnable, avec son motif. Devise et fuseau sont affichés car ils conditionnent le rapprochement avec Stripe.

### 3. Le type de campagne pilote le funnel

Le type est suggéré depuis l'objectif Meta, le performance goal et la landing page, puis modifiable. Il ne change rien dans Meta : il sélectionne le funnel, les KPI prioritaires et la famille de règles de diagnostic. Quatre modules spécifiés — VSL, Webinar, Croissance Instagram, Retargeting — plus un funnel générique pour `Autre`.

### 4. Ne jamais fusionner deux vérités

Le ROAS Meta et le cash observé via Stripe sont affichés côte à côte, jamais additionnés ni réconciliés en une valeur unique.

### 5. Provenance à trois axes, pas un libellé unique

Un seul mot ne peut pas décrire à la fois d'où vient une donnée, comment elle a été calculée et comment elle est rattachée. Chaque métrique exposée porte donc trois qualifications indépendantes :

```text
source       = meta | stripe | calendly | iclosed | instagram | scalex
calculation  = brute | derivee
attribution  = directe | jointe | estimee | non_rattachee | indisponible
```

Un CAC cash calculé depuis des dépenses Meta et du cash Stripe rattaché par identifiant de campagne est donc `source: meta+stripe · calculation: derivee · attribution: jointe` — déterministe, et non « estimé ». `estimee` est réservé aux cas où une hypothèse est réellement introduite (coût par follower Instagram, par exemple). L'UI affiche un libellé lisible dérivé du triplet, et la méthode de calcul reste consultable.

### 6. La fenêtre de consolidation est calculée, pas fixée à 3 jours

Chaque série de métriques porte sa propre fenêtre :

```text
consolidation_until = jour_de_reference
                    + fenêtre d'attribution configurée sur le compte
                    + délai de traitement connu de l'API
```

La fenêtre effective est persistée avec la série, affichée dans l'UI (« chiffres définitifs jusqu'au JJ/MM ») et réévaluée à chaque synchronisation. Une resynchronisation qui modifie rétroactivement une valeur consolidée écrit un événement, elle ne l'écrase pas silencieusement.

### 7. Étapes de funnel sans source : indisponibles, pas estimées

Plusieurs étapes spécifiées par le brief ne sont fournies ni par Meta ni par les intégrations actuelles : watch depth VSL, lecture VSL, présence live, présence jusqu'au pitch, taux de closing, cash par inscrit.

Décision retenue : **afficher ces étapes comme `indisponible` tant que leur source n'est pas connectée**, en nommant la source manquante et l'action pour la brancher — et poser dès cette change la chaîne de capture générique (décision 8) qui les rendra disponibles. Aucune de ces étapes n'est estimée, interpolée, ni omise du funnel : elle reste visible, grisée, avec son motif.

> Question ouverte pour le produit : faut-il aller plus loin dans cette tranche et livrer un endpoint d'événements VSL/webinar (`vsl_play`, `vsl_progress`, `webinar_join`, `webinar_pitch`) que l'utilisateur branche sur sa page et son outil de webinar ? La chaîne de capture le permet ; seule la surface d'ingestion resterait à spécifier.

### 8. Rattachement : identifiants propagés, jamais devinés

Le rattachement n'est pas une heuristique. Il repose sur une chaîne explicite :

1. Meta ajoute `utm_*` et, si configuré, `campaign_id` / `adset_id` / `ad_id` aux URL sortantes.
2. La landing page persiste ces paramètres dans un touchpoint Scale X (first-party, durée de vie bornée) et les repasse aux formulaires.
3. Le lead créé conserve son touchpoint. Les liens de booking natifs, Calendly et iClosed le transportent en champ caché / query param.
4. Stripe reçoit l'identifiant du lead ou de la session en `metadata`, ce qui referme la boucle jusqu'au cash.

Quatre niveaux de rattachement, du plus fort au plus faible : `ad` → `adset` → `campaign` → `utm_seul`. Le niveau atteint est affiché et compté dans la couverture. En l'absence de tout identifiant, la vente est `non_rattachee` : elle n'est jamais attribuée par défaut à la campagne la plus dépensière, ni répartie au prorata.

### 9. Instagram : attribué vs observé

Les visites de profil attribuées par Meta et les follows observés dans Instagram sont deux séries distinctes, visuellement distinguées. Le coût par follower est `attribution: estimee`, avec sa méthode et sa fenêtre consultables.

### 10. Insights : ordre imposé

Titre → preuve chiffrée → période → diagnostic probable → action recommandée → impact attendu → confiance → sources → couverture. Aucune recommandation ne s'affiche sans sa ligne de sources. Sans cible business configurée, l'insight compare à l'historique du compte et n'emploie jamais un vocabulaire de jugement absolu.

### 11. Insights : règles de diagnostic explicites, empreinte stable

Les insights ne sont pas générés librement : chaque type de campagne expose un catalogue de règles nommées, avec leurs conditions de déclenchement chiffrées, leur diagnostic et leur action recommandée (voir `specs/meta-ads-insights/spec.md`). Une règle qui ne dispose pas de ses données ne se déclenche pas.

Chaque insight porte une empreinte :

```text
fingerprint = hash(accountId, campaignId, campaignType, ruleKey, metric, period)
```

La synchronisation 6 h re-matérialise l'insight sur la même empreinte : elle met à jour la preuve chiffrée, elle ne crée pas de doublon et ne réinitialise pas la décision utilisateur. Les insights Meta sont stockés dans les `insightRecords` existants et adoptés via `launchInsight` — pas de seconde source de vérité à côté du Journal.

### 12. Deep-links Meta construits côté serveur

Le lien `Ouvrir dans Meta Ads` est construit sur le serveur à partir de l'identifiant de compte et de l'objet concerné, au niveau le plus précis disponible (ad → adset → campaign → compte). Les identifiants sont validés comme appartenant au compte connecté avant construction ; aucun identifiant fourni par le client n'est concaténé tel quel. Ouverture en nouvel onglet avec `rel="noopener noreferrer"`.

### 13. Écritures : trois actions, trois étapes

Seules la pause, la réactivation et la modification de budget quotidien sont écrivables. Le flux est proposition → confirmation → résultat, jamais raccourci. La modification de budget est bornée par une limite de sécurité configurable ; au-delà, l'action bascule sur le deep-link. La pause demande une confirmation supplémentaire. Six états de résultat, dont « campagne modifiée entre-temps » et « état inconnu ».

### 14. Direction artistique

Corail `--accent` : un seul CTA principal par écran. Violet `--accent-2` : surfaces IA, analytics et insights. États sémantiques existants uniquement, aucune couleur inventée, aucun gradient décoratif. Les patterns de la carte Instagram et des dialogues du Journal sont réutilisés tels quels.

### 15. Accessibilité

Aucune information portée par la couleur seule. Toute figure a une alternative tabulaire visible, pas seulement au survol. Les chiffres restent lisibles sans interaction. Cibles tactiles ≥ 44 px. Tableaux scrollables horizontalement sur mobile avec première colonne figée. Filtres de période en rail scrollable, jamais repliés dans un menu.

## Risques

- **Fenêtre d'attribution** : les chiffres récents bougent. Traité par la fenêtre de consolidation calculée et persistée (décision 6), et par la resynchronisation avant toute action.
- **Permissions révoquées côté Meta** : détectées à la synchronisation, elles n'effacent pas les données déjà lues, elles les datent.
- **Chaîne d'attribution incomplète** : un compte qui n'a pas branché ses formulaires n'aura que du `utm_seul`, voire rien. La couverture par niveau est affichée pour que l'utilisateur sache ce qu'il lit, et les insights dépendant du cash ne se déclenchent pas sous un seuil de couverture.
- **Refus du step-up** : l'utilisateur peut vouloir la lecture sans jamais autoriser l'écriture. C'est un mode nominal, pas une erreur.

## Livrables design associés

- `Meta Ads - Sitemap & Wireframes.dc.html` — sitemap, tous les états, desktop 1440 et mobile 390, règles d'affichage et états impossibles.
- `Meta Ads - Hi-fi.dc.html` — prototype cliquable sur les tokens réels : connexion, sélection de compte, Ads, détail campagne, adoption Journal, flux d'action en 3 étapes.
