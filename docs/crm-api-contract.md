# Contrat des frontières CRM

Statut : contrat V1 implémenté et contrôlé localement le 1 septembre 2026.

Ce document décrit les frontières entre l’interface Minaly, les services
serveur, l’extension Chrome et les sources métier existantes. Il complète
`docs/crm-architecture.md` et décrit les routes effectivement livrées.

## 1. Règles communes

- Toutes les commandes sont exécutées côté serveur. Le navigateur et
  l’extension ne choisissent jamais `accountId`.
- Le compte est déduit de la session Minaly et l’accès est recalculé avant
  chaque lecture ou mutation : session, appartenance, `crmEnabled`, permission
  et relation au lead.
- Les dates échangées sur les frontières sont des chaînes ISO 8601 en UTC.
  Les bornes de période et les libellés CRM utilisent UTC en V1. Le fuseau
  configurable par compte est prévu dans un changement post-V1.
- Toute écriture issue de l’extension porte une `idempotencyKey`. Les événements
  métier portent une `sourceEventKey` lorsqu’ils peuvent être rejoués par une
  synchronisation.
- Une réponse ne renvoie que les champs nécessaires à l’écran demandeur. La
  résolution ne renvoie jamais une liste de leads ni une donnée d’un autre
  compte.

Codes métier stables :

```text
stages  = first_message_sent | conversation_in_progress | value_content_sent
          | call_proposed | call_booked
outcomes = none | no_show | lost | sold
platforms = instagram | linkedin
```

Les libellés visibles sont toujours traduits à la surface qui les affiche ; les
codes de stockage ne sont pas des textes de présentation.

## 2. Enveloppes de réponse

Une réponse réussie expose une donnée typée sous `data`. Pour compatibilité avec
des clients simples, certaines routes répètent aussi les identifiants utiles au
niveau racine :

```json
{
  "data": { "leadId": "lead-id", "created": true }
}
```

Les routes extension renvoient une erreur courte et stable sous `error` :

```json
{
  "error": "unauthorized"
}
```

Les codes exposés sont `unauthorized`, `rate_limited`, `invalid_request`,
`invalid_profile`, `invalid_update`, `ambiguous_match`, `candidate_required`,
`lead_not_found`, `idempotency_conflict`, `profile_conflict` et
`payload_too_large`. Ils ne contiennent ni secret, ni token, ni information sur
un autre compte.

## 3. Frontière de l’extension Chrome

Les routes ci-dessous sont destinées au service worker. Le content script ne
les appelle pas directement.

### 3.1 Émettre une session courte

`POST /api/crm/extension/session`

Authentification : cookie Minaly actif, CRM accessible, membre autorisé. Le
service worker conserve ensuite la session courte signée côté extension.

Requête : aucun `accountId`, aucun token fourni par le client.

Réponse :

```json
{
  "data": {
    "extensionToken": "short-lived-opaque-token",
    "expiresAt": "2026-09-01T10:00:00.000Z"
  }
}
```

Le token est limité aux routes CRM extension, expire rapidement et peut être
révoqué sans invalider la session Minaly. Il n’est pas écrit dans les logs.

### 3.2 Résoudre un profil visible

`POST /api/crm/extension/resolve`

Authentification : token court du service worker, ou cookie Minaly lors d’un
parcours de récupération explicite.

Requête minimale côté service worker :

```json
{
  "platform": "instagram",
  "profileUrl": "https://www.instagram.com/marc.lefebvre/",
  "handle": "marc.lefebvre",
  "displayName": "Marc Lefebvre",
  "capturedAt": "2026-09-01T09:42:00.000Z",
  "sourceEventKey": "extension:instagram:https://instagram.com/marc.lefebvre:profile"
}
```

Le serveur re-normalise l’URL et le pseudo. Une URL exacte dans le compte
courant est prioritaire. Le pseudo peut produire une correspondance ambiguë ;
le nom seul ne produit jamais une correspondance automatique.

