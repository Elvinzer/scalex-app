## Context

Le projet utilise Next.js App Router, des handlers/server actions, Drizzle sur Postgres/Supabase et un modèle account/team où `users.id` représente le propriétaire du compte. Les tables métier sont déjà protégées par RLS et les accès authentifiés passent par `lib/team/context.ts`. Les abonnements utilisent déjà un champ JSONB `subscription_plans.features`, tandis que `sales_calls` conserve un identifiant historique nommé `iclosed_call_id` pour plusieurs sources.

La proposition ajoute un parcours public qui ne peut pas dépendre du layout authentifié. La réservation doit aussi coordonner plusieurs closers, des calendriers externes et une attribution marketing dans un même flux transactionnel.

## Goals / Non-Goals

**Goals:**

- Ajouter un domaine de réservation natif extensible sans casser les imports iClosed, Calendly et les appels manuels.
- Garantir qu’un créneau ne soit confirmé qu’une seule fois pour un closer et qu’un prospect ne puisse pas avoir deux rendez-vous futurs dans le même compte.
- Faire du fuseau IANA de l’événement la référence métier, tout en affichant les heures dans le fuseau du prospect par défaut.
- Isoler les secrets OAuth et les données personnelles derrière des frontières serveur et des contrôles account/team.
- Rendre le parcours public rapide, compréhensible, accessible au clavier et testable de bout en bout avec `agent-browser`.
- Préserver une intention de réservation exploitable par les closers sans transformer un formulaire incomplet en faux rendez-vous confirmé.

**Non-Goals:**

- Remplacer les intégrations iClosed ou Calendly existantes.
- Construire un CRM complet, une séquence de prospection ou un moteur de qualification avancé.
- Ajouter la prise de paiement, la billetterie ou la réservation de plusieurs participants.
- Importer automatiquement l’historique complet des calendriers externes ; seuls les conflits nécessaires et les événements natifs sont synchronisés.

## Decisions

### 1. Séparer le domaine de réservation du modèle historique des appels

Les réservations seront stockées dans un domaine propre, puis projetées vers `sales_calls` lorsqu’elles sont confirmées. Les tables principales seront :

- `native_booking_events` : identité publique, état, durée, buffers, limites, fuseau et curseur round robin.
- `native_booking_availability` : plages récurrentes par jour, exprimées dans le fuseau de l’événement.
- `native_booking_exceptions` : fermetures et plages particulières par date.
- `native_booking_event_closers` : closers associés, ordre de rotation et état d’éligibilité.
- `native_bookings` : coordonnées du prospect, horaires UTC, fuseaux, closer attribué, état, tokens d’action, état de synchronisation externe et snapshot UTM.
- `native_booking_leads` : tentative de réservation qualifiée mais non confirmée, coordonnées contactables, étape atteinte, créneau consulté, consentement de recontact, dernier passage et snapshot d’attribution.
- `native_calendar_connections` et `native_calendar_sources` : fournisseur, closer, calendriers sélectionnés et état de synchronisation.
- `native_booking_links` : liens nommés avec paramètres UTM prédéfinis et état actif.

Les tables account-scoped SHALL être créées avec RLS et les requêtes authentifiées SHALL toujours filtrer par `accountId`. Le public ne recevra jamais une ligne brute de ces tables : les handlers publics retourneront uniquement une projection minimale de l’événement et des créneaux.

Pour conserver la compatibilité, `sales_calls` recevra un lien nullable vers `native_bookings`, une référence structurée au closer et la source `native`. Le champ historique `iclosed_call_id` restera rempli avec un identifiant stable préfixé `native:` pour ne pas casser son index unique ni les lecteurs existants ; une migration ultérieure pourra le renommer génériquement lorsque toutes les sources auront été traitées.

`native_bookings` recevra un lien nullable vers le lead qui a précédé la confirmation. Une conversion mettra le lead à l’état `converted` dans la même transaction que la création du rendez-vous et de l’appel de vente.

### 2. Utiliser des règles relationnelles et UTC pour calculer les créneaux

Les plages hebdomadaires et exceptions seront relationnelles afin de valider les chevauchements, les jours fermés et les modifications ciblées. Les rendez-vous seront persistés en UTC avec `eventTimeZone` et `guestTimeZone` en plus de `startAt`/`endAt`. Les calculs de dates utiliseront le fuseau IANA de l’événement et devront couvrir explicitement les changements d’heure été/hiver.

Les créneaux seront calculés à la demande à partir de la fenêtre demandée, des règles récurrentes, des exceptions, des rendez-vous natifs et des périodes busy des closers. Une mise en cache courte peut être utilisée pour la lecture publique, mais la disponibilité sera toujours recalculée au moment de confirmer.

