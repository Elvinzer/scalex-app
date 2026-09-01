# Checklist de readiness — CRM Minaly

Statut : implémentation V1 livrée et contrôlée localement le 1 septembre 2026.

Objectif : conserver une liste vérifiable des surfaces, contrats, permissions,
données et états livrés. Les cases de réalisation et les preuves restent dans
`openspec/changes/add-crm-lead-capture/tasks.md`.

## 1. Documents de référence

À lire dans cet ordre :

1. `docs/crm-architecture.md` : décisions, frontières, migration et rollback ;
2. `docs/crm-api-contract.md` : payloads, réponses, erreurs et idempotence ;
3. `docs/data-sync-contract.md` : sources canoniques et projections ;
4. `openspec/changes/add-crm-lead-capture/proposal.md` : intention et périmètre ;
5. `openspec/changes/add-crm-lead-capture/design.md` : décisions d’intégration ;
6. les cinq specs du changement : exigences et scénarios normatifs ;
7. `Downloads/design_handoff_crm_module/README.md` et les 20 écrans : référence
   visuelle et wording du handoff.

En cas de contradiction, l’ordre de priorité est : instruction du owner,
repository et sécurité, specs OpenSpec, architecture, contrat API, puis
référence visuelle.

## 2. Périmètre fonctionnel accepté

| Surface | Route cible | Critère d’acceptation principal |
|---|---|---|
| Aujourd’hui | `/crm` | sept KPI visibles, actions groupées Prospection/Vente/Rendez-vous, `Mes actions` par défaut, `Vue équipe` protégée |
| Pipeline | `/crm/pipeline` | cinq étapes exactes, drag-and-drop desktop, sélection d’étape mobile, résultats hors colonnes |
| Leads | `/crm/leads` | recherche, filtres réels et liste company-wide lorsque l’accès CRM est autorisé |
| Actions | `/crm/actions` | toutes les actions et relances, filtres catégorie/relance/retard/statut |
| Appels | `/crm/appels` | projection de `salesCalls`, association explicite et absence de second système d’appels |
| Fiche lead | `/crm/leads/:leadId` | identité, qualification, historique, notes, actions, résultats et vente validée protégée |
| Activation | Paramètres / onboarding | owner-only, état désactivé sans suppression des données, accès membre sans CTA d’activation |
| Extension fermée | page sociale pertinente | bouton flottant uniquement sur Instagram/LinkedIn supporté |
| Extension inconnue | carte après clic | identité visible, URL, prénom/nom facultatifs, offre/source, responsable en lecture seule, dates distinctes |
| Extension connue | carte après résolution | statut, responsable en lecture seule, prochaine action, note/action, aucune messagerie |
| Extension ambiguë | carte après résolution | candidat limité au compte courant, confirmation ou nouveau lead explicite |
| États système | surfaces CRM | vide, chargement, erreur, succès, capture partielle, CRM désactivé et session expirée |

Les anciennes URLs `/ventes/pipeline` et `/ventes/appels` restent fonctionnelles
et aboutissent aux mêmes services CRM sans créer de projection concurrente.

## 3. Contrats métier non négociables

- Les étapes sont exactement `first_message_sent`,
  `conversation_in_progress`, `value_content_sent`, `call_proposed` et
  `call_booked`.
- Les résultats sont séparés : `none`, `no_show`, `lost`, `sold`.
- Un no-show ne passe pas automatiquement en perdu ; il peut créer une action
  de suivi idempotente.
- Rouvrir retire le résultat perdu ou no-show, présélectionne la dernière étape
  connue et permet d’en confirmer une autre.
- Réassigner ne remet pas le lead à zéro et ne réécrit aucun historique.
- La vente validée est possible pour le closer assigné, le manager ou l’owner,
  jamais pour le setter seul ni depuis l’extension.
- Une capture répétée, un retry réseau ou une réouverture ne crée pas une
  conversion KPI supplémentaire.
- Le nom seul n’est jamais une clé de rapprochement.

## 4. Matrice d’autorisation à vérifier

