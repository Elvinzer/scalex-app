## Purpose

Évite que l’extension enregistre un libellé d’action visible comme nom d’un lead et permet à l’utilisateur de corriger facilement l’identité capturée avant la création de la fiche CRM.

## ADDED Requirements

### Requirement: Le nom du lead provient de l’identité visible du profil
Lors de la capture d’un profil Instagram ou LinkedIn, l’extension MUST chercher le nom dans la zone d’identité visible du profil et MUST rejeter les libellés génériques d’interface, notamment « Voir Profil », comme nom de lead. La capture ne doit pas présenter un résultat non fiable comme un nom validé.

#### Scenario: Nom visible sur Instagram
- **WHEN** le profil Instagram présente un nom d’identité lisible dans sa zone de profil
- **THEN** l’extension propose ce nom pour la fiche CRM

#### Scenario: Nom visible sur LinkedIn
- **WHEN** le profil LinkedIn présente un nom d’identité lisible dans sa zone de profil
- **THEN** l’extension propose ce nom pour la fiche CRM

#### Scenario: Libellé d’interface détecté à la place du nom
- **WHEN** la valeur candidate est un libellé d’action ou de navigation tel que « Voir Profil »
- **THEN** l’extension rejette cette valeur comme nom et poursuit avec une identité fiable ou le handle du profil

#### Scenario: Aucun nom fiable n’est visible
- **WHEN** le profil ne présente aucun nom d’identité fiable
- **THEN** l’extension affiche le handle réel comme valeur préremplie dans un champ modifiable et demande à l’utilisateur de confirmer ou corriger ce nom avant de créer la fiche

### Requirement: La cause des erreurs de capture est diagnostiquée et couverte
Le comportement de capture MUST être vérifié sur les variantes de pages Instagram et LinkedIn prises en charge afin d’identifier pourquoi une valeur d’interface peut être choisie à la place de l’identité du profil. Les cas corrigés MUST être couverts par des vérifications de régression qui garantissent qu’un tel libellé ne peut plus être enregistré comme nom.

#### Scenario: Régression du libellé « Voir Profil »
- **WHEN** la capture rencontre un profil dont le DOM visible contient « Voir Profil » dans un bouton ou une action et un autre nom ou handle de profil
- **THEN** la fiche créée ne contient pas « Voir Profil » comme nom et conserve l’identité du profil ou la valeur de secours modifiable

#### Scenario: Régression sans nom affiché
- **WHEN** la capture rencontre un profil pris en charge sans nom fiable mais avec un handle
- **THEN** le handle est proposé dans le champ de confirmation et aucune fiche n’est créée avec un nom générique

#### Scenario: L’utilisateur corrige le nom proposé
- **WHEN** l’utilisateur remplace le nom ou handle prérempli avant de confirmer la création
- **THEN** la fiche CRM conserve le nom corrigé par l’utilisateur

### Requirement: La navigation SPA actualise le profil traité par l’extension
Quand l’utilisateur ouvre un autre profil ou une autre conversation Instagram ou LinkedIn sans recharger la page, l’extension MUST détecter le changement de profil actif et relancer la résolution CRM. Elle MUST attendre que l’identité du nouvel écran soit disponible si la page met à jour son DOM après l’URL et MUST retirer le lien et les données du profil précédent.

#### Scenario: Passage à un autre profil sans rechargement
- **WHEN** l’utilisateur ouvre un autre profil depuis Instagram ou LinkedIn dans la même page
- **THEN** l’extension actualise sa fiche et son lien CRM avec le profil actif sans demander un rafraîchissement de page

#### Scenario: Passage à une autre conversation
- **WHEN** l’utilisateur sélectionne un autre fil de conversation dans l’application sociale
- **THEN** l’extension résout le profil lié au fil actif et n’affiche pas le lien CRM du fil précédent

#### Scenario: Le DOM du nouveau profil arrive après l’URL
- **WHEN** l’URL change avant que la page affiche l’identité du nouveau profil
- **THEN** l’extension reprend la détection lorsque le DOM est mis à jour et ne conserve pas une fiche liée à l’ancien profil