Alternative écartée : stocker toutes les occurrences futures. Cette approche simplifierait la lecture mais rendrait les exceptions, les changements de fuseau et les modifications d’horaires difficiles à maintenir.

### 3. Réserver avec un état pending et une transaction de confirmation

La confirmation publique suivra ce flux :

1. Valider le formulaire, normaliser l’email et le téléphone, puis rechercher un rendez-vous futur non annulé au niveau du compte.
2. Créer une réservation `pending` avec une clé d’idempotence et une courte expiration de hold.
3. Dans une transaction, revalider l’événement actif, les exceptions, le créneau, les closers éligibles et l’absence de chevauchement. Avancer le curseur round robin uniquement après une attribution valide.
4. Créer ou retrouver l’événement externe via l’adaptateur calendrier du closer.
5. Passer la réservation à `confirmed`, enregistrer les identifiants externes et créer/upserter l’appel de vente natif.
6. Envoyer la confirmation seulement après confirmation interne et état de synchronisation acceptable.

Une contrainte d’unicité et/ou d’exclusion au niveau Postgres, complétée par le verrouillage transactionnel, empêchera les chevauchements concurrents. Les retries utiliseront la même clé d’idempotence et le même identifiant de réservation. Un échec externe laissera un état récupérable, libérera le hold à expiration et ne sera jamais présenté comme une confirmation réussie au prospect.

Alternative écartée : confirmer immédiatement puis synchroniser silencieusement. Elle risquerait de promettre un rendez-vous absent du calendrier du closer.

### 4. Encapsuler Google et Outlook derrière un adaptateur calendrier

La connexion calendrier sera distincte de `youtube_connections`. Chaque closer pourra autoriser Google Calendar ou Outlook/Microsoft, sélectionner les calendriers à consulter et révoquer la connexion. Les refresh tokens et secrets associés seront traités uniquement côté serveur et chiffrés au repos selon le mécanisme de secrets retenu par l’application.

L’adaptateur exposera les opérations métier `listBusy`, `createEvent`, `updateEvent` et `cancelEvent`, sans exposer les SDK ou les tokens au domaine public. La création sera idempotente grâce à l’identifiant de réservation transmis au fournisseur lorsque celui-ci le permet, puis à la sauvegarde de l’identifiant externe.

Le mode synchronisé sera le mode recommandé et signalera dans l’administration les closers sans connexion valide. Un mode manuel explicite pourra être conservé comme repli contrôlé, mais il ne devra jamais être présenté comme une protection contre les conflits calendaires externes.

Alternative écartée : réutiliser la connexion YouTube. Les scopes, le cycle de vie et les risques d’accès sont différents.

### 5. Étendre les entitlements existants plutôt que créer une facturation parallèle

Le JSONB des plans sera étendu avec des clés validées par le schéma de facturation, notamment `nativeBookingEnabled` et `maxBookingEvents` (`1`, un entier supérieur ou `null` pour illimité). Les fonctions de garde centralisées liront l’abonnement actif du compte à chaque création et activation.

Le compteur portera sur les événements non archivés. En cas de downgrade, les événements et rendez-vous existants resteront lisibles et leurs liens pourront être mis en pause si nécessaire ; seules les nouvelles créations ou activations dépassant la limite seront bloquées. Les comptes administrateurs conserveront le comportement d’accès illimité déjà utilisé par la facturation.

### 6. Concevoir deux surfaces UX distinctes mais cohérentes

Dans l’application, l’entrée « Rendez-vous » sera la troisième source de récupération des appels et l’éditeur d’événement reprendra les repères utiles du screenshot iClosed : en-tête avec statut, aperçu, copie du lien et intégration, puis navigation par sections « Détails », « Closers », « Disponibilités », « Informations invité », « Calendriers », « Notifications », « Confirmation », « Personnalisation » et « Suivi UTM ». Les prérequis bloquants seront visibles près de l’état de l’événement.

La page publique utilisera une mise en page en deux colonnes sur desktop : formulaire d’opt-in à gauche, disponibilité verrouillée/floutée à droite avant validation. Après validation, le calendrier se révèle sans rechargement destructif. Sur mobile, les colonnes s’empilent, les champs restent labellisés, les états de chargement et erreurs sont explicites et les éléments interactifs respectent une cible tactile minimale de 44 px. Les icônes proviendront du système existant, jamais d’emojis.

Alternative écartée : afficher uniquement un formulaire centré avant de charger une page séparée. Le split-screen verrouillé conserve le contexte de l’appel et reprend l’intention UX demandée tout en réduisant la perte de contexte.

### 7. Capturer l’attribution comme un snapshot immuable