| Capacité | Setter | Closer | Manager | Owner | Extension |
|---|---:|---:|---:|---:|---:|
| Voir les leads autorisés de l’entreprise | ✓ | ✓ | ✓ | ✓ | Profil détecté uniquement |
| Modifier statut, champs simples, note et action | ✓ | ✓ | ✓ | ✓ | ✓, selon carte |
| Voir la vue équipe | — | — | ✓ | ✓ | — |
| Réassigner le responsable | — | — | ✓ | ✓ | — |
| Modifier la structure du pipeline | — | — | ✓ | ✓ | — |
| Marquer no-show, perdu ou rouvrir | ✓ | ✓ | ✓ | ✓ | — |
| Valider une vente | Closer assigné uniquement | Si assigné | ✓ | ✓ | — |
| Activer ou désactiver le CRM | — | — | — | ✓ | — |

Chaque ligne doit être testée côté serveur, y compris lorsque le contrôle est
masqué dans l’interface. Le `crmEnabled` du compte est indépendant des droits
de membre.

## 5. États et reprise utilisateur

| État | Entrée | Affichage attendu | Écriture autorisée |
|---|---|---|---|
| Vide | aucune donnée dans le scope | explication courte + CTA contextuel | uniquement l’action proposée |
| Chargement | requête en cours | skeleton stable, pas de valeur inventée | non |
| Erreur | source ou réseau indisponible | cause utile + Réessayer | non, sauf retry |
| Succès | mutation confirmée | confirmation localisée + données rafraîchies | oui, selon permission |
| Désactivé | `crmEnabled = false` | owner : Activer ; membre : demander à un owner | aucune mutation CRM |
| Ambigu | plusieurs signaux possibles | candidat et choix explicite | uniquement après choix |
| Capture partielle | DOM incomplet | champs manquants signalés, pas de création silencieuse | seulement après confirmation complète |
| Session expirée | token extension invalide | réauthentification explicite | après nouveau token |

Les actions répétées restent en outline selon la DA. Un seul CTA corail
prioritaire est affiché par écran ; le violet reste réservé aux usages IA,
Copilote ou analytics.

## 6. Cohérence des données à démontrer

- Un lead visible dans Pipeline est retrouvable dans Leads et dans sa fiche.
- Une action affichée dans Aujourd’hui existe dans Actions avec le même titre,
  responsable, échéance et statut.
- Un appel affiché dans Appels vient de `salesCalls`; son statut et son résultat
  ne sont pas recopiés dans un objet CRM concurrent.
- Une vente validée depuis la fiche est visible dans la source ventes canonique,
  reliée au lead et comptée une seule fois dans le KPI.
- Une note ou un changement d’étape montre son acteur, sa source et sa date dans
  l’historique.
- La réassignation change les projections ouvertes attendues mais laisse les
  événements passés et les ventes inchangés.
- Les KPI affichent leur période, leur cohorte, le fuseau UTC de la V1 et leur
  état de complétude.
- Une requête avec un identifiant d’un autre compte retourne une réponse
  non-discriminante et ne modifie aucune donnée.

## 7. Migration et rollback

Le plan a produit, dans cet ordre :

1. backfill additif de l’account et des états CRM ;
2. rapport des statuts legacy et des identités sociales non déduites ;
3. conversion idempotente des relances et notes ;
4. conservation explicite des appels historiques non reliés ;
5. migrations 0050 à 0054 générées, inspectées et appliquées ;
6. contrôle runtime sur les routes CRM et compatibilité des anciennes URLs ;
7. activation progressive par `crmEnabled`.

Le détail et les requêtes de contrôle sont dans
`docs/crm-migration-report.md`.

Rollback accepté : désactiver le module, conserver les données et événements,
laisser les anciennes URLs fonctionner, puis corriger par migration additive.
La suppression d’un champ legacy ou d’un alias est hors V1.

## 8. Porte de passage post-développement

La validation de réalisation porte maintenant sur :

- le périmètre des routes et de l’extension ;
- les codes d’état, résultats et règles de vente ;
- la matrice de permissions ;
- la cohorte KPI et le fuseau UTC de la V1 ;
- le contrat API et le contrat de synchronisation ;
- le plan de migration et le rollback ;
- la politique de conservation applicable à la mise en production ;
- les contrôles automatisés et le build Vercel.

La politique de conservation chiffrée et le raccordement manuel des appels
historiques restent des sujets de mise en production, sans bloquer le modèle
V1 livré. Les champs legacy et les alias sont conservés pour le rollback.
