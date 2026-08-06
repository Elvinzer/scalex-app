## Purpose

Donne à chaque compte un identifiant public court, stable et URL-safe (le « handle ») qui namespace ses liens de réservation, afin que deux comptes puissent réutiliser le même slug d'événement sans collision d'URL.

## ADDED Requirements

### Requirement: Format du handle de compte

Le système SHALL stocker pour chaque compte un handle optionnel, unique globalement, respectant un format URL-safe : minuscules `a-z`, chiffres `0-9` et tirets `-`, sans tiret en début ou fin, longueur comprise entre 3 et 40 caractères.

#### Scenario: Handle valide accepté
- **WHEN** un handle `cedric-coaching` est enregistré pour un compte
- **THEN** le système l'accepte et l'associe au compte

#### Scenario: Format invalide rejeté
- **WHEN** un handle contient une majuscule, un espace, un accent, ou fait moins de 3 caractères
- **THEN** le système rejette la valeur avec une erreur de validation et n'écrit rien

#### Scenario: Unicité globale
- **WHEN** un compte tente d'enregistrer un handle déjà utilisé par un autre compte
- **THEN** le système rejette la valeur comme indisponible

### Requirement: Génération automatique du handle

Le système SHALL générer un handle automatiquement au moment où le compte crée son premier événement de réservation, sans handle préexistant. La valeur SHALL être dérivée du nom d'entreprise (`businessName`) slugifié ; si celui-ci est vide ou inexploitable, le système SHALL se rabattre sur la partie locale de l'e-mail, puis sur un jeton aléatoire. En cas de collision, le système SHALL suffixer un numéro incrémental (`-2`, `-3`, …) jusqu'à obtenir une valeur libre.

#### Scenario: Dérivation depuis le nom d'entreprise
- **WHEN** un compte dont `businessName` = "Cédric Coaching & Co." crée son premier événement de réservation
- **THEN** le système lui attribue un handle `cedric-coaching` (accents retirés, ponctuation nettoyée)

#### Scenario: Collision résolue par suffixe
- **WHEN** le handle dérivé `cedric-coaching` est déjà pris par un autre compte
- **THEN** le système attribue `cedric-coaching-2` (ou le premier suffixe libre)

#### Scenario: Fallback sans nom d'entreprise
- **WHEN** un compte sans `businessName` exploitable crée son premier événement de réservation
- **THEN** le système génère un handle à partir de la partie locale de l'e-mail, puis d'un jeton aléatoire si nécessaire

#### Scenario: Handle conservé entre événements
- **WHEN** un compte disposant déjà d'un handle crée un deuxième événement de réservation
- **THEN** le système réutilise le handle existant sans le régénérer ni le modifier

### Requirement: Mots réservés

Le système SHALL refuser tout handle figurant dans une liste de mots réservés (au minimum : `admin`, `api`, `ics`, `book`, `auth`, `onboarding`, `invite`, `r`) pour éviter toute ambiguïté avec les segments de route techniques.

#### Scenario: Mot réservé refusé
- **WHEN** un compte tente d'enregistrer le handle `admin`
- **THEN** le système le refuse comme indisponible

### Requirement: Édition du handle

Le système SHALL permettre au propriétaire d'un compte de modifier son handle depuis les réglages, sous réserve des règles de format, d'unicité et de mots réservés. La modification SHALL être avertie comme cassant les anciens liens émis avec l'ancien handle.

#### Scenario: Modification valide
- **WHEN** le propriétaire remplace `cedric-coaching` par un `cedric-business` disponible et bien formé
- **THEN** le système enregistre le nouveau handle et les futurs liens l'utilisent

#### Scenario: Modification vers un handle pris
- **WHEN** le propriétaire tente un handle déjà utilisé par un autre compte
- **THEN** le système rejette la modification et conserve le handle actuel