Les paramètres UTM seront lus dès l’entrée sur la page, conservés pendant le parcours, puis copiés dans la réservation et l’appel de vente. Les colonnes UTM principales resteront filtrables, accompagnées d’un objet de métadonnées pour les paramètres additionnels. Un lien nommé enregistrera ses propres valeurs au moment de sa création ; modifier le lien ne modifiera jamais l’historique.

Le système privilégiera les paramètres explicitement présents dans l’URL d’entrée. Les données de formulaire, UTM et referrer ne seront jamais utilisées pour prendre une décision d’autorisation ou de routage sans validation serveur.

### 8. Transformer l’opt-in en lead de relance sans exposer de PII au public

Après validation des coordonnées et avant la révélation des créneaux, le handler public créera ou actualisera une ligne de lead liée à l’événement. Le lead conservera les informations saisies avec l’instant de consentement au recontact, le fuseau du prospect, la dernière étape (`slots_revealed`, `slot_selected` ou équivalent), le dernier créneau sélectionné, la page d’entrée, le referrer et le snapshot UTM. Un identifiant de session opaque permettra d’actualiser la même tentative sans placer d’email ou de téléphone dans l’URL.

Le lead sera account-scoped côté serveur et ne sera jamais renvoyé dans la projection publique au-delà d’un identifiant opaque nécessaire à la suite du parcours. Les membres autorisés le verront dans « Ventes → Rendez-vous » sous forme de liste « À relancer », avec des actions réversibles pour marquer le contact comme traité ou masquer la relance. Une tentative confirmée passera automatiquement à `converted` ; une erreur de réservation la laissera relançable avec son dernier créneau connu.

Alternative écartée : ajouter des colonnes d’abandon directement à `native_bookings`. Une ligne de réservation n’existe pas encore lorsqu’un prospect quitte le formulaire ; une table de leads séparée permet de distinguer proprement intention, conversion et rendez-vous confirmé.

## Risks / Trade-offs

- **[Double réservation concurrente]** → transaction de confirmation, hold court, contraintes Postgres, revalidation du busy calendrier et clé d’idempotence par réservation.
- **[Indisponibilité Google/Microsoft]** → états `pending/sync_failed`, retries Inngest idempotents, message honnête au prospect et alerte administrateur.
- **[Fuite de données par une URL publique]** → projection publique minimale, tokens d’annulation stockés sous forme hachée, rate limiting et aucun accès direct aux tables account-scoped pour le navigateur.
- **[Erreur de fuseau ou de DST]** → fuseau IANA conservé sur l’événement, stockage UTC, tests autour des transitions et libellés explicites dans les deux fuseaux.
- **[Régression du suivi des appels]** → insertion additive de la source `native`, conservation de `iclosed_call_id`, migration idempotente et vérification des listes iClosed/Calendly existantes.
- **[Limiteur mémoire non distribué]** → réutiliser le rate limiter actuel pour le premier lancement, instrumenter les refus et prévoir un store partagé si le trafic public le justifie.
- **[Trop de champs avant les créneaux]** → limiter le premier écran aux coordonnées indispensables, validation inline et questions supplémentaires reportées après la sélection si elles sont activées.
- **[Token OAuth expiré]** → statut de connexion visible, tentative de refresh serveur, reconnexion guidée et exclusion temporaire du closer si la disponibilité ne peut plus être garantie.
- **[PII de prospects abandonnés]** → collecte uniquement après validation des coordonnées, stockage account-scoped, consentement de recontact horodaté, aucune PII dans les URLs publiques et accès admin soumis à la permission rendez-vous.
- **[Accumulation de relances obsolètes]** → statuts `open/contacted/converted/dismissed`, vue centrée sur les leads ouverts, action de masquage non destructive et futur mécanisme de rétention à instrumenter.

## Migration Plan

1. Ajouter les tables, enums/états, index, contraintes, RLS et extensions de schéma `sales_calls` de façon additive. Ajouter les clés de plan avec des valeurs désactivées par défaut pour les comptes existants.
2. Ajouter les schémas Zod, guards de facturation et permissions account/team sans exposer encore de lien public actif.
3. Livrer l’éditeur admin, l’aperçu public verrouillé et les liens UTM ; activer la fonctionnalité sur un compte de test.
4. Livrer les adaptateurs Google/Outlook, la disponibilité, l’attribution round robin, la confirmation idempotente et les notifications.
5. Livrer le suivi des leads abandonnés, la vue de relance et la conversion atomique vers une réservation confirmée.
6. Activer progressivement l’entitlement sur les plans, exécuter la matrice `agent-browser` sur desktop/mobile et vérifier les appels historiques iClosed/Calendly.

Le rollback fonctionnel consiste à désactiver l’entitlement ou à mettre les événements en pause. Les migrations sont additives ; aucune table historique de vente ne doit être supprimée. Les réservations déjà confirmées restent conservées, avec reprise manuelle ou automatique des synchronisations externes en attente.
