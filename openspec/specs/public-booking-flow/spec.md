# public-booking-flow Specification

## Purpose

Cette capacité fournit une page publique de réservation qui qualifie le prospect avant de révéler les créneaux, applique les règles de disponibilité et crée une réservation fiable avec confirmation.

## Requirements

### Requirement: Contact opt-in gates availability

Pour un événement configuré avec la qualification préalable, le système SHALL demander les informations par paliers successifs : téléphone seul, puis prénom et nom, puis email et questions configurées, avant de rendre les créneaux visibles et sélectionnables. Chaque palier SHALL proposer un bouton `Continuer`. Les paliers validés SHALL rester visibles et ne SHALL jamais se refermer automatiquement. La zone de disponibilités SHALL rester clairement verrouillée et non interactive tant que le dernier palier requis n’est pas valide.

#### Scenario: Visitor sees only the phone stage first

- **WHEN** un visiteur ouvre un événement actif pour la première fois
- **THEN** il voit le téléphone comme seul champ actif, les étapes suivantes restent masquées et le calendrier apparaît verrouillé

#### Scenario: Valid phone reveals the next stage

- **WHEN** le visiteur valide un téléphone international avec `Continuer`
- **THEN** le palier téléphone reste visible en résumé et le palier prénom/nom est révélé sans fermer le téléphone

#### Scenario: Valid qualification reveals the calendar

- **WHEN** le visiteur valide l’identité, l’email et toutes les questions obligatoires
- **THEN** le calendrier devient interactif et le focus est déplacé vers le calendrier ou le premier créneau disponible

### Requirement: Contact fields are validated

Le système SHALL valider chaque palier côté client et côté serveur. Le téléphone SHALL être validé comme numéro international et normalisé en E.164 avant toute recherche de rendez-vous existant. L’email SHALL être requis et valide avant la révélation des créneaux. Les champs SHALL être validés au blur ou à la validation du palier, jamais à chaque caractère. Les erreurs SHALL être affichées près du champ concerné et le bouton `Continuer` SHALL rester inactif tant que le palier courant est invalide.

#### Scenario: Invalid phone prevents progression

- **WHEN** le visiteur quitte un téléphone invalide puis clique sur `Continuer`
- **THEN** le système refuse la progression, explique le format attendu et ne révèle pas le palier suivant

#### Scenario: Invalid email prevents calendar reveal

- **WHEN** le visiteur saisit un email invalide au palier email/questions
- **THEN** le système conserve les valeurs valides, indique comment corriger l’email et laisse le calendrier verrouillé

### Requirement: Slots are revealed without losing context

Après chaque validation de palier, le système SHALL révéler le palier suivant sans rechargement destructif, conserver les informations saisies, conserver les paramètres d’attribution et déplacer le focus vers le premier champ ou contrôle révélé. Le brouillon du formulaire SHALL être conservé uniquement dans la session du navigateur et ne SHALL pas devenir une source d’autorité pour la réservation.

#### Scenario: Valid stages preserve attribution and draft

- **WHEN** un visiteur progresse avec des paramètres UTM puis revient dans la même session
- **THEN** les champs, le palier atteint et les paramètres d’attribution sont restaurés sans créer de nouvelle réservation

#### Scenario: Reduced motion keeps the same progression

- **WHEN** le navigateur demande `prefers-reduced-motion`
- **THEN** les étapes changent sans animation décorative, avec le même ordre et le même déplacement de focus

### Requirement: Abandoned attempts become relaunchable leads

À la validation du palier prénom/nom, le système SHALL créer ou actualiser une tentative account-scoped idempotente, même si le prospect abandonne avant l’email ou les questions. Cette tentative SHALL conserver le téléphone E.164, l’identité disponible, le fuseau, l’instant de consentement au recontact, la dernière étape atteinte, l’attribution et le dernier créneau sélectionné lorsqu’il existe. L’email et les réponses SHALL être ajoutés ou actualisés lorsque le palier suivant est validé. Une tentative incomplète SHALL rester distincte d’un rendez-vous confirmé.

#### Scenario: Lead is created after identity stage

- **WHEN** un visiteur valide son prénom et son nom puis ferme la page
- **THEN** il apparaît dans « À relancer » avec son téléphone, son identité, son événement et l’étape atteinte

#### Scenario: Phone-only draft is not a relaunch lead

- **WHEN** un visiteur saisit uniquement son téléphone sans valider le palier suivant
- **THEN** le système peut conserver un brouillon de session mais ne l’affiche pas comme lead relançable account-scoped

### Requirement: Authorized users can work abandoned leads

