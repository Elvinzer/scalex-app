## Purpose

Cette capability permet d’explorer les performances de plusieurs plateformes de contenu depuis une même page, sans perdre les métriques, filtres et détails spécifiques à chaque plateforme.

## ADDED Requirements

### Requirement: Platform selector is always available

La page Contenu MUST afficher un sélecteur actionnable pour Instagram et YouTube avec le nom de la plateforme et son statut de connexion. Une plateforme non connectée MUST rester sélectionnable afin que son panneau puisse présenter le parcours de connexion.

#### Scenario: Both platforms are connected

- **WHEN** l’utilisateur ouvre la page Contenu avec Instagram et YouTube connectés
- **THEN** le sélecteur affiche les deux plateformes, une plateforme par défaut est sélectionnée et son panneau détaillé est visible immédiatement

#### Scenario: Only YouTube is connected

- **WHEN** l’utilisateur ouvre la page Contenu avec uniquement YouTube connecté
- **THEN** YouTube est sélectionné par défaut et Instagram reste disponible dans le sélecteur avec le statut « Non connecté »

#### Scenario: No platform is connected

- **WHEN** l’utilisateur ouvre la page Contenu sans plateforme connectée
- **THEN** le sélecteur reste visible, une plateforme par défaut est sélectionnée et le panneau correspondant affiche directement son CTA de connexion

### Requirement: Switching platform preserves the content context

Le système MUST remplacer le panneau visible lorsque l’utilisateur sélectionne une autre plateforme, sans l’obliger à revenir à une page overview ni à quitter le parcours Contenu. La plateforme sélectionnée MUST être représentée dans l’URL et restaurée au rechargement.

#### Scenario: Switch from Instagram to YouTube

- **WHEN** l’utilisateur sélectionne YouTube depuis le panneau Instagram
- **THEN** le panneau YouTube remplace le panneau Instagram sur la page Contenu, l’URL identifie YouTube et aucun tableau générique ne remplace la vue spécialisée

#### Scenario: Open a platform deep link

- **WHEN** l’utilisateur ouvre directement `/acquisition/contenu?platform=youtube`
- **THEN** la page sélectionne YouTube et affiche son panneau sans étape intermédiaire

#### Scenario: Invalid platform value

- **WHEN** l’URL contient une valeur de plateforme inconnue ou indisponible
- **THEN** la page utilise la plateforme par défaut déterminée par l’état de connexion et reste utilisable

### Requirement: Connection and synchronization state is shown in the selected panel

Le panneau sélectionné MUST afficher la carte complète de connexion et de synchronisation de sa plateforme. Pour une plateforme connectée, la carte MUST exposer son identité, son état de synchronisation et les actions déjà disponibles pour rafraîchir ou déconnecter. Pour une plateforme non connectée, elle MUST exposer le CTA et les prérequis de connexion correspondants.

#### Scenario: Connected platform panel

- **WHEN** l’utilisateur sélectionne une plateforme connectée
- **THEN** la carte affiche le compte ou la chaîne concernée, le statut de synchronisation et les actions de gestion sans masquer les métriques du panneau

#### Scenario: Unconnected platform panel

- **WHEN** l’utilisateur sélectionne une plateforme non connectée
- **THEN** la carte affiche les prérequis, les données récupérées et le CTA de connexion propre à cette plateforme

### Requirement: Instagram panel retains its specialized data display

Lorsque Instagram est sélectionné et connecté, le panneau MUST conserver les KPI, le filtre de période, le top 3 des posts, le tableau paginé et les dialogues de détail existants. Le filtre de période MUST piloter les KPI et le tableau ensemble. Les données affichées MUST rester limitées aux publications Instagram.

#### Scenario: Filter Instagram content by period

- **WHEN** l’utilisateur sélectionne une période Instagram
- **THEN** les KPI et le compteur du tableau correspondent à cette période, tandis que le top 3 conserve son classement défini par les interactions

