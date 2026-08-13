## Purpose

Le Suivi des ventes présente chaque paiement encaissé sur le Stripe connecté du client
comme une transaction réconciliée avec les deals de closing, en rendant visibles les
impayés, les remboursements, les paiements non rattachés et le reste à payer — sans
double-compte et sans jamais lire un autre Stripe que celui du client.

## ADDED Requirements

### Requirement: Scope strict au Stripe Connect du client

Le système SHALL alimenter le Suivi des ventes exclusivement depuis le compte Stripe
connecté du client (jeton OAuth read-only). Il SHALL NOT lire le Stripe Billing de
Minaly (`STRIPE_SECRET_KEY`) ni le système de parrainage. Le terme « abonnement » y
désigne toujours l'abonnement d'un client final du client, jamais l'abonnement SaaS Minaly.

#### Scenario: Une charge du Stripe du client apparaît

- **WHEN** la sync lit une charge sur le compte Connect du client
- **THEN** elle peut alimenter le Suivi des ventes

#### Scenario: Le Billing Minaly n'entre jamais

- **WHEN** un paiement d'abonnement SaaS transite par le Stripe Billing de Minaly
- **THEN** il n'apparaît jamais dans le Suivi des ventes d'aucun client

### Requirement: Réconciliation des paiements réussis avec merge auto

Le système SHALL prendre en compte les charges `succeeded` du compte connecté. Pour
chaque charge, il SHALL d'abord chercher un deal existant correspondant par email +
montant ; si un seul deal correspond, il SHALL marquer l'échéance concernée comme payée
plutôt que de créer un nouveau deal. Si aucun deal ne correspond, il SHALL créer un deal
d'origine Stripe.

#### Scenario: La charge complète un deal existant

- **WHEN** une charge réussie correspond par email + montant à une seule échéance non payée d'un deal
- **THEN** cette échéance passe à « payé » et aucun deal n'est créé

#### Scenario: La charge n'a aucun deal correspondant

- **WHEN** une charge réussie ne correspond à aucun deal existant
- **THEN** un deal d'origine Stripe est créé et marqué « à rattacher » (orphelin)

### Requirement: Garde-fou contre les fausses fusions

Le système SHALL laisser une charge en état orphelin (« à rattacher ») plutôt que de la
fusionner lorsqu'il existe plus d'un deal candidat ou que la correspondance est ambiguë.

#### Scenario: Plusieurs deals candidats

- **WHEN** une charge correspond par email + montant à plus d'un deal
- **THEN** elle n'est fusionnée à aucun et reste « à rattacher »

### Requirement: Rattachement des abonnements par customer

Le système SHALL rattacher les prélèvements récurrents d'un abonnement par le customer
Stripe, et non par le montant. Chaque prélèvement SHALL apparaître comme une ligne
marquée « abonnement », sans reste à payer.

#### Scenario: Deuxième prélèvement d'un abonnement

- **WHEN** un second prélèvement arrive pour un customer déjà associé à un abonnement
- **THEN** il est rattaché à cet abonnement par le customer et affiché en ligne « abonnement » sans reste à payer

### Requirement: Statut remboursé

Le système SHALL refléter un remboursement Stripe par un statut « remboursé » porté par
la donnée de l'échéance concernée, distinct d'un échec de paiement.

#### Scenario: Une charge payée est remboursée

- **WHEN** une charge précédemment payée est remboursée sur Stripe
- **THEN** l'échéance correspondante porte le statut « remboursé »

### Requirement: Idempotence de la sync

Le système SHALL ignorer toute charge déjà enregistrée (identifiée par son
`stripeChargeId`) lors d'une re-synchronisation, de sorte qu'aucun chiffre ne soit doublé.

#### Scenario: Re-synchronisation

- **WHEN** la sync est rejouée sur une charge déjà enregistrée
- **THEN** aucune écriture ni double-compte n'a lieu pour cette charge

### Requirement: Métriques comptées par deal

Le système SHALL calculer les cartes métriques (CA contracté, CA encaissé, en attente,
impayés) à partir des deals, et non à partir des lignes de prélèvement affichées, de
sorte qu'un deal payé en plusieurs fois ne soit compté qu'une seule fois.

#### Scenario: Un deal payé en trois fois

- **WHEN** un deal de 1500€ est réglé en trois prélèvements de 500€ affichés sur trois lignes
- **THEN** le CA contracté n'augmente que de 1500€, jamais de 4500€

### Requirement: Affichage transaction par prélèvement

Le système SHALL afficher une ligne par prélèvement, indiquant la nature (one-shot,
échéancier avec son rang `N/total`, ou abonnement), le statut, et le reste à payer. Le
reste à payer SHALL n'être présenté que pour un échéancier à durée finie ; il SHALL être
absent pour un abonnement récurrent.

#### Scenario: Ligne d'échéancier

- **WHEN** un deal en trois fois a réglé son premier prélèvement
- **THEN** une ligne « Échéancier 1/3 · payé » s'affiche et le reste à payer du deal vaut le total moins ce qui est payé

#### Scenario: Ligne d'abonnement

- **WHEN** un prélèvement d'abonnement s'affiche
- **THEN** aucun reste à payer n'est présenté sur cette ligne

### Requirement: Création d'une vente depuis un orphelin

Le système SHALL permettre de créer une vente à partir d'une charge orpheline via une
action pré-remplie (montant, date, email) validée côté serveur, et SHALL lever l'état
« à rattacher » une fois la vente créée.

#### Scenario: L'utilisateur rattache un orphelin

- **WHEN** l'utilisateur crée une vente depuis une ligne « à rattacher »
- **THEN** la vente est enregistrée avec les données pré-remplies de la charge et la ligne n'est plus orpheline

### Requirement: Encart de réconciliation conditionnel

Le système SHALL afficher un encart de réconciliation, sans CTA global, uniquement
lorsqu'il existe au moins un impayé ou un orphelin, avec un compteur d'impayés
(nombre + montant) et un compteur de paiements à rattacher.

#### Scenario: Ni impayé ni orphelin

- **WHEN** aucun impayé et aucun orphelin n'existe sur la période
- **THEN** l'encart de réconciliation n'est pas affiché

### Requirement: Statut de connexion Stripe honnête

Le système SHALL présenter un statut de connexion Stripe qui reflète le comportement
réel (les paiements alimentent le suivi) et SHALL NOT afficher une mention de
synchronisation trompeuse.

#### Scenario: Stripe connecté

- **WHEN** le compte Stripe du client est connecté
- **THEN** le statut indique que les paiements alimentent automatiquement le suivi
