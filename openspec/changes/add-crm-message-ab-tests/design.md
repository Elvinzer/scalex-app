## Context

Voir `proposal.md` pour la motivation et les deux capacités décrites dans `specs/`. Le CRM dispose déjà d’une capture de profils par l’extension, de routes de résolution/capture, d’un historique d’événements de lead et de calculs KPI CRM. Les données CRM sont limitées au compte et protégées par les migrations Drizzle et RLS.

Le handoff fourni comprend des écrans haute fidélité pour la liste desktop/mobile, la création, les résultats, les dialogues de cycle de vie et les états du panneau Chrome. Il sert de référence visuelle ; les décisions fonctionnelles de ce change sont décrites dans les specs.

## Goals / Non-Goals

**Goals:**

- Relier chaque lead nouvellement créé pendant un test à une variante stable et au contenu exact qui lui a été attribué.
- Compter une variante quand son message est copié et mesurer les réponses avec des résultats recalculables et tenant-scoped.
- Déployer une gestion des tests dans le CRM qui respecte les états, les volumes et les fenêtres d’observation prévus.
- Éliminer la capture d’un libellé d’action tel que « Voir Profil » en tant que nom de lead, avec un handle modifiable comme valeur de secours.

**Non-Goals:**

- Envoyer ou programmer un message depuis l’extension. L’utilisateur continue d’envoyer le message manuellement dans le réseau social ; le CRM ne prétend pas savoir s’il l’a envoyé.
- Modifier rétroactivement des leads existants ou leur attribuer une variante lors de la création d’un test.
- Déclarer une variante gagnante, calculer une significativité statistique ou recommander automatiquement un message.
- Créer, stocker ou lire des variantes audio dans cette version.

## Decisions

### Modèle dédié aux tests et attributions figées

Créer une table de tests CRM contenant le compte, le canal, le nom, l’état, les textes A/B et les dates de cycle de vie. Créer une table d’attributions reliée au test et au lead, avec la variante, un instantané du texte, la date d’attribution et les métadonnées de confirmation. Une attribution par lead est unique à l’échelle du compte : un lead ne peut pas entrer dans un test ultérieur.

Les modèles sont figés dès l’activation. Les modifier en cours de test invaliderait la comparaison et rendrait l’instantané ambigu ; un nouveau texte nécessite un nouveau test. Au moment de l’attribution, les jetons `{first_name}`, `{prenom}` et `{prénom}` sont remplacés par le prénom normalisé du lead. L’attribution conserve le message personnalisé exact qui sera affiché et copié dans l’extension.

**Alternatives considérées :** stocker les variantes uniquement dans les événements CRM ou ajouter une simple propriété de variante au lead. Les événements ne portent pas naturellement tout le cycle de vie d’un test, et une propriété de lead seule perdrait le lien au test et le texte exact utilisé.

### Attribution côté serveur dans le flux de capture

L’extension n’effectue aucun tirage. La création du lead et son attribution au test actif se font dans le flux de capture serveur et dans une transaction cohérente. Une attribution aléatoire A/B à probabilité égale est utilisée ; les comptes réellement affectés restent visibles dans les résultats. Une contrainte unique et l’idempotence de capture empêchent une nouvelle attribution en cas de double clic, de retry réseau ou de profil capturé deux fois.

Une contrainte d’unicité partielle limite à un test actif par compte et par canal. Elle évite que le serveur doive choisir entre plusieurs tests Instagram ou LinkedIn simultanés. La pause et la fin libèrent le canal pour un autre test, sans changer les attributions antérieures.

**Alternatives considérées :** répartir depuis l’extension, ce qui permettrait des divergences de règles entre versions clientes ; permettre plusieurs tests actifs par canal, ce qui rendrait l’attribution et les KPI ambigus.

### La copie comptabilise la variante sans simuler un envoi

Après une copie réussie, l’extension enregistre une seule fois `copied_at` et l’utilisateur dans l’attribution. L’opération ne modifie pas l’état de contact, `message_occurred_at`, l’étape du lead ni les événements `first_message_sent`. Elle ne fait aucun appel d’envoi au réseau social. Une transaction et une garde d’idempotence empêchent les doubles clics et retries de compter deux fois la même attribution. L’ancienne route de confirmation d’envoi reste disponible pour les versions antérieures de l’extension ; ses envois déjà enregistrés continuent de compter.