#### Scenario: Inspect an Instagram post

- **WHEN** l’utilisateur ouvre le détail d’une ligne Instagram
- **THEN** le dialogue de détail et les colonnes existantes restent disponibles, notamment les vues, le taux d’interaction, les partages, le visionnage et les abonnés

### Requirement: YouTube panel retains its specialized data display

Lorsque YouTube est sélectionné et connecté, le panneau MUST conserver le filtre de période, le filtre de format, les KPI, le top 3 des vidéos, le tableau paginé et le dialogue de détail existants. Les vidéos privées ou non listées MUST être exclues de toutes les métriques et listes visibles.

#### Scenario: Filter YouTube content by period and format

- **WHEN** l’utilisateur sélectionne une période et un format YouTube
- **THEN** les KPI, le top 3 et le tableau appliquent les règles de filtrage propres à YouTube, sans mélanger les Shorts et les vidéos longues dans les comparaisons de format

#### Scenario: Inspect YouTube commercial metrics

- **WHEN** l’utilisateur consulte le tableau YouTube
- **THEN** les colonnes de vues, rétention, watch time, abonnés, RDV bookés et RDV closés restent affichées avec leurs explications et leur dialogue de détail

### Requirement: Filter state survives platform switches

La période sélectionnée MUST être conservée lors d’un changement de plateforme. Les filtres propres à une plateforme, notamment le format YouTube, MUST être restaurés lorsque l’utilisateur revient sur cette plateforme pendant la même visite.

#### Scenario: Return to a previously filtered platform

- **WHEN** l’utilisateur sélectionne « 30 jours » sur Instagram, passe sur YouTube, puis revient sur Instagram
- **THEN** Instagram est toujours filtré sur « 30 jours » et son tableau conserve la même cohérence avec ses KPI

#### Scenario: Preserve YouTube format selection

- **WHEN** l’utilisateur sélectionne « Shorts » sur YouTube, passe sur Instagram, puis revient sur YouTube
- **THEN** le filtre « Shorts » est toujours actif et les KPI, le top 3 et le tableau reflètent ce format

### Requirement: Platform switching is accessible and responsive

Le sélecteur MUST être utilisable au clavier avec un état actif annoncé sémantiquement, des libellés textuels et des états de connexion qui ne reposent pas uniquement sur la couleur. Chaque cible interactive MUST offrir une zone d’interaction d’au moins 44 pixels. La mise en page MUST rester utilisable à 375, 768 et 1440 pixels sans débordement horizontal de la page ; les tableaux peuvent conserver leur défilement horizontal local sur petit écran.

#### Scenario: Navigate the selector with a keyboard

- **WHEN** l’utilisateur parcourt le sélecteur au clavier et active YouTube
- **THEN** le focus reste visible, la plateforme active est annoncée comme sélectionnée et le panneau YouTube devient le contenu pertinent

#### Scenario: Use the selector on a small viewport

- **WHEN** l’utilisateur ouvre la page sur un viewport de 375 pixels de large
- **THEN** les plateformes restent lisibles et actionnables, le sélecteur ne masque pas les CTA et aucun débordement horizontal ne touche la page entière

### Requirement: Existing platform detail URLs remain compatible

Les URLs existantes `/acquisition/contenu/instagram` et `/acquisition/contenu/youtube` MUST continuer à ouvrir la plateforme correspondante, ou rediriger vers son URL canonique avec le sélecteur activé.

#### Scenario: Open an existing Instagram detail URL

- **WHEN** l’utilisateur ouvre `/acquisition/contenu/instagram`
- **THEN** Instagram est sélectionné dans le nouveau shell Contenu et les données détaillées Instagram sont visibles

#### Scenario: Open an existing YouTube detail URL

- **WHEN** l’utilisateur ouvre `/acquisition/contenu/youtube`
- **THEN** YouTube est sélectionné dans le nouveau shell Contenu et les données détaillées YouTube sont visibles
