## Context

Le shell authentifié est rendu par `app/(app)/layout.tsx` et monte déjà un composant global client. `components/floating-chat-bubble.tsx` utilise `usePathname()`, tandis que `lib/agent/page-context.ts` fournit des identifiants et libellés de page métier réutilisables. `html-to-image` est déjà une dépendance utilisée par plusieurs surfaces de partage.

La console interne actuelle est sous `app/admin/`, protégée par `app/admin/layout.tsx` et `lib/admin.ts` via l'allowlist `ADMIN_EMAILS`. Les rôles de `lib/team/` sont les rôles délégables des comptes clients et ne doivent pas être réutilisés pour les employés Minaly. Le projet utilise Drizzle avec des migrations, Supabase Storage, un rate limiter local et des clients serveur pour les appels externes.

## Goals / Non-Goals

**Goals:**

- Fournir une expérience de remontée contextualisée et utilisable depuis chaque page produit.
- Conserver les tickets, les permissions, l'historique et les pièces jointes dans Minaly sans nouveau SaaS payant.
- Donner aux fondateurs une file opérationnelle et préparer un accès limité pour les agents support.
- Rendre Discord fiable comme alerte, sans en faire la source de vérité.
- Séparer strictement messages publics, notes internes et données sensibles.

**Non-Goals:**

- Construire un helpdesk omnicanal avec email, téléphone, SLA commercial ou base de connaissances.
- Ajouter l'impersonation client, l'accès aux secrets ou une modification de données métier depuis la console support.
- Synchroniser les tickets avec GitHub, Jira, Intercom ou un autre outil externe.
- Envoyer automatiquement des emails de support ; la visibilité utilisateur initiale se fait dans Minaly.

## Decisions

### 1. Deux surfaces, un même domaine fonctionnel

Le parcours utilisateur vivra sous `/support` et sera ouvert depuis un point d'entrée global du shell authentifié. La console interne vivra sous `/admin/support`, avec une navigation Admin commune. Le support ne sera pas ajouté à la sidebar métier principale : cela évite de mélanger une fonction interne avec les fonctionnalités de l'infopreneur.

Alternative écartée : placer les tickets dans `/settings`. Les réglages concernent le compte courant ; la file support est une opération transverse sur tous les comptes.

### 2. Autorisation interne séparée des rôles clients

Ajouter un contexte d'accès interne distinct, avec une table `staff_members` liée à `users`, un statut d'activation et un rôle interne. La permission applicative `support:tickets` sera définie dans un module dédié, par exemple `lib/staff/permissions.ts`, et vérifiée par un helper serveur de type `requireStaffPermission`.

Les fondateurs identifiés par `ADMIN_EMAILS` conserveront le bypass historique. Les pages Admin existantes resteront protégées par leur contrôle fondateur tant qu'elles n'ont pas reçu une permission spécifique. Le layout Admin autorisera un membre interne, puis chaque page et action vérifiera sa capacité propre ; un agent support ne pourra donc pas hériter par accident des droits de facturation.

Alternative écartée : ajouter `support:tickets` à `lib/team/permissions.ts`. Ce module représente les délégations d'un client à son équipe et donnerait une sémantique incorrecte à un droit Minaly interne.

### 3. Modèle de données account-scoped avec auteur distinct

Créer au minimum :

- `support_tickets` : référence lisible, `accountId`, demandeur, type, titre, contenu structuré, contexte, statut, priorité, assignation, dates et état Discord ;
- `support_ticket_messages` : messages publics ou notes internes, auteur et date ;
- `support_ticket_events` : audit des transitions, assignations, priorités, doublons et livraisons ;
- `support_ticket_attachments` : chemin privé, type, taille, source, date d'expiration et ticket associé.

Le compte est dérivé côté serveur via le contexte d'équipe existant, tandis que `submittedByUserId` identifie la personne réelle. Le demandeur et le propriétaire du compte peuvent lire la partie publique ; les agents internes peuvent lire les tickets autorisés ; les notes internes ne sont jamais exposées par les requêtes utilisateur.

Toutes les nouvelles tables seront RLS-enabled. Les actions serveur resteront la frontière de confiance pour les opérations internes et les mutations.

### 4. Capture DOM locale, stockage privé borné

