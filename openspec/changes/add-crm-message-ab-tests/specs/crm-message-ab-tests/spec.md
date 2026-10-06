## Purpose

Permet aux équipes CRM de comparer deux premiers messages sur un canal social, de garder la variante affectée à chaque nouveau lead et de mesurer les réponses obtenues après un envoi confirmé.

## ADDED Requirements

### Requirement: Un utilisateur autorisé peut créer un test de premiers messages
Le système MUST permettre à un utilisateur disposant de la permission de gestion des tests CRM de créer un test pour Instagram ou LinkedIn avec un nom et deux variantes de texte non vides. Chaque test utilise une répartition automatique cible de 50/50 et une fenêtre d’observation fixe de sept jours. La première version accepte uniquement du texte.

#### Scenario: Création valide et activation confirmée
- **WHEN** l’utilisateur saisit un nom, choisit un canal et renseigne les variantes A et B, puis confirme le démarrage
- **THEN** le test devient actif sur ce canal avec une répartition cible de 50/50 et une fenêtre d’observation de sept jours

#### Scenario: Variante manquante
- **WHEN** l’utilisateur tente de démarrer un test dont une variante est vide ou ne contient que des espaces
- **THEN** le système explique quelle variante doit être renseignée et n’active pas le test

#### Scenario: Un test actif existe déjà sur le canal
- **WHEN** l’utilisateur tente d’activer un autre test sur le même canal du même compte CRM
- **THEN** le système refuse l’activation et indique qu’il faut d’abord mettre en pause ou terminer le test actif

#### Scenario: Modifier les variantes d’un test activé
- **WHEN** l’utilisateur tente de modifier le texte d’une variante après l’activation du test
- **THEN** le système refuse la modification et conserve les textes utilisés pour les attributions existantes

#### Scenario: Utilisateur sans permission de gestion
- **WHEN** un utilisateur qui peut consulter le CRM mais ne possède pas la permission de gestion des tests tente d’en créer ou d’en modifier un
- **THEN** le système refuse l’action et conserve les paramètres du test

### Requirement: La variante est attribuée une seule fois à un nouveau lead
Lorsqu’un nouveau lead est créé par la capture de l’extension sur un canal qui possède un test actif, le système MUST lui attribuer A ou B selon la répartition automatique 50/50 et conserver pour ce lead l’identifiant du test, la variante et le contenu exact attribué. Cette attribution ne change pas si le test est mis en pause, repris ou terminé. Une capture répétée du même profil ne crée ni une nouvelle attribution ni un nouveau lead.

Les modèles peuvent utiliser `{first_name}`, `{prenom}` ou `{prénom}` pour insérer le prénom normalisé du lead. Le contenu attribué et conservé par lead est le message rendu avec cette valeur.

#### Scenario: Nouveau lead capturé pendant un test actif
- **WHEN** un profil jusque-là inconnu est confirmé comme nouveau lead sur un canal avec un test actif
- **THEN** le lead reçoit une seule variante et le contenu de cette variante est conservé avec son attribution

#### Scenario: Personnalisation du prénom dans le message attribué
- **WHEN** une variante contient `{prénom}` et que l’extension capture un lead prénommé Claire
- **THEN** le message de ce lead contient « Claire » à la place du jeton et cet instantané personnalisé reste stable

#### Scenario: Nouvelle capture d’un lead déjà attribué
- **WHEN** le même profil est capturé à nouveau après son attribution
- **THEN** le système retrouve le lead et conserve son test et sa variante initiaux

#### Scenario: Lead attribué rencontré pendant un test ultérieur
- **WHEN** un lead ayant déjà reçu une attribution de test est capturé pendant un test ultérieur sur son canal
- **THEN** le système conserve son attribution initiale et ne l’ajoute pas au test ultérieur

#### Scenario: Lead déjà contacté avant la capture
- **WHEN** l’extension reconnaît un lead ayant déjà un premier message confirmé avant le test
- **THEN** le lead n’entre pas dans le test et l’extension indique qu’il a déjà été contacté

#### Scenario: Test en pause ou terminé
- **WHEN** un nouveau profil est capturé sur un canal dont le test est en pause ou terminé
- **THEN** aucune variante de ce test n’est attribuée au lead

### Requirement: L’extension distingue la copie du message de son envoi
Pour un lead auquel une variante a été attribuée, l’extension MUST afficher le contenu exact attribué et permettre de le copier. La copie seule ne MUST NOT être enregistrée comme un envoi. L’envoi est enregistré uniquement après une confirmation explicite de l’utilisateur indiquant qu’il a réellement envoyé le message dans le réseau social.

#### Scenario: Aperçu et copie d’une variante
- **WHEN** l’utilisateur ouvre la fiche d’un lead attribué à un test actif
- **THEN** l’extension affiche la variante et son texte conservé, puis permet de le copier

#### Scenario: Message copié mais pas encore envoyé
- **WHEN** l’utilisateur copie le message sans confirmer son envoi
- **THEN** aucun événement de premier message envoyé n’est créé et aucun dénominateur KPI n’est incrémenté

#### Scenario: Envoi confirmé manuellement
- **WHEN** l’utilisateur confirme dans l’extension qu’il a envoyé le message
- **THEN** le système enregistre une seule fois l’envoi confirmé, sa date, son auteur et la variante du lead

#### Scenario: Confirmation répétée
- **WHEN** l’utilisateur répète la confirmation pour le même lead et la même attribution
- **THEN** le système conserve un seul envoi confirmé pour cette attribution

#### Scenario: Test en pause après l’attribution
- **WHEN** le test est mis en pause après l’attribution d’une variante à un lead
- **THEN** aucune variante n’est attribuée aux nouveaux leads, mais le lead conserve sa variante et peut encore confirmer son message

