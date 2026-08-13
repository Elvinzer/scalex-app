## Context

La capacité existante stocke les connexions dans `native_calendar_connections`, avec une contrainte d'unicité par closer et fournisseur. Le callback OAuth effectue donc aujourd'hui un upsert qui ne peut pas conserver plusieurs comptes Google pour un même closer. La disponibilité et la création d'événements utilisent également une seule connexion implicitement choisie, alors que l'UX demandée distingue le compte cible des comptes de conflit et utilise le calendrier principal de chacun.

Les événements natifs conservent encore un `meetingUrl` statique au niveau de l'événement. La création Google existante retourne le lien de l'événement Calendar, mais ne demande pas de `conferenceData` Google Meet et ne possède donc pas de lien de réunion propre à chaque réservation. Voir les spécifications de cette proposition pour le contrat comportemental.

## Goals / Non-Goals

**Goals:**

- Permettre plusieurs autorisations Google par closer sans écrasement ni ambiguïté.
- Séparer les credentials OAuth, les préférences de la feature booking et le snapshot utilisé par une réservation confirmée.
- Garantir qu'un closer attribuable possède une cible Google écrivable et au moins un calendrier de conflit configuré.
- Créer un événement Google idempotent avec une conférence Meet unique, puis propager son lien sur toutes les surfaces natives.
- Préserver les réservations existantes lorsque le compte par défaut ou la sélection des conflits change.
- Donner au closer une page de paramètres dédiée et à l'espace booking un état de readiness actionnable.

**Non-Goals:**

- Permettre à un owner de connecter silencieusement le compte Google d'un autre closer : l'autorisation reste effectuée par le closer concerné.
- Synchroniser les changements effectués directement dans Google Calendar vers Minaly au-delà de la lecture des conflits.
- Générer un lien Google Meet global partagé par un événement de booking : chaque réservation doit avoir sa propre conférence.
- Remplacer immédiatement le support Outlook ; il reste conservé pour compatibilité, mais ne rend pas un closer prêt pour la nouvelle promesse Google Meet.
- Refaire toute la navigation des paramètres selon le screenshot : seule la surface Calendriers et ses accès nécessaires sont dans le périmètre.

## Decisions

### 1. Séparer connexion OAuth et configuration booking

`native_calendar_connections` devient le registre des autorisations fournisseur : compte Minaly, closer, fournisseur, identifiant stable du compte fournisseur, email d'affichage, tokens chiffrés, expiration et état. La contrainte ne sera plus `(closer, provider)` ; elle distinguera une autorisation par identifiant Google stable. L'email reste une donnée d'affichage et de diagnostic, pas une clé d'identité.

Une configuration booking distincte portera, par closer et par compte Minaly :

- `invitationConnectionId` et `invitationCalendarId` pour la cible unique des nouveaux événements ; l'identifiant du calendrier est résolu côté serveur vers le calendrier principal du compte et conservé comme snapshot technique ;
- les comptes sélectionnés pour les conflits, sous forme de lignes relationnelles reliant une connexion à l'identifiant de son calendrier principal résolu côté serveur.

Cette séparation évite de mettre les préférences de la feature sur la ligne OAuth et permet à une future feature d'utiliser la même autorisation avec une autre politique. Les réservations snapshotent la connexion cible effectivement choisie dans `nativeBookings.calendarConnectionId`.

Alternative écartée : conserver `selectedCalendarIds` sur la connexion et utiliser le premier ID comme cible. Cette solution demanderait moins de migration, mais elle mélange lecture et écriture, rend le compte cible implicite et ne permet pas de sélectionner plusieurs comptes Google proprement.

### 2. Identifier un compte Google par son subject OAuth

Le callback récupérera l'identité Google stable (`sub`) en plus de l'adresse email. Une reconnexion du même compte mettra à jour sa ligne ; l'ajout d'un autre compte créera une nouvelle ligne. Le flux d'autorisation demandera explicitement la sélection de compte lorsque nécessaire afin que le bouton « Ajouter un autre compte » ne réutilise pas silencieusement le compte courant.

L'email affiché pourra changer sans créer de nouvelle connexion. Les tokens ne seront jamais renvoyés au client et resteront chiffrés comme aujourd'hui.

### 3. Faire de Google la condition de readiness native