Les KPI utilisent l’heure serveur de la copie comme début d’une fenêtre de 168 heures, borne finale incluse. Pour les anciennes attributions confirmées par l’extension, `sent_at` sert de date de comptabilisation si `copied_at` est absent. Le dénominateur compte les leads uniques dont la fenêtre est terminée ; le numérateur compte ceux qui ont un événement de réponse dans cette fenêtre. Les attributions ni copiées ni confirmées par une ancienne version ne sont pas incluses. Les rendez-vous sont calculés séparément sur les leads attribués ayant un rendez-vous lié dans la fenêtre, sans les ajouter aux réponses.

**Alternatives considérées :** exiger une confirmation manuelle après l’envoi réel, ce qui ajoute une étape et laisse les copies oubliées hors des résultats ; marquer la copie comme un événement `first_message_sent`, ce qui fausserait le pipeline CRM ; enregistrer des agrégats incrémentaux, qui seraient plus difficiles à réparer en cas de retry ou d’événement tardif.

### Sémantique de pause et de fin

La pause arrête immédiatement les nouvelles attributions, mais laisse les leads déjà affectés copier leur variante. La fin arrête les attributions et interdit les copies qui n’avaient pas encore été comptabilisées. Leur variante reste consultable comme historique, mais ils ne contribuent pas aux résultats du test terminé. Les copies comptabilisées avant la fin continuent leur fenêtre de sept jours ; les résultats ne sont définitifs qu’après la fermeture de toutes ces fenêtres.

La reprise est immédiate si le canal est libre. La fin et la pause passent par une confirmation explicite. Le statut « Terminé » peut donc afficher une collecte en cours jusqu’à la maturation des dernières copies comptabilisées.

**Alternatives considérées :** figer toutes les réponses à l’instant de la fin, ce qui censurerait les fenêtres encore en cours ; continuer à confirmer indéfiniment des messages après la fin, ce qui empêcherait de stabiliser la cohorte du test.

### KPI descriptifs avec seuil de volume explicite

Afficher séparément pour A et B les leads attribués, les messages comptabilisés, les fenêtres terminées, les réponses, les leads encore en observation et les rendez-vous. Tant qu’une variante compte moins de 50 fenêtres terminées, afficher un avertissement de volume insuffisant. Ce seuil est un repère produit, pas une preuve de significativité : même après ce seuil, aucun gagnant n’est calculé ni annoncé.

**Alternatives considérées :** seuil total de 100 fenêtres terminées, qui peut cacher un volume très déséquilibré entre variantes ; déclaration automatique de gagnant, qui ferait croire à une certitude statistique que le produit ne calcule pas.

### Permissions CRM explicites

La consultation de la liste et des résultats suit `crm:view`. Ajouter une permission `crm:manage-message-tests` pour créer, mettre en pause, reprendre et terminer. L’owner et le manager reçoivent cette permission selon les conventions des permissions CRM existantes. Les routes serveur et les politiques RLS vérifient le compte courant ; l’interface seule ne constitue pas un contrôle d’accès.

**Alternative considérée :** laisser tout utilisateur CRM gérer les tests, ce qui ne permettrait pas de limiter la modification des expériences aux personnes responsables.

### Capture d’identité sociale validée

Examiner le chemin d’extraction actuel et les variantes de DOM Instagram/LinkedIn qui conduisent au candidat « Voir Profil ». La correction doit lire le nom dans la zone d’identité visible, rejeter les libellés d’action/navigation connus et ne pas traiter un candidat non fiable comme validé. Si aucun nom fiable n’est visible, le handle extrait de l’URL ou de l’identité sociale est prérempli dans un champ éditable et doit être confirmé avant la création. Ajouter des cas de régression pour les deux plateformes et pour l’absence de nom.

