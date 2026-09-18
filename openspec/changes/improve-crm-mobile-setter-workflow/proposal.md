## Why

Le CRM fonctionne sur mobile, mais l’audit montre qu’il n’est pas encore
exploitable toute une journée par un setter qui traite 30 à 50 leads. Les
frictions les plus dangereuses sont cumulatives : retrouver la file du jour,
faire défiler une fiche, corriger un statut implicite ou resauvegarder après une
erreur devient une perte de temps et une source d’erreurs après 50 répétitions.

Le setter commence bientôt à utiliser le produit en conditions réelles. Cette
spec transforme donc le second audit, simulé sur cinq jours d’usage téléphone,
en contrat de comportement avant toute implémentation.

## What Changes

- Transformer `/crm` en file de travail personnelle centrée sur les relances
  en retard et dues aujourd’hui, avec un passage rapide au lead suivant.
- Réduire la capture et la mise à jour d’un lead aux informations nécessaires
  au premier contact, sans faire croire qu’un message a été envoyé quand ce
  n’est pas le cas.
- Rendre les actions répétées accessibles depuis le haut de la fiche ou une
  barre d’actions mobile : note, prochaine action, statut, « a répondu »,
  qualification libre, booking et résultat.
- Garder toute la qualification dans une seule zone de texte libre pour cette
  version, sans imposer de champs structurés obligatoires.
- Supporter deux parcours de booking depuis le lead : envoyer un lien puis
  attendre la confirmation du prospect, ou réserver le rendez-vous dans le
  formulaire interne Minaly, avec des créneaux calculés pour le ou les closers
  associés, sans passer par iClosed, Calendly ou une autre intégration.
- Rendre les relances, no-shows, pertes et ventes traitables avec une raison,
  une date, une action de récupération et une traçabilité suffisantes.
- Corriger les frictions de navigation téléphone observées à 320–430 px :
  onglet actif, sections masquées, clavier, barres fixes, safe areas et
  chevauchement du bouton Falco.
- Rendre chaque mutation sûre face au double-tap, au réseau instable et au
  retour arrière : état en attente, conservation du brouillon, retry sûr et
  idempotence de bout en bout.
- Aligner les événements issus du mobile avec les KPI et leurs drill-downs,
  notamment réponse, qualification, booking, show rate, CA par setter et CA
  par source.
- Ajouter une vérification automatisée des viewports mobiles et un scénario de
  répétition de 250 boucles de setter, réparties sur cinq jours.

## Capabilities

### New Capabilities

- `crm-mobile-setter-workflow`: parcours quotidien, actions rapides,
  qualification, booking, relances, résultats, navigation mobile, fiabilité
  des mutations et critères d’usage intensif.

### Modified Capabilities

Aucune capability principale n’est encore archivée dans `openspec/specs/` pour
le CRM. Cette spec complète les changes CRM existants sans réécrire leurs
contrats de base ; les écarts de modèle devront être réconciliés au moment de
l’application.

## Impact

- Surfaces produit : `app/(app)/crm/`, navigation de section, navigation mobile
  et bouton Falco.
- Composants concernés : capture, liste, pipeline, drawer/fiche lead, actions,
  appels, validation de vente et formulaires associés.
- Domaine serveur : `lib/crm/`, requêtes, actions, événements, KPI et liaison
  avec les appels/booking canoniques.
- Données possibles : note de qualification libre, coordonnées de contact
  utiles au booking, réponse explicite et métadonnées de perte ; toute modification
  de `db/schema.ts` devra passer par une migration Drizzle avec RLS vérifiée.
- Locales : `locales/en/crm.json` et `locales/fr/crm.json`, avec contrôle des
  clés manquantes et des états d’erreur.
- QA : tests unitaires des transitions et KPI, tests d’interface mobiles et
  scénario réseau/répétition. Aucune dépendance runtime n’est requise ; une
  dépendance de test comme Playwright ne pourra être ajoutée qu’après audit de
  maintenance et `npm audit`.