Un closer sera prêt seulement si sa configuration possède une connexion Google active, un calendrier principal accessible en écriture et au moins un compte de conflit dont le calendrier principal est lisible. Les événements actifs vérifieront cette readiness pour chaque closer actif du pool avant activation. La sélection publique et la confirmation finale réutiliseront la même résolution serveur, afin qu'une déconnexion entre l'affichage et le clic final ne puisse pas produire un rendez-vous sans calendrier.

Une connexion Outlook existante ne sera pas supprimée, mais elle ne satisfera pas la readiness Google Meet. La résolution d'un closer ne choisira plus « la connexion la plus récemment modifiée » : elle suivra explicitement la configuration enregistrée.

### 4. Placer l'UX dans les paramètres personnels du closer

Une page `/settings/calendars` reprendra les trois blocs observés dans l'UX iClosed : comptes connectés, compte cible des nouvelles invitations et comptes de conflit. Chaque bloc affichera les comptes, avec une action « Modifier » et sans sélecteur de sous-calendrier. Elle sera protégée côté serveur par la permission `ventes:rdv`, et non par la restriction owner-only de la page générale des réglages, car l'OAuth doit être réalisé par le closer lui-même.

La page `/ventes/rdv` chargera un résumé account-scoped des closers non prêts et affichera un avertissement avec un lien vers la page de paramètres. L'éditeur d'un événement n'hébergera plus les boutons OAuth ni les checkboxes de calendrier ; il pourra seulement afficher un prérequis non rempli et renvoyer vers les paramètres.

### 5. Créer le Meet dans le même événement Google

Pour une cible Google, l'adaptateur créera l'événement dans `invitationCalendarId`, ajoutera l'invité prospect et demandera une conférence avec `conferenceData.createRequest`, `conferenceSolutionKey.type = hangoutsMeet` et un `requestId` déterministe par réservation. L'identifiant externe de l'événement restera distinct du lien de la conférence.

La génération Meet pouvant être asynchrone, l'adaptateur extraira l'entrée vidéo lorsqu'elle est disponible, puis effectuera un nombre borné de lectures de l'événement. Si Google indique encore `pending`, la réservation conservera un état de synchronisation récupérable et un job Inngest reprendra la lecture sans recréer l'événement.

Alternative écartée : appeler directement une API Meet séparée et créer ensuite le Calendar event. Le calendrier cible doit rester l'organisateur de l'événement et de l'invitation ; `conferenceData` permet de rattacher la conférence à cet événement et conserve l'idempotence dans le même fournisseur.

### 6. Snapshotter le lien Meet sur la réservation

Une colonne nullable de `native_bookings` conservera le lien Meet généré. Les lectures publiques, les notifications, les rappels et l'ICS utiliseront d'abord ce snapshot, puis le `meetingUrl` d'événement uniquement comme fallback de compatibilité pour les anciennes données.

Le `meetingLabel` reste une propriété de l'événement. Le `externalEventUrl` reste le lien vers l'interface Google Calendar. Aucun de ces deux champs ne remplacera le lien Meet propre à la réservation.

### 7. Désactiver les connexions sans supprimer l'historique

La déconnexion marquera une connexion comme inactive/révoquée et retirera son rôle de cible future. La ligne restera référencée par les réservations existantes afin que l'historique conserve le compte et l'identifiant externe. Les actions de déplacement ou d'annulation sur une connexion devenue inutilisable conserveront l'état interne et afficheront une alerte de synchronisation si Google ne peut plus être appelé.

Alternative écartée : supprimer immédiatement la connexion. La clé étrangère actuelle pourrait alors perdre la référence nécessaire aux réservations existantes et rendre leur état externe illisible.

### 8. Conserver l'idempotence et retarder les communications complètes

La confirmation réutilisera l'identifiant de réservation/idempotence pour le Google event et le `requestId` Meet. Une réponse publique complète et les emails de confirmation ne seront envoyés qu'après obtention d'un lien Meet, ou avec un état explicitement récupérable qui ne prétend pas que la conférence est disponible. Les retries Inngest travailleront sur l'événement externe déjà enregistré et mettront à jour le snapshot sans créer de doublon.

### 9. Faire de l'invitation d'équipe la frontière d'accès des closers

