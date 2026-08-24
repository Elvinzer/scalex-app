## Purpose

Le Dashboard doit être le point d’entrée opérationnel après connexion et rendre le diagnostic du goulot immédiatement compréhensible, traçable vers ses sources et lisible sans interaction supplémentaire.

## ADDED Requirements

### Requirement: Completed owner sessions land on the Dashboard

Lorsqu’un propriétaire dont l’onboarding est terminé termine une authentification réussie, le système SHALL le rediriger vers `/dashboard`. Les membres d’équipe SHALL conserver leur première destination accessible selon leurs permissions, et les nouveaux propriétaires SHALL continuer à passer par l’onboarding.

#### Scenario: Existing owner signs in

- **WHEN** un propriétaire avec `onboardingCompleted` se connecte par magic link, OAuth ou une session déjà active sur `/sign-in`
- **THEN** la destination finale est `/dashboard`

#### Scenario: New owner signs in

- **WHEN** un propriétaire n’ayant pas terminé l’onboarding termine son authentification
- **THEN** la destination finale reste `/onboarding`

#### Scenario: Team member signs in

- **WHEN** un membre d’équipe termine son authentification
- **THEN** il est envoyé vers sa première page autorisée et le changement ne lui accorde aucune permission supplémentaire

### Requirement: Bottleneck stages expose their data source

Chaque étape affichée dans le funnel du goulot SHALL présenter un texte visible et cliquable qui nomme la page source de ses données. Le lien SHALL utiliser la destination propre à l’étape, fonctionner même lorsque le volume est indisponible et être traduit dans les deux locales supportées.

#### Scenario: Stage has a known source page

- **WHEN** une étape du funnel est affichée avec une source connue
- **THEN** l’étape affiche un libellé de provenance tel que « Données prises dans : Contenu » et ce libellé ouvre la page source correspondante

#### Scenario: Stage is not measured yet

- **WHEN** une étape n’a pas encore de volume mesuré
- **THEN** son libellé de provenance reste visible et navigable au même endroit que pour les étapes mesurées

#### Scenario: Source link is localized

- **WHEN** le Dashboard est rendu en français ou en anglais
- **THEN** le texte de provenance, le nom de la page et les attributs accessibles sont affichés dans la locale active

### Requirement: Source entry wording is understandable

Le lien qui invite à compléter une source manquante SHALL afficher « Saisir les données » en français et son équivalent anglais dans le catalogue miroir, sans modifier l’URL cible.

#### Scenario: Missing source asks for data

- **WHEN** une source du filtre de parcours n’est pas disponible pour la période courante
- **THEN** le lien d’action affiche « Saisir les données » et ouvre la page de saisie existante

### Requirement: Bottleneck details are visible inline

Le détail du funnel SHALL être affiché directement sous les étapes, sans bouton « Voir le détail » ni boîte de dialogue de résumé. Le bloc inline SHALL reprendre les informations de potentiel par étape, la description du calcul et le potentiel total, avec une couleur de texte lisible sur les thèmes clair et sombre.

#### Scenario: User opens the Dashboard

- **WHEN** le funnel du goulot est rendu
- **THEN** le détail complet apparaît déjà sous le funnel sans clic préalable

#### Scenario: User changes the active journey

- **WHEN** l’utilisateur change de parcours dans le Dashboard
- **THEN** le bloc de détail inline se met à jour avec les étapes et le potentiel du parcours sélectionné

#### Scenario: User opens Falco for a stage

- **WHEN** l’utilisateur active l’icône d’amélioration d’une étape
- **THEN** le dialogue Falco existant reste disponible et le bloc de détail inline reste inchangé
