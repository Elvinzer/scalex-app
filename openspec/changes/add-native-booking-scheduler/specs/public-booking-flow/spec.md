## Purpose

Cette capacité fournit une page publique de réservation qui qualifie le prospect avant de révéler les créneaux, applique les règles de disponibilité et crée une réservation fiable avec confirmation.

## ADDED Requirements

### Requirement: Contact opt-in gates availability

Pour un événement configuré avec la qualification préalable, le système SHALL demander le prénom, le nom, l’email et le téléphone avant de rendre les créneaux visibles et sélectionnables. La zone de disponibilités SHALL rester clairement verrouillée et non interactive tant que le formulaire n’est pas valide.

#### Scenario: Visitor sees locked availability before submitting details

- **WHEN** un visiteur ouvre un événement actif pour la première fois
- **THEN** il voit le formulaire de coordonnées à gauche et un aperçu verrouillé ou flouté des disponibilités à droite, sans pouvoir sélectionner un horaire

### Requirement: Contact fields are validated

Le système SHALL valider les quatre champs requis côté client et côté serveur. Le téléphone SHALL accepter un indicatif international et l’email SHALL être normalisé avant toute recherche de rendez-vous existant. Les erreurs SHALL être affichées près du champ concerné et le formulaire SHALL conserver les valeurs valides.

#### Scenario: Invalid phone prevents reveal

- **WHEN** le visiteur saisit un numéro invalide puis soumet le formulaire
- **THEN** le système refuse la soumission, indique comment corriger le numéro et ne révèle pas les créneaux

### Requirement: Slots are revealed without losing context

Après une soumission valide, le système SHALL révéler les créneaux disponibles sans rechargement destructif, conserver les informations saisies et déplacer le focus vers le calendrier. Les paramètres d’attribution présents dans l’URL SHALL être conservés pendant cette transition.

#### Scenario: Valid opt-in reveals the calendar

- **WHEN** le visiteur soumet un formulaire valide avec des paramètres UTM
- **THEN** les créneaux apparaissent, les coordonnées restent remplies et les paramètres UTM peuvent encore être associés à la future réservation

### Requirement: Prospect timezone display

Le système SHALL afficher par défaut les créneaux dans le fuseau horaire détecté du prospect et SHALL proposer une bascule vers le fuseau horaire de l’événement. Le choix d’affichage SHALL modifier les libellés visibles sans modifier l’instant réservé.

#### Scenario: Visitor switches to event timezone

- **WHEN** un prospect sélectionne « Fuseau horaire de l’événement »
- **THEN** les dates et heures sont recalculées et étiquetées dans le fuseau de l’événement, tandis que la disponibilité réelle reste identique

### Requirement: Existing future appointment is blocked

Avant de confirmer un nouveau rendez-vous, le système SHALL rechercher dans le compte les rendez-vous futurs du prospect correspondant à son email normalisé et dont l’état n’est pas annulé. S’il en existe un, la nouvelle réservation SHALL être bloquée et la page SHALL afficher un avertissement indiquant qu’un rendez-vous est déjà planifié.

#### Scenario: Prospect already has a future appointment

- **WHEN** un prospect ayant un rendez-vous futur non annulé tente de réserver
- **THEN** le système refuse la nouvelle réservation, affiche l’information de façon compréhensible et ne crée ni doublon interne ni événement externe

### Requirement: Booking confirmation is atomic

Le système SHALL revalider le créneau, les exceptions, les limites, l’absence de rendez-vous futur et l’éligibilité du closer au moment de la confirmation. Si l’une de ces conditions échoue, aucun rendez-vous confirmé ne SHALL être créé et le prospect SHALL pouvoir choisir un autre créneau.

#### Scenario: Slot is taken during confirmation

- **WHEN** un autre prospect réserve le créneau avant la confirmation finale
- **THEN** la confirmation échoue avec un message de créneau indisponible et le calendrier recharge les alternatives disponibles

### Requirement: Native booking feeds sales tracking

Lorsqu’une réservation est confirmée et synchronisée, le système SHALL créer ou mettre à jour un appel de vente avec la source `native`, le nom, l’email, le téléphone, l’horaire, le closer attribué et l’identifiant de réservation. Une répétition de la même confirmation SHALL être idempotente.

#### Scenario: Confirmed native booking appears in sales calls

- **WHEN** un prospect confirme un créneau et que le calendrier est synchronisé
- **THEN** un seul appel de vente natif apparaît dans le suivi des appels avec les informations de la réservation

### Requirement: Public booking errors are safe and recoverable

Les endpoints publics SHALL limiter les abus et ne SHALL pas divulguer de données sur d’autres prospects. Les erreurs de disponibilité, de calendrier ou de doublon SHALL proposer une action compréhensible sans exposer de secrets techniques.

#### Scenario: Repeated public submissions are rate limited

- **WHEN** une même origine envoie un nombre anormal de demandes publiques sur une courte période
- **THEN** le système ralentit ou refuse temporairement les demandes et affiche un message de réessai ultérieur
