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
Acquisition dans sa sidebar. Prochaine itération : même traitement pour
Vente/Closing + Vente/Vidéos → Appels.

## 2026-07-15

Scaffold initial : Next.js 15 + Tailwind + shadcn/ui (thème neutre), structure
`app/(marketing)/` / `app/(app)/` / `app/api/`, schéma Drizzle (`users`,
`stripe_connections`, `diagnostics`) branché sur Supabase Auth (`users.id`
référence `auth.users.id`). OAuth Stripe Connect et appel à l'agent Claude :
prochaine session.
