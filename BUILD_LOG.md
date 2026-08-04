# Build Log

Un insight ou une décision par jour — matière pour le build in public.

## 2026-08-04

Nettoyage d'IA (Proposition C d'un audit d'organisation) : l'app avait
accumulé 3 pages qui montraient des variantes du même moteur de diagnostic
(Dashboard, Vue d'ensemble, Diagnostic) et 5 présentations différentes de la
liste des leviers sur 4 pages — le genre de doublon qui ne se voit pas tant
qu'on ne lit pas le code, mais qui rend l'app "usine à gaz" à l'usage.
Décisions prises sans aller-retour, en ordre de risque croissant : supprimé
~1150 lignes de code mort et de pages fantômes (Vue d'ensemble, /avance,
funnel-tab/insights-tab + dépendances) ; déplacé /journal (fonctionnel mais
jamais linké) dans le menu profil plutôt que de le supprimer — travail réel,
pas de raison de le perdre ; renommé le tab "Optimisation" de Diagnostic en
"Découverte" pour lever une collision de nom avec la Section 1 qui dit déjà
"Optimise ce que tu fais déjà" ; recasé le seul bloc réellement unique de Vue
d'ensemble (graphique de tendance CA/leads/RDV/ventes) sur Mes chiffres
plutôt que sur Diagnostic, qui a déjà son propre sélecteur de période pour un
calcul différent — en ajouter un second aurait recréé le problème qu'on
corrige ; réduit le "À corriger en priorité" du Dashboard (top-3) à une seule
carte "Prochaine action", le reste étant déjà sur Diagnostic.
Volontairement pas touché : la fusion des deux tabs de Diagnostic (overview/
discovery) dans une liste unique, et l'unification des 3 chiffres de
"potentiel" différents (Dashboard/Diagnostic/badge Scale Score) qui
cohabitent par calcul délibérément différent — deux chantiers sur le cœur du
moteur de scoring qui méritent une vérification visuelle, pas une passe
autonome sans écran sous les yeux.

Fusionné Acquisition/Setting dans Pipeline : en lisant le code, Setting et
Pipeline se sont avérés ne PAS être des doublons au sens strict (Setting =
saisie agrégée quotidienne, Pipeline = Kanban de leads individuels) —
contrairement à l'hypothèse de départ ("2 implémentations quasi identiques
du même patron", vraie pour Setting/Closing mais pas pour Setting/Pipeline).
Gardé les deux, mais réunis sous une seule route : Pipeline reste la page
principale, le funnel journalier devient une sous-page liée
(/acquisition/pipeline/funnel) plutôt qu'un `?view=` — DateRangePicker
reconstruit l'URL de zéro à chaque changement de plage et aurait fait sauter
un paramètre `view` au premier clic. Au passage, corrigé un vrai bug de nav
préexistant : `anyOfPermissions` de l'entrée sidebar "Acquisition" ne
listait que 3 des 5 permissions réelles du pilier (mail/pipeline/setters
manquaient) — un membre d'équipe avec le rôle "Setting" par défaut (qui
donne justement `acquisition:pipeline`) ne voyait jamais l'entrée
Acquisition dans sa sidebar.

Même traitement côté Vente : Closing (saisie agrégée quotidienne) devient
`/ventes/appels/funnel`, Vidéos de closing devient `/ventes/appels/videos`,
toutes deux liées depuis Appels plutôt que routes cachées séparées. Nuance
gardée volontairement : la permission `ventes:videos` n'a PAS été fusionnée
dans `ventes:appels` comme `ventes:closing` — contrairement à Setting/
Closing (doublons de saisie), les transcriptions d'appels vidéo sont un
niveau de sensibilité réellement différent des stats d'appels, donc restent
un droit à part. Même correctif de bug nav appliqué à "Vente"
(`anyOfPermissions` ne listait que suivi/closing, ratait appels/business/
upsell/videos). `acquisition:setting` et `ventes:closing` restent des clés
de permission valides mais legacy — non retirées du modèle (des rôles
existants peuvent déjà les avoir), seulement retirées comme portes d'entrée
réelles des pages.

Bilan Proposition C : ~1150 lignes de code mort et pages fantômes
supprimées, 3 pages de diagnostic redondantes ramenées à 1 signal clair par
page, 4 paires de pages quasi-dupliquées consolidées en 2 (avec sous-pages
nichées plutôt que routes cachées), et 2 bugs de nav préexistants corrigés
en chemin.

Les 2 chantiers mis de côté au tour précédent ("fusionner les 2 tabs de
Diagnostic" et "unifier les 3 chiffres de potentiel") se sont avérés, en
relisant le code de plus près, ne pas être de vrais doublons à corriger :
- Les 3 chiffres (Dashboard/Diagnostic/badge Scale Score) sont documentés
  EXPLICITEMENT comme délibérément différents dans le code lui-même
  (commentaire dans app/(app)/layout.tsx : "the two are deliberately
  different numbers now, scoped to what each page is asking", suite à une
  demande produit explicite). Les fusionner serait annuler une décision
  produit déjà prise, pas corriger un bug.
- Les 2 tabs de Diagnostic ne sont pas 2 vues du même contenu : Section 1
  ("Optimiser") + Section 2 ("Ajouter") sont déjà les 2 listes canoniques
  qui se distinguent utilement (actif-sous-performant vs. absent), et le
  tab Découverte est un QUESTIONNAIRE qui alimente Section 2 en réponses,
  pas une 3e présentation de la même liste. La vraie redondance des "5
  présentations de leviers" (Dashboard, Overview, Diagnostic Section 1,
  Diagnostic Section 2, Diagnostic Découverte) est déjà résolue : Overview
  supprimée, Dashboard réduit à 1 carte pointeur — il reste exactement les
  2 listes canoniques + 1 mécanisme de saisie sur Diagnostic, ce qui est
  correct, pas un reliquat à fusionner davantage.

Proposition C est donc fonctionnelle et complète telle qu'elle peut
raisonnablement l'être sans écran sous les yeux — les 2 points restants ne
sont pas reportés, ils sont clos comme non applicables une fois vérifiés
contre le code réel plutôt que contre l'hypothèse de départ.

## 2026-07-15

Scaffold initial : Next.js 15 + Tailwind + shadcn/ui (thème neutre), structure
`app/(marketing)/` / `app/(app)/` / `app/api/`, schéma Drizzle (`users`,
`stripe_connections`, `diagnostics`) branché sur Supabase Auth (`users.id`
référence `auth.users.id`). OAuth Stripe Connect et appel à l'agent Claude :
prochaine session.