Chaque closer reçoit une invitation pour rejoindre l'espace Minaly, crée ou utilise sa propre session, puis connecte ses comptes Google depuis `/settings/calendars`. Le serveur prend toujours l'utilisateur authentifié comme `closerUserId` pour le flux OAuth et les mutations de préférences ; aucun identifiant de closer envoyé par le navigateur ne peut changer cette cible.

Le périmètre d'affichage est distinct du périmètre public :

- un closer invité voit uniquement ses appels à venir dans l'agenda unifié, qu'ils soient natifs, iClosed ou Calendly lorsque la source possède un closer identifiable ; une source sans closer identifiable n'est pas exposée à cette vue personnelle ;
- il ne voit dans la liste des événements que ceux possédant une affectation `native_booking_event_closers` vers son utilisateur, et peut copier ou prévisualiser leurs liens publics ; cette règle concerne la surface interne, pas la confidentialité intrinsèque d'un lien public déjà partagé ;
- un owner/admin ou autre utilisateur conservant le droit account-wide garde la vue de gestion globale nécessaire à ses permissions existantes ;
- les queries, actions serveur, route handlers et policies RLS appliquent ce périmètre avant le retour des données. Les filtres client ne sont qu'une aide d'affichage.

Cette décision évite qu'un closer découvre les rendez-vous d'un collègue par un filtre, une URL profonde ou une réponse d'API, tout en permettant au propriétaire de piloter les pools et l'activité du compte.

### 10. Traduire le modèle iClosed en interface Minaly

La page de paramètres présente d'abord les comptes Google connectés sous forme de cartes répétables, avec une action unique « Ajouter un autre calendrier », puis sépare clairement le compte d'invitation et les comptes de conflits. La configuration est progressive : un closer commence par connecter un compte, choisit la cible, puis sélectionne les comptes à vérifier. Chaque compte utilise toujours son calendrier Google principal.

La recherche UX Pro Max recommande pour cette surface un SaaS à contraste élevé, des tokens sémantiques, une hiérarchie de titres séquentielle, des labels explicites, des erreurs annoncées (`role=alert` ou `aria-live`) et une navigation clavier complète. Ces règles seront adaptées aux tokens existants de Minaly, sans reprendre la palette hexadécimale de la recommandation générique. Les états loading, empty, success, error et disconnected seront tous prévus ; les actions asynchrones seront désactivées pendant leur traitement et offriront un chemin de reprise.

Sur `/ventes/rdv`, l'alerte de configuration est visible uniquement dans le périmètre de l'utilisateur, reste actionnable au clavier et renvoie directement à `/settings/calendars`. Le closer ne voit pas de sélecteur lui permettant d'explorer les rendez-vous ou liens d'un autre closer.

### 11. Écrire le wording en anglais puis le traduire en français

Chaque texte ajouté pour cette feature sera d'abord écrit en anglais avec des phrases courtes, concrètes et adaptées au contexte. Le humanizer sera utilisé pour repérer les tournures artificielles, les formulations trop promotionnelles, les répétitions et les phrases passives. Une dernière relecture vérifiera le texte à voix haute et supprimera les tirets cadratins et demi-cadratins de la version anglaise.

La version française conservera le sens, les chiffres, les contraintes et les placeholders, mais elle sera réécrite comme du français naturel. Les fichiers `locales/en` et `locales/fr` garderont exactement les mêmes clés et la même structure. Cette règle s'applique aux libellés, descriptions, erreurs, confirmations, emails, rappels et metadata de la feature. Aucun texte UI ne sera ajouté en dur dans un composant et aucune clé manquante ne sera masquée par un fallback.

## Risks / Trade-offs