Réponse `unknown` :

```json
{
  "data": {
    "state": "unknown",
    "profile": {
      "platform": "instagram",
      "canonicalProfileUrl": "https://www.instagram.com/marc.lefebvre/",
      "displayName": "Marc Lefebvre",
      "normalizedHandle": "marc.lefebvre"
    }
  }
}
```

Réponse `known` :

```json
{
  "data": {
    "state": "known",
    "lead": {
      "id": "lead-id",
      "displayName": "Marc Lefebvre",
      "stage": "call_booked",
      "outcome": "none",
      "responsibleSetterName": "Nadia D.",
      "nextAction": { "title": "Préparer l'appel", "dueAt": "2026-09-02T12:00:00.000Z" }
    }
  }
}
```

Réponse `ambiguous` :

```json
{
  "data": {
    "state": "ambiguous",
    "profile": { "platform": "instagram", "displayName": "Karim Saïdi" },
    "candidates": [{
      "id": "lead-id",
      "displayName": "Karim Saïdi",
      "normalizedHandle": "karim.saidi2",
      "stage": "conversation_in_progress",
      "outcome": "none"
    }]
  }
}
```

La réponse `unavailable` est utilisée pour CRM désactivé, session non
renouvelable ou capture insuffisante. Elle ne révèle pas si un lead existe.

### 3.3 Confirmer une capture

`POST /api/crm/extension/capture`

Requête :

```json
{
  "decision": "create_new",
  "idempotencyKey": "capture-event-key",
  "profile": {
    "platform": "instagram",
    "profileUrl": "https://www.instagram.com/nora.t_biz/",
    "handle": "nora.t_biz",
    "displayName": "Nora T.",
    "firstName": "Nora",
    "lastName": null,
    "messageOccurredAt": "2026-09-01T09:38:00.000Z",
    "capturedAt": "2026-09-01T09:42:00.000Z",
    "sourceEventKey": "extension:instagram:https://instagram.com/nora.t_biz:profile"
  },
  "qualification": {
    "offerId": "offer-id",
    "source": "instagram",
    "stage": "first_message_sent"
  }
}
```

Pour `decision = confirm_match`, `candidateLeadId` est obligatoire. Le serveur
vérifie que le candidat appartient au même compte et à la résolution courante.
Le responsable est déterminé côté serveur et n’est jamais fourni par
l’extension.

La commande est transactionnelle : lead, événement, historique et éventuelle
première action sont validés ensemble. Un retry avec la même clé et le même
contenu retourne le même résultat ; la même clé avec un contenu différent
retourne `idempotency_conflict`.

### 3.4 Mettre à jour un lead connu

`POST /api/crm/extension/update`

Requête :

```json
{
  "leadId": "lead-id",
  "idempotencyKey": "update-event-key",
  "stage": "value_content_sent",
  "note": "Relancer après l'envoi du contenu."
}
```

Chaque champ est facultatif, mais au moins une mutation doit être présente.
L’extension peut modifier l’étape, ajouter une note ou créer une action selon
les commandes exposées par l’interface. Elle ne peut pas modifier le
responsable, réassigner un lead, valider une vente, envoyer un message social
ou programmer une relance sur une plateforme sociale.

## 4. Frontière des surfaces applicatives

Les pages CRM utilisent des lectures serveur tenant-scoped et des Server
Actions protégées. Les contrats fonctionnels sont les suivants :

| Surface | Lecture | Mutations autorisées |
|---|---|---|
| Aujourd’hui | KPI de période, actions selon `mine` ou `team` | ouvrir une fiche, réaliser ou annuler une action selon permission |
| Pipeline | cinq colonnes et attributs de résultat | changer l’étape ; modifier la structure uniquement avec `crm:manage-pipeline` |
| Leads | recherche et filtres plateforme, étape, responsable, offre, source, dates, résultat, retard | ouvrir, modifier les champs simples, changer étape ou résultat |
| Actions | toutes les actions, catégories, relances, statut et échéance | créer, terminer, annuler, réouvrir selon le statut et la permission |
| Appels | `salesCalls` canoniques et associations fiables | relier un appel à un lead avec `crm:assign` ; jamais copier l’appel |
| Fiche lead | identité, qualification, historique, notes, appels et actions | note, action, étape, résultat, réouverture avec étape confirmée, réassignation, validation de vente selon la matrice |

