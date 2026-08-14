## Purpose

Permettre à chaque utilisateur authentifié de signaler un problème ou de proposer une évolution avec suffisamment de contexte pour que Minaly puisse comprendre, suivre et traiter sa demande sans lui faire répéter son environnement.

## ADDED Requirements

### Requirement: User can open support from the authenticated product

Le produit SHALL rendre l'entrée « Aide & support » accessible depuis toutes les pages authentifiées, sans dépendre de la page métier actuellement ouverte.

#### Scenario: User opens support from a product page

- **WHEN** un utilisateur authentifié sélectionne l'entrée d'aide depuis une page de l'application
- **THEN** le formulaire de support s'ouvre sans quitter la page courante
- **AND** l'écran métier courant est affiché dans le récapitulatif du formulaire

#### Scenario: User opens support from a mobile viewport

- **WHEN** un utilisateur ouvre le menu de compte sur un viewport mobile
- **THEN** l'entrée « Aide & support » reste accessible au clavier et au toucher

### Requirement: User can submit a structured support ticket

Le formulaire SHALL proposer les types « problème », « demande d'évolution » et « question », ainsi qu'un titre et une description obligatoires. Les champs complémentaires MUST s'adapter au type sélectionné.

#### Scenario: User submits a bug report

- **WHEN** l'utilisateur choisit « problème » et renseigne un titre, une description, le résultat attendu et le résultat constaté
- **THEN** le ticket est créé avec le type problème et conserve ces informations dans son contenu structuré

#### Scenario: User submits a feature request

- **WHEN** l'utilisateur choisit « demande d'évolution » et décrit le problème rencontré ou le résultat recherché
- **THEN** le ticket est créé comme demande d'évolution sans exiger des étapes de reproduction propres à un bug

#### Scenario: Required information is missing

- **WHEN** le titre ou la description est vide, trop long ou invalide
- **THEN** le formulaire affiche une erreur locale et aucune demande n'est créée

### Requirement: Ticket context is captured from the current page

Le système SHALL enregistrer le contexte de la page au moment de l'ouverture ou de l'envoi : identifiant d'écran, libellé lisible, route nettoyée sans secret, langue, viewport, navigateur, système, horodatage et version de déploiement lorsque disponible. L'identité, l'email et le compte MUST être dérivés côté serveur.

#### Scenario: User navigates before opening the form

- **WHEN** l'utilisateur change de page puis ouvre le support
- **THEN** le ticket utilise la dernière page réellement affichée et non une route mise en cache lors du chargement initial

#### Scenario: Context contains sensitive URL data

- **WHEN** la route courante contient un paramètre de type token, code, clé, secret ou access token
- **THEN** ces valeurs sont supprimées avant l'enregistrement ou l'envoi d'une notification

#### Scenario: Delegated team member submits a ticket

- **WHEN** un membre d'équipe client soumet une demande
- **THEN** le ticket est rattaché au compte propriétaire et conserve séparément l'identité du membre qui l'a soumis

### Requirement: User can include a page capture safely

Le formulaire SHALL proposer par défaut une capture de la page produit visible au moment de la demande. La capture MUST être prévisualisable, retirable avant envoi et limitée à la page Minaly, sans capture de l'écran du système, des autres onglets ou des applications externes.

#### Scenario: User keeps the suggested capture

- **WHEN** la capture est générée avec succès et que l'utilisateur conserve l'option cochée
- **THEN** une pièce jointe de type capture est associée au ticket avant sa soumission

#### Scenario: User removes the capture

- **WHEN** l'utilisateur décoche ou supprime la prévisualisation
- **THEN** le ticket est créé sans capture et le support voit explicitement qu'aucune capture n'a été jointe

#### Scenario: Capture generation fails

- **WHEN** le navigateur ne permet pas de générer la capture ou que la génération échoue
- **THEN** le formulaire reste utilisable, explique que la capture n'a pas pu être ajoutée et permet de soumettre le ticket sans elle

#### Scenario: Sensitive content is present in the page

- **WHEN** la page contient un champ marqué comme sensible ou une donnée qui ne doit pas être exportée
- **THEN** cette zone est masquée ou exclue de la capture avant tout envoi

### Requirement: User can follow the public part of a ticket

Le produit SHALL fournir à l'utilisateur et au propriétaire du compte une liste de leurs tickets autorisés, leur statut lisible, les messages publics et la possibilité d'ajouter du contexte tant que le ticket n'est pas définitivement fermé. Les notes internes et les informations réservées au support MUST rester invisibles.

#### Scenario: User views an open ticket

- **WHEN** l'utilisateur ouvre `/support` et sélectionne un ticket de son compte auquel il a accès
- **THEN** il voit la référence, le type, le statut, la description, le contexte non sensible et les messages publics

#### Scenario: User adds information while support is waiting

- **WHEN** le ticket est en attente d'une réponse utilisateur et que l'utilisateur ajoute un message
- **THEN** le message est ajouté à l'historique public et le ticket revient en triage

#### Scenario: User attempts to read another account's ticket

- **WHEN** un utilisateur demande un ticket qui n'appartient pas à son compte autorisé
- **THEN** le système refuse l'accès sans révéler si la référence existe

### Requirement: Ticket submission is authenticated, validated and idempotent

Toute création SHALL vérifier la session côté serveur, valider les champs et les pièces jointes à la frontière externe, appliquer un rate limit par utilisateur ou compte et accepter une clé d'idempotence afin qu'un double clic ou une répétition réseau ne crée pas deux tickets.

#### Scenario: Duplicate submission is retried

- **WHEN** la même clé d'idempotence est renvoyée après une réponse réseau perdue
- **THEN** le système renvoie la référence du ticket déjà créé sans insérer une nouvelle demande

#### Scenario: Unauthenticated submission is attempted

- **WHEN** une requête de création est envoyée sans session valide
- **THEN** la requête est refusée et aucune donnée de ticket ou de pièce jointe n'est créée