- **[Migration de la contrainte unique]** Plusieurs comptes Google existants ne peuvent pas être représentés avec la contrainte actuelle → ajouter l'identifiant fournisseur stable, migrer les lignes existantes et conserver l'email comme affichage uniquement.
- **[Meet encore en attente]** Google peut créer l'événement avant de fournir l'entrée vidéo → polling borné puis retry Inngest, avec état visible et aucune URL inventée.
- **[Compte cible déconnecté avec des rendez-vous futurs]** Une déconnexion peut empêcher l'annulation ou le déplacement externe → conserver la référence et signaler l'échec sans réattribuer les rendez-vous existants.
- **[Calendrier principal non écrivable]** Le calendrier principal peut être lisible mais refuser la création → valider son accès en écriture lors de la configuration et revalider au moment de réserver.
- **[Compte utilisé pour deux usages]** Une configuration implicite pourrait créer dans le mauvais agenda → stocker séparément le compte d'invitation et les comptes de conflits, puis résoudre le calendrier principal côté serveur.
- **[Régression Outlook]** Le support existant peut être utilisé par des comptes historiques → ne pas supprimer les connexions Outlook, mais afficher clairement qu'un compte Google est requis pour la readiness native.
- **[Invitation Google et email Minaly en double]** `sendUpdates=all` et Resend peuvent notifier le prospect deux fois → documenter le comportement, tester le contenu et décider pendant l'implémentation si l'invitation Google doit rester active lorsque l'email prospect existe.
- **[OAuth réalisé par le mauvais utilisateur]** Un owner peut tenter de connecter le compte d'un closer → associer systématiquement l'autorisation à l'utilisateur authentifié et afficher le closer concerné dans les paramètres.

- **[Périmètre d'accès trop large]** Un filtrage uniquement dans l'interface pourrait laisser fuiter un rendez-vous via une URL ou une API → appliquer la portée du closer dans les loaders serveur, actions, route handlers et policies RLS, puis tester avec deux closers invités.

## Migration Plan

1. Ajouter les colonnes et tables de configuration de façon additive : identifiant fournisseur stable, état de connexion, préférences de cible/conflits et lien Meet sur les réservations. Ajouter les policies RLS et les index account/closer.
2. Backfiller l'identité fournisseur des connexions existantes lorsque le fournisseur permet de la récupérer ; placer les anciennes connexions dans un état nécessitant une reconnexion si l'identité ne peut pas être prouvée sans exposer les tokens.
3. Migrer les connexions existantes vers les comptes de conflits et utiliser le calendrier principal du compte comme cible initiale lorsque sa capacité d'écriture est confirmée ; les anciens IDs secondaires ne sont jamais repris comme choix utilisateur.
4. Livrer la page `/settings/calendars`, le callback multi-comptes et les warnings `/ventes/rdv` avant d'activer la nouvelle readiness. Les événements existants restent lisibles ; les événements actifs incomplets devront être corrigés avant une nouvelle activation.
5. Déployer la création Google Meet et le snapshot `native_bookings.meetingUrl`, puis adapter confirmation publique, emails, rappels, ICS, annulation et déplacement.
6. Tester les scénarios avec plusieurs comptes Google, changement de cible, conflits sur plusieurs comptes et leurs calendriers principaux, déconnexion, expiration OAuth, génération Meet `pending`, retry après timeout et réservation concurrente.
7. Tester le cloisonnement avec un owner et deux closers invités : agendas, liens d'événements, URL directes, actions de mutation et réponses API ; exécuter le parcours E2E avec `agent-browser` sur des comptes et un fournisseur Google simulés ou de test.

Le rollback fonctionnel consiste à désactiver l'entitlement ou à mettre en pause les événements incomplets. Les nouvelles colonnes et tables peuvent rester en place ; les réservations existantes continuent d'utiliser leurs identifiants externes et leur lien manuel legacy lorsqu'aucun snapshot Meet n'existe.

## Resolved V1 Choices

- La V1 affiche les comptes Google connectés. Le closer sélectionne exactement un compte cible pour les invitations et au moins un compte pour les conflits ; le serveur utilise le calendrier principal de chaque compte et ne propose aucun sous-calendrier. Un compte dont l'accès requis ne peut pas être vérifié reste non prêt.
- La confirmation effectue un polling borné de la conférence Meet. Si Google reste en `pending`, la réservation interne conserve un état récupérable avec le créneau protégé, mais la réponse publique, l'email et l'invitation ne la présentent pas comme finalisée tant que le lien n'est pas disponible. Un retry reprend l'événement existant et, après succès, finalise la réservation sans doublon.
- Google reste l'expéditeur de l'invitation Calendar (`sendUpdates=all`) afin que le prospect soit bien ajouté à l'événement cible. L'email Minaly est complémentaire : il contient le lien de gestion et l'ICS, tandis que Google porte l'ajout au calendrier ; les deux communications sont protégées par l'idempotence de la réservation et de la notification.