La capture sera générée côté navigateur à partir de la page produit visible avant l'ouverture effective du formulaire. Le périmètre exclura le modal lui-même, le bouton flottant et tout élément marqué comme sensible. Les champs sensibles pourront être masqués via un attribut dédié de capture.

La capture sera convertie dans un format compact, limitée en taille et envoyée à un bucket privé Supabase Storage avec un chemin aléatoire non contrôlé par l'utilisateur. La fiche Admin générera un accès temporaire. Une rétention bornée, par exemple 90 jours, évitera que les captures consomment indéfiniment le quota gratuit.

Alternative écartée : stocker les images en base64 dans PostgreSQL. Cela gonflerait la base, dégraderait les listes et compliquerait la rétention.

### 5. Création transactionnelle puis notification Discord synchrone récupérable

La route authentifiée validera le formulaire et créera le ticket avant d'appeler Discord. L'appel externe sera server-only, borné par timeout et protégé par `allowed_mentions` vide. En cas d'échec, la création restera réussie et l'état de livraison sera visible dans Admin avec une action de retry.

La clé d'idempotence fournie par le formulaire sera unique pour le demandeur afin de rendre les doubles soumissions re-jouables. Le message Discord contiendra la référence et un lien Admin, mais pas de secret ni de chemin Storage direct. Les réponses publiques pourront déclencher une alerte liée au ticket ; les notes internes resteront internes.

Alternative écartée pour la V1 : introduire un nouveau service de queue ou de helpdesk. Le volume attendu peut être traité par la requête serveur et le retry manuel, sans dépense ni nouvelle dépendance.

### 6. États internes et libellés publics distincts

Les statuts stockés resteront précis pour la file support (`new`, `triage`, `in_progress`, `waiting_on_user`, `resolved`, `closed`, `duplicate`, `declined`). L'interface utilisateur traduira ces états en libellés simples. Une réponse publique du demandeur sur un ticket en attente ou résolu le remettra en triage ; toute transition sera auditée.

### 7. Discord comme alerte compacte et non comme base de ticket

Le channel Discord recevra un embed complet à la création, avec la référence, l'identité, le compte, la page, le contenu et le lien Admin. Les réponses publiques recevront une alerte courte. Les notes internes ne seront jamais recopiées. Le ticket Admin restera l'endroit où l'équipe travaille, ce qui permet de rechercher, filtrer, assigner et restaurer l'historique même si un message Discord est supprimé.

## Risks / Trade-offs

- **[Capture contenant une donnée sensible]** → prévisualisation obligatoire, marquage des zones à exclure, message d'avertissement, stockage privé et rétention limitée.
- **[Discord indisponible ou rate-limited]** → ticket créé avant notification, état de livraison explicite, timeout, retry manuel et aucune fuite d'erreur technique côté utilisateur.
- **[Support agent trop privilégié]** → permission interne dédiée, contrôle par page/action, absence d'accès aux modules financiers et tests d'autorisation directe.
- **[Quota Supabase dépassé]** → limite de taille, une capture par ticket en V1, expiration automatique et seuil d'alerte Admin ; le ticket reste soumettable sans capture.
- **[Double création lors d'un double clic]** → clé d'idempotence persistée et contrainte unique par demandeur.
- **[Historique incohérent]** → événements append-only pour les changements de statut, priorité, assignation et notification.
- **[UI Admin trop dense sur mobile]** → table desktop et cartes mobiles, filtres conservés dans l'URL et détail accessible séparément.

## Migration Plan

1. Ajouter les tables, index, RLS et le bucket privé via une migration Drizzle additive ; ne jamais utiliser `db push`.
2. Introduire le contexte d'accès staff et conserver le comportement fondateur existant pour les pages Admin actuelles.
3. Déployer la création de tickets et la consultation utilisateur sans activer la notification tant que le webhook server-only n'est pas configuré.
4. Configurer le nouveau webhook Discord régénéré, vérifier le channel cible et activer la notification avec `allowed_mentions` désactivé.
5. Déployer la console Admin, les transitions, les commentaires, les notes internes et le retry Discord.
6. Vérifier le parcours utilisateur, le parcours support, les permissions, les captures, les erreurs Discord, les quotas et les traductions FR/EN.

Le rollback fonctionnel consiste à masquer l'entrée utilisateur et la navigation support tout en conservant les tickets déjà créés. Les tables et pièces jointes peuvent rester en place ; aucune donnée client existante ne doit être supprimée.