La vue équipe est une lecture séparée protégée par `crm:view-team`. Elle ne
change pas la visibilité générale des leads autorisés.

## 5. Vente validée depuis la fiche lead

La validation d’une vente est une commande applicative, jamais une commande de
l’extension. Elle reçoit au minimum :

```json
{
  "leadId": "lead-id",
  "offerId": "offer-id",
  "totalPrice": 2500,
  "saleDate": "2026-09-01",
  "setterId": "member-id",
  "closerId": "member-id",
  "idempotencyKey": "sale-validation-key"
}
```

Le serveur exige `crm:validate-sale` et vérifie que l’acteur est l’owner, un
manager ou le closer assigné au lead. Il crée ou rattache l’enregistrement de
vente canonique dans une transaction idempotente, puis enregistre le résultat
CRM `sold` et l’événement associé. Une seconde validation ne crée ni vente ni
commission supplémentaire.

## 6. Erreurs et codes de contrôle

| Code | HTTP | Usage |
|---|---:|---|
| `unauthorized` | 401 | session absente, expirée ou session d’extension invalide |
| `crm_unavailable` | 403 | CRM désactivé ou contexte non disponible lors de l’émission de session |
| `rate_limited` | 429 | limite de fréquence dépassée |
| `invalid_request` | 400 | corps JSON invalide |
| `invalid_profile` | 400 | profil absent, incomplet ou non supporté |
| `invalid_update` | 400 | commande de mise à jour invalide |
| `candidate_required` | 422 | candidat obligatoire pour confirmer une correspondance |
| `lead_not_found` | 404 | lead ou candidat inaccessible dans le compte courant |
| `ambiguous_match` | 409 | une décision explicite est nécessaire |
| `idempotency_conflict` | 409 | même clé réutilisée avec un contenu différent |
| `profile_conflict` | 409 | identité sociale déjà rattachée ou conflit de correspondance |
| `capture_failed` | 500 | échec inattendu lors de la capture |
| `payload_too_large` | 413 | corps supérieur à 16 KiB |
| `extension_not_configured` | 503 | secret de session d’extension absent ou invalide |

Les erreurs `403` et `404` sont volontairement non discriminantes lorsqu’une
réponse plus précise révélerait l’existence d’une donnée hors compte.

## 7. Limites, reprise et observabilité

Valeurs de lancement actuellement appliquées par les routes et la session :

- payload extension maximal : 16 KiB ;
- résolution : 60 requêtes par membre et par minute ;
- écritures extension : 30 requêtes par membre et par minute ;
- corps JSON maximal : 16 KiB ;
- les clés d’idempotence sont vérifiées par les contraintes uniques des
  événements, actions et ventes ;
- le content script conserve un état de chargement pendant la requête et ne
  l’abandonne pas à cause d’un délai d’affichage.

Ces valeurs sont des garde-fous, pas des règles métier. Toute reprise doit
réutiliser la clé d’idempotence. Les logs peuvent contenir le code d’erreur,
le compte anonymisé, le type de commande et la durée ; ils ne contiennent pas
de token, d’URL sociale complète, de contenu de message ou de clé API.

## 8. Versionnement

Le contrat V1 est versionné implicitement par les routes `/api/crm/extension/*`.
Une rupture de forme créera un nouveau préfixe ou une nouvelle version de
payload. L’extension doit ignorer un champ inconnu mais refuser une réponse
sans `state`, `lead.id` requis ou code d’erreur validé.