### Requirement: Le système calcule le taux de réponse à partir des seules fenêtres complètes
Le taux principal d’une variante MUST être calculé comme le nombre de leads uniques ayant répondu dans les sept jours suivant leur envoi confirmé, divisé par le nombre de leads uniques dont l’envoi est confirmé et dont la fenêtre de sept jours est terminée. Les envois sans fenêtre terminée restent en observation et sont affichés séparément. Les leads sans envoi confirmé ne font partie ni du numérateur ni du dénominateur. Les rendez-vous sont un indicateur secondaire : seuls les leads attribués ayant réservé dans les sept jours suivant un envoi confirmé sont comptés, sans être ajoutés aux réponses.

#### Scenario: Réponse dans la fenêtre d’observation
- **WHEN** un lead répond dans les sept jours qui suivent son envoi confirmé
- **THEN** il compte une fois comme réponse de sa variante lorsque sa fenêtre d’observation est terminée

#### Scenario: Réponse après la fenêtre d’observation
- **WHEN** un lead répond après la fin des sept jours suivant l’envoi confirmé
- **THEN** cette réponse n’augmente pas le taux de réponse de ce test

#### Scenario: Envoi encore en observation
- **WHEN** un envoi confirmé a moins de sept jours
- **THEN** le lead apparaît dans le nombre « encore en observation » et n’entre pas encore dans le dénominateur

#### Scenario: Rendez-vous réservé
- **WHEN** un lead du test réserve un rendez-vous
- **THEN** le rendez-vous réservé dans les sept jours suivant l’envoi confirmé est affiché comme indicateur secondaire séparé et n’est pas ajouté au nombre de réponses

#### Scenario: Rendez-vous réservé hors fenêtre
- **WHEN** un lead réserve un rendez-vous plus de sept jours après l’envoi confirmé
- **THEN** le rendez-vous n’est pas compté dans l’indicateur secondaire de ce test

#### Scenario: Volume encore insuffisant
- **WHEN** au moins une variante a moins de 50 fenêtres d’observation terminées
- **THEN** le système affiche un avertissement de volume insuffisant et ne déclare aucun gagnant automatiquement

#### Scenario: Volume suffisant
- **WHEN** chaque variante atteint au moins 50 fenêtres d’observation terminées
- **THEN** les taux et leurs dénominateurs restent visibles et aucun gagnant n’est déclaré automatiquement

### Requirement: Les tests ont un cycle de vie explicite
Le système MUST permettre aux utilisateurs autorisés de mettre en pause, reprendre ou terminer un test. La pause et la fin nécessitent une confirmation explicite ; la reprise est immédiate si aucun autre test actif n’occupe le canal. Une fin arrête définitivement les nouvelles attributions. Les fenêtres d’observation des envois déjà confirmés continuent jusqu’à leur terme avant que les résultats soient considérés comme définitifs.

#### Scenario: Mise en pause confirmée
- **WHEN** l’utilisateur autorisé confirme la mise en pause
- **THEN** le test passe en pause, aucune nouvelle attribution n’est faite et les leads déjà attribués restent suivis

#### Scenario: Reprise sans conflit
- **WHEN** l’utilisateur autorisé reprend un test en pause et qu’aucun autre test actif n’existe sur le canal
- **THEN** le test reprend immédiatement les nouvelles attributions

#### Scenario: Reprise avec conflit
- **WHEN** l’utilisateur tente de reprendre un test alors qu’un autre test est actif sur le canal
- **THEN** le système conserve le test en pause et indique le conflit

#### Scenario: Fin confirmée avec des fenêtres encore ouvertes
- **WHEN** l’utilisateur autorisé confirme la fin du test alors que des envois confirmés ont encore une fenêtre ouverte
- **THEN** aucune nouvelle variante n’est attribuée, les fenêtres ouvertes continuent d’être suivies et le test est présenté comme terminé avec collecte en cours

#### Scenario: Résultats définitifs après la fin
- **WHEN** toutes les fenêtres d’observation des envois confirmés sont terminées après la fin du test
- **THEN** le système fige les résultats finaux du test

#### Scenario: Attribution existante sans envoi confirmé au moment de la fin
- **WHEN** le test est terminé alors qu’un lead attribué n’a pas encore confirmé l’envoi
- **THEN** son attribution reste consultable à titre d’historique, mais l’extension n’offre plus la copie ou la confirmation de cet envoi dans le test terminé et le lead est exclu des KPI du test

### Requirement: Les listes et résultats sont accessibles selon les permissions CRM
Le système MUST afficher aux utilisateurs ayant accès au CRM les tests de leur compte et les résultats associés. Seuls les utilisateurs autorisés à gérer les tests peuvent les créer, les mettre en pause, les reprendre ou les terminer. Un utilisateur ne peut jamais consulter ou modifier les tests d’un autre compte.

#### Scenario: Consultation des résultats
- **WHEN** un utilisateur autorisé à consulter le CRM ouvre la liste ou le détail d’un test de son compte
- **THEN** le système affiche son état, son canal, sa répartition, ses volumes et ses résultats

#### Scenario: Accès à un autre compte
- **WHEN** un utilisateur tente de lire ou modifier un test appartenant à un autre compte CRM
- **THEN** le système refuse l’accès sans révéler les données du test

#### Scenario: Liste sans test
- **WHEN** l’utilisateur ouvre un filtre Actifs, En pause ou Terminés sans résultat
- **THEN** le système affiche un état vide adapté et une action de création si l’utilisateur possède la permission de gestion