L’espace « Ventes → Rendez-vous » SHALL afficher aux membres disposant de la permission rendez-vous les tentatives non converties avec les informations disponibles, y compris l’email et les réponses déjà validées lorsqu’elles existent. Il SHALL proposer les actions de relance prévues, dont l’appel et le lien WhatsApp, sans exposer ces données à un visiteur public ou à un membre non autorisé.

#### Scenario: Sales user sees qualification context

- **WHEN** un closer autorisé ouvre une tentative abandonnée après le palier email/questions
- **THEN** il voit l’email et les réponses enregistrées avec le contexte de la tentative

#### Scenario: Completed booking closes the lead

- **WHEN** la tentative est convertie en rendez-vous confirmé
- **THEN** le lead est marqué « converti », lié au rendez-vous et n’apparaît plus dans les relances ouvertes

### Requirement: Prospect timezone display

Le système SHALL afficher par défaut les créneaux dans le fuseau horaire de l’événement. Si le fuseau du navigateur du prospect diffère, la page SHALL afficher cette différence et proposer une bascule explicite vers le fuseau du prospect. Le choix d’affichage SHALL modifier les libellés visibles sans modifier l’instant réservé.

#### Scenario: Visitor sees event timezone by default

- **WHEN** le prospect ouvre une page dont l’événement est en `Europe/Paris`
- **THEN** les dates et heures sont affichées en `Europe/Paris`, même si son navigateur utilise un autre fuseau

#### Scenario: Visitor switches to browser timezone

- **WHEN** le prospect active la bascule vers son fuseau de navigateur
- **THEN** les libellés sont recalculés dans ce fuseau et l’instant réellement réservé reste identique

### Requirement: Existing future appointment is blocked

Avant de confirmer un nouveau rendez-vous, le système SHALL rechercher dans le compte les rendez-vous futurs du prospect correspondant à son téléphone normalisé et dont l’état n’est pas annulé. S’il en existe un, la nouvelle réservation SHALL être bloquée et la page SHALL afficher un avertissement indiquant qu’un rendez-vous est déjà planifié.

#### Scenario: Prospect already has a future appointment

- **WHEN** un prospect ayant un rendez-vous futur non annulé tente de réserver
- **THEN** le système refuse la nouvelle réservation, affiche l’information de façon compréhensible et ne crée ni doublon interne ni événement externe

### Requirement: Booking confirmation is atomic

Le système SHALL revalider le créneau, les exceptions, les limites, l’absence de rendez-vous futur et l’éligibilité du closer au moment de la confirmation. Si l’une de ces conditions échoue, aucun rendez-vous confirmé ne SHALL être créé et le prospect SHALL pouvoir choisir un autre créneau.

#### Scenario: Slot is taken during confirmation

- **WHEN** un autre prospect réserve le créneau avant la confirmation finale
- **THEN** la confirmation échoue avec un message de créneau indisponible et le calendrier recharge les alternatives disponibles

### Requirement: Native booking feeds sales tracking

Lorsqu’une réservation est confirmée et synchronisée, le système SHALL créer ou mettre à jour un appel de vente avec la source `native`, le nom, l’email, le téléphone, l’horaire, le closer attribué, l’identifiant de réservation et les réponses de qualification. Une répétition de la même confirmation SHALL être idempotente.

#### Scenario: Confirmed native booking retains qualification

- **WHEN** un prospect confirme un créneau après avoir répondu aux questions
- **THEN** un seul appel de vente natif apparaît dans le suivi des appels avec l’email et le contexte de qualification disponibles

### Requirement: Public booking errors are safe and recoverable

Les endpoints publics SHALL limiter les abus et ne SHALL pas divulguer de données sur d’autres prospects. Les erreurs de disponibilité, de calendrier ou de doublon SHALL proposer une action compréhensible sans exposer de secrets techniques.

#### Scenario: Repeated public submissions are rate limited

- **WHEN** une même origine envoie un nombre anormal de demandes publiques sur une courte période
- **THEN** le système ralentit ou refuse temporairement les demandes et affiche un message de réessai ultérieur

### Requirement: Public booking keeps secure post-booking management

Après une réservation native confirmée, la page SHALL conserver l’écran de confirmation et proposer, lorsque les jetons existent, l’annulation et le déplacement publics sécurisés. Ces actions SHALL respecter les mêmes contrôles de disponibilité et d’état que les actions administrateur.

#### Scenario: Prospect manages a confirmed booking

- **WHEN** le prospect ouvre son lien de gestion après confirmation
- **THEN** il peut consulter le rendez-vous, télécharger son `.ics`, le déplacer ou l’annuler selon les actions encore disponibles