**Diagnostic du code actuel :** l’extension filtre déjà plusieurs libellés génériques dans les titres de profil et dans le lien du contact actif d’une conversation. Deux chemins laissent toutefois persister le défaut : le serveur accepte sans filtre `profile.displayName`, donc une ancienne version ou une requête modifiée peut encore enregistrer « Voir Profil » ; et le formulaire de nouveau lead peut corriger prénom/nom sans remplacer `displayName`, qui reste la valeur initialement extraite. Les sélecteurs couverts sont la zone d’identité du profil Instagram (`main header h1/h2`), la carte de profil LinkedIn (titre de la top card puis `main h1`) et le lien d’identité au-dessus du compositeur dans une conversation Instagram Direct ou LinkedIn Messaging. Les régressions doivent exercer les variantes profil et conversation, avec un bouton générique voisin ou un nom absent.

**Écart A/B corrigé pendant la vérification :** la détection historique d’une date de message inspectait `[data-timestamp]` sur toutes les pages, y compris les publications d’un profil, et la capture serveur ignorait toute date détectée pour les nouveaux leads venant de l’extension. La lecture est maintenant limitée aux routes de conversation et la présence d’un message existant empêche l’attribution d’un test, tout en conservant le lead comme déjà contacté.

**Alternatives considérées :** remplacer uniquement la chaîne littérale « Voir Profil », ce qui manquerait d’autres libellés génériques et des variations de pages ; accepter automatiquement le premier texte DOM détecté, ce qui conserve la cause du défaut.

### Surfaces CRM et extension

Ajouter `/crm/tests` à la navigation CRM et fournir les vues liste, création et détail. La liste utilise un tableau sur bureau et des cartes en mobile ; le détail sépare le KPI de réponse des rendez-vous. Le panneau d’extension suit les états du handoff : identité à confirmer, variante affectée, aperçu/copie, copie comptabilisée, déjà contacté, test en pause, aucun test actif et erreur réseau avec retry. Un changement de profil ou de conversation dans la navigation SPA doit actualiser le profil CRM sans rechargement de page. Le contenu, les statuts et les taux ne reposent jamais sur la couleur seule.

Toute nouvelle chaîne visible est ajoutée aux catalogues FR et EN synchronisés. Les interactions existantes d’extension restent utilisables avec une ancienne version du client pendant le déploiement ; l’API détermine l’attribution et ne fait pas confiance à une variante fournie par l’extension.

## Risks / Trade-offs

- [Une erreur réseau survient après la copie] → Ne pas annoncer que le test a été mis à jour ; permettre de réessayer l’enregistrement de la copie, qui est idempotent.
- [Un événement de réponse peut être enregistré tardivement] → Recalculer les KPI depuis les événements horodatés et n’inclure que ceux compris dans les 168 heures ; ne pas figer les agrégats à chaque requête.
- [Les sélecteurs de profil peuvent casser lors d’un changement de DOM Instagram ou LinkedIn] → Limiter les sélecteurs à la zone d’identité, conserver le handle éditable et exécuter les régressions sur des extraits DOM représentatifs.
- [Deux créations de test concurrentes pourraient occuper le même canal] → Faire respecter l’unicité côté base en plus de la validation applicative et traiter le conflit comme une erreur métier lisible.
- [Le seuil de 50 fenêtres par variante peut être interprété comme un seuil scientifique] → Le libellé précise qu’il s’agit d’un volume encore faible ou suffisant pour l’affichage comparatif, sans qualifier de gagnant.
- [Les données d’identité et de message sont sensibles au compte] → Appliquer les mêmes frontières tenant, politiques RLS, validation Zod et contrôles de session que les routes CRM existantes.

## Migration Plan

1. Ajouter les tables, colonnes de copie, contraintes et politiques RLS au schéma Drizzle avec une migration additive. Conserver les dates de confirmation déjà enregistrées.
2. Déployer les routes serveur de test, d’attribution et d’enregistrement de copie compatibles avec le flux de capture existant ; l’affectation est calculée côté serveur.
3. Déployer les vues CRM et les permissions, puis mettre à jour le panneau d’extension pour afficher l’attribution fournie par le serveur et comptabiliser les copies.
4. Ne pas rétroattribuer les leads existants. Seuls les leads créés après l’activation d’un test peuvent être affectés.
5. En cas de rollback applicatif, masquer la navigation et désactiver les mutations de tests ; conserver les tables et événements ajoutés afin d’éviter une perte d’historique. Une migration destructive n’est pas nécessaire.
