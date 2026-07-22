# Audit design — Scale X (état actuel, avant refonte)

Lecture seule. Aucun fichier de code n'a été modifié pour produire ce rapport.
Pages couvertes : Dashboard, Diagnostic, Mes chiffres, Copilote, Mon business,
Vue d'ensemble, Journal de bord.

## 0bis. Décisions validées (2026-07-22)

- **§0** : règle stricte restaurée — un seul CTA coral et un seul bloc sombre
  (`sticker-spotlight`) par écran.
- **§3.4** : corail/violet réassignés — corail = action uniquement, violet =
  Copilote/IA/analytics uniquement. Les usages de corail comme couleur d'état
  "actif/coché/aujourd'hui" basculent vers une teinte neutre ou `state-healthy`
  selon le cas.

La migration est appliquée page par page dans l'ordre du §4 ci-dessous.

## 0. Point bloquant à trancher avant toute refonte

Le brief demande de restaurer/renforcer deux règles strictes : **un seul CTA
coral par écran** et **un seul bloc sombre (`sticker-spotlight`) par page**.

Mais `app/globals.css:88-94` documente explicitement que ces règles ont été
**assouplies volontairement** lors d'un chantier précédent ("Premium v2") :

> "Structural rules relaxed on purpose: more than one dark/spotlight surface
> per page is fine now, more than one accent color is fine now — the goal is
> premium and modern, not the old one-CTA austerity."

Concrètement, aujourd'hui plusieurs pages ont déjà 2+ éléments coral pleins
visibles simultanément (voir §2), et c'est un choix assumé, pas un oubli.
**Il faut décider explicitement lequel des deux principes gagne** avant que
je touche à quoi que ce soit — sinon je vais soit casser un choix récent
volontaire, soit ignorer ta nouvelle demande. Je recommande de trancher pour
la version stricte du brief (un seul CTA coral, un seul bloc sombre) parce
que c'est ce que tu demandes explicitement maintenant et que l'audit montre
que la version "assouplie" a dérivé plus loin que prévu (jusqu'à 4-5 éléments
coral pleins visibles en même temps sur Vue d'ensemble) — mais c'est ta
décision produit, pas la mienne.

## 1. Incohérences transversales (répétées sur plusieurs pages)

- **Tailles de "gros chiffre" non unifiées** : le même rôle visuel ("montant
  hero" / "chiffre qui compte") apparaît en `text-4xl` (36px, Dashboard hero),
  `text-[38px]` (Diagnostic "potentiel total", Mon business "% complété"),
  et `text-[52px]` (Scale Score dans sa modale) — trois tailles différentes
  pour un même rôle, aucune n'étant un palier Tailwind standard.
- **`tabular-nums` appliqué de façon incohérente** : présent sur les montants
  hero (Dashboard, Diagnostic, Business, Journal day-drawer), absent sur les
  valeurs de `MetricCard` (Dashboard, Overview), les gains de `PriorityItem`,
  les chiffres de `MonthCard` (Mes chiffres), et le `keyNumber` des cellules
  du calendrier Journal — alors que ce sont exactement les endroits où un
  changement de largeur de chiffre fait "sauter" la mise en page.
- **CTA coral multipliés** : jusqu'à 3 simultanés sur Dashboard (Rapport
  Daily, "Récupérer ce cash", "Améliorer ça" du item n°1), 4-5 sur Vue
  d'ensemble ("Améliorer →", jusqu'à 3× "En discuter avec le Copilote", toggle
  de métrique actif), potentiellement 1 par carte vide sur Mes chiffres
  ("+ Remplir" répétable ×12), et systématiquement un liseré coral en dur sur
  chaque `Dialog`/`Drawer` ouvert (`dialog.tsx`/`drawer.tsx`, `style` inline)
  qui s'additionne à tout CTA coral déjà visible dessous.
- **Corail utilisé comme couleur d'état, pas seulement comme CTA** : "actif/
  oui" sur Mon business (plateformes, offres, relances), jour courant +
  case cochée + jalon complété sur Journal de bord, mois en cours sur Mes
  chiffres. Ça dilue le signal "corail = action" que le brief veut protéger.
- **Violet (accent-2) mal aligné avec son intention documentée** :
  `globals.css:121-122` le réserve à "analytics/IA" ; en pratique le bouton
  principal du Copilote (le composant IA de l'app) est corail, et le violet
  n'apparaît que sur un petit badge de notification — l'inverse de l'intention.
  À l'inverse, sur Mon business, la barre de progression utilise `bg-signal`
  (= corail) pour deux catégories différentes ("acquisition" et "delivery"
  sont littéralement la même teinte) — perte d'information, pas juste un
  problème esthétique.
- **Padding de carte incohérent, y compris sur une même classe `.sticker-card`** :
  p-4 (Overview metric cards), p-5 (Mes chiffres, Vue d'ensemble
  opportunity cards, Journal panels), p-6 (Diagnostic points, Overview
  funnel/chart), p-7/p-8 (Mon business sections), et les spotlights varient
  entre `px-7 py-6`, `px-8 py-7`, `px-6 py-4` selon la page — aucune règle
  visible liée à l'importance du contenu.
- **Titres de section : deux conventions concurrentes** : `<h2 className="text-base font-bold">`
  (Dashboard, Diagnostic, Business, Overview) vs `<p className="font-display text-lg font-bold">`
  (tout le module Journal de bord) — même rôle hiérarchique, deux traitements
  visuels et deux tailles (16px vs 18px) selon la page.
- **Valeurs hors grille 4/8/12/16/24/32/48 fréquentes** : `gap-1.5`/`p-1.5`
  (6px, très répété), `text-[10px]`/`text-[11px]`/`text-[22px]`/`text-[38px]`/
  `text-[52px]`, `size-4.5` (18px) — surtout concentrées dans Journal de bord
  et les en-têtes de page (`text-[22px]` répété tel quel sur Diagnostic,
  Overview, Journal plutôt que via un token/classe partagée).
- **Incohérences de wording produit** : le libellé de nav "Mes chiffres" ne
  correspond à aucun titre affiché sur la page (`<h1>Tes datas</h1>`) ; le
  concept "Copilote" affiché à l'utilisateur redevient "Améliorer : {title}"
  dans le titre du drawer lui-même.
- **`Dialog`/`Drawer` hors design system** : `components/ui/dialog.tsx` et
  `drawer.tsx` appliquent une bordure coral 2px en `style` inline plutôt que
  via `.sticker-card`/une classe utilitaire — c'est la seule famille de
  surfaces "carte" de toute l'app qui n'utilise pas les classes standard.
- **Thème Recharts globalement cohérent** (`lib/chart-theme.ts` utilise bien
  les tokens CSS), sauf `borderRadius: 8` en dur au lieu de `var(--radius-control)`,
  et le point final du graphique en noir alors que les autres "chiffres qui
  comptent" de la même page sont en `gradient-text` corail/violet.

## 2. Détail par page

### Dashboard (`app/(app)/dashboard/`)
Un seul `h1` (`text-[22px]`), hiérarchie h2/body faible (16px bold vs 14px
bold), usage systématique de `font-bold` même sur du texte sans rôle de
titre. Bandeau check-in en bordure dashed manuelle au lieu de
`.sticker-card-dashed`. 3 CTA coral simultanés possibles (voir §1). Badge
"non fait" du Rapport Daily en `accent-2` (violet) utilisé de façon
décorative isolée, sans lien avec le reste de la page.

### Diagnostic (`app/(app)/diagnostic/`)
Page dense (6 blocs empilés, `gap-8`). Bonne utilisation cohérente de
`.sticker-card`/`.sticker-spotlight`/`.sticker-card-dashed` (la page la plus
disciplinée sur ce point). Montant hero à 38px (vs 36px au Dashboard pour le
même rôle). Filtres de période avec un style inline dupliquant à la main le
CTA coral au lieu de réutiliser `Button`/une classe utilitaire. L'onglet
Découverte peut afficher plusieurs `DiscoveryOpportunityCard`, chacune avec
son propre bouton coral.

### Mes chiffres (`app/(app)/datas/`)
H1 "Tes datas" incohérent avec le libellé nav. Aucun `tabular-nums` dans tout
le module ; chiffres clés des `MonthCard` au même traitement typo que le
texte secondaire (pas de mise en avant). `SuggestionBanner` en style ad-hoc
non standardisé. CTA "+ Remplir" (coral) potentiellement répété sur
plusieurs cartes vides simultanément.

### Copilote (`floating-chat-bubble.tsx` + `improve-chat.tsx`)
Seule surface "panneau" de l'app qui n'utilise ni `.sticker-card` ni
`.sticker-spotlight` (repose sur `DrawerContent` + bordure coral hardcodée).
Bouton principal + bouton d'envoi tous deux coral, alors que le token
`accent-2` est documenté comme réservé à l'IA/analytics et n'apparaît que sur
un badge secondaire. Asymétrie de traitement bulle utilisateur (fond
`surface-sunken`) vs assistant (pas de bulle) — probablement volontaire mais
à confirmer.

### Mon business (`app/(app)/business/`)
4 sections identiques `.sticker-card p-8`, cohérentes entre elles. Seul
`tabular-nums` de la page sur le "% complété" du spotlight — aucun champ €
affiché en lecture n'est formaté (ce sont des inputs bruts, donc hors scope
`tabular-nums`, mais aucun symbole € visible à côté). Barre de progression
du header : segments "acquisition" et "delivery" rendus dans la même teinte
corail (perte d'information, voir §1). Blocs internes (offres, relances,
upsell) en `border` ad-hoc non standardisée.

### Vue d'ensemble (`app/(app)/overview/`)
Page la plus dense en corail simultané (4-5 éléments pleins possibles à
l'écran). Titre du funnel en `<p className="text-sm font-bold">` alors que
les autres titres de section de la même page sont des `<h2 className="text-base font-bold">`
— même niveau hiérarchique, deux traitements. `.sticker-card` utilisé avec 3
paddings différents (p-4/p-5/p-6) sur une seule page. Thème Recharts propre
dans l'ensemble (voir §1 pour les deux réserves).

### Journal de bord (`app/(app)/journal/`, retiré du menu, code intact)
Page la plus disciplinée sur "1 CTA coral" (le seul vrai bouton, "+ Nouveau
projet", est en `variant="secondary"`, pas coral) — mais utilise le corail
comme code d'état à plusieurs endroits potentiellement visibles ensemble
(jour courant, cases cochées, jalons complétés). Convention typographique
des titres de section différente du reste de l'app (voir §1). Nombreuses
valeurs `text-[10px]`/`text-[11px]`/`gap-1.5` concentrées dans les cellules
de calendrier, denses par nature (jour + pastille + chiffre + ✦ dans un
`aspect-square` étroit).

## 3. Ce que je propose de moderniser (rien n'est appliqué — en attente de ta validation)

En restant strictement dans "style only", pas de changement de structure/
route/logique/data :

1. **Une seule taille de "montant hero"** dans `globals.css` (probablement
   `text-4xl`/36px, déjà le plus utilisé), appliquée partout où le rôle est
   identique (Dashboard, Diagnostic, Business, Scale Score modal).
2. **`tabular-nums` systématique** sur toute valeur numérique qui peut
   changer de largeur en place (metric cards, gains, chiffres de calendrier,
   chiffres de `MonthCard`).
3. **Un seul CTA coral par écran** (si tu confirmes ce sens au §0) —
   implique de repasser certains boutons secondaires en `variant="secondary"`/
   outline, page par page, en gardant le premier/plus important en coral.
4. **Réassigner clairement corail = action, violet = IA/analytics** — le
   bouton principal du Copilote passerait en violet (ou un traitement dédié),
   cohérent avec l'intention déjà écrite dans `globals.css`. Les usages de
   corail comme "état actif" (Mon business, Journal) seraient déplacés vers
   `state-healthy`/une teinte neutre pour ne garder le corail que pour l'action.
5. **Grille d'espacement 4/8/12/16/24/32/48 stricte** — remplacer les valeurs
   arbitraires (`gap-1.5`, `p-1.5`, `text-[10px]`, `size-4.5`, `text-[22px]`
   en dur, etc.) par les paliers les plus proches, et unifier le padding de
   `.sticker-card` (probablement p-6 par défaut, une variante p-4 explicite
   pour les cartes "compactes" plutôt qu'un flottement non intentionnel).
6. **Une seule convention de titre de section** (probablement `<h2 className="text-base font-bold">`,
   déjà majoritaire) — à appliquer aussi à Journal de bord pour le faire
   rentrer dans le même moule que le reste de l'app.
7. **`Dialog`/`Drawer` migrés vers `.sticker-card`** (ou une variante dédiée)
   au lieu de la bordure coral en `style` inline — pour que les panneaux
   flottants suivent la même famille visuelle que les cartes de contenu.
8. **Petites corrections de cohérence texte** : aligner le H1 "Mes chiffres"
   avec son libellé de nav, et vérifier le titre du drawer Copilote.
9. **Polish Recharts mineur** : `borderRadius` du tooltip via `var(--radius-control)`,
   couleur du point final du graphique alignée sur le traitement "chiffre qui
   compte" du reste de la page.
10. **Dark-mode : uniquement préparer les tokens** (`.dark {}` existe déjà
    mais dupliqué à l'identique du light — je proposerai des valeurs, sans
    jamais activer de bascule UI ce chantier).

## 4. Ordre d'application proposé (une fois validé)

Dashboard → Diagnostic → Mes chiffres → Copilote → Mon business → Vue
d'ensemble → Journal de bord, avec un contrôle visuel à chaque page avant de
passer à la suivante, comme demandé dans le brief.

---

## 5. Migration appliquée (2026-07-22)

Les deux décisions du §0bis ont été appliquées, page par page, dans l'ordre
du §4. `typecheck` et `lint` passent après chaque page. Résumé des
changements réels (style seulement — aucune route/structure/logique/donnée
modifiée) :

- **Fondations** (`app/globals.css`, `components/ui/dialog.tsx`,
  `components/ui/drawer.tsx`) : classes `.figure-hero` (36px) et
  `.figure-score` (52px, réservé au Scale Score) pour remplacer les 3 tailles
  arbitraires ; suppression du liseré coral en dur sur `Dialog`/`Drawer` ;
  `Drawer` aligné sur `Dialog` (bordure 2px neutre) ; nouveau keyframe
  `glow-pulse-accent2` pour le halo violet du Copilote.
- **Dashboard** : un seul CTA coral (bandeau "Récupérer ce cash →") — le
  bouton Rapport Daily et le CTA du point n°1 repassent en secondaire ; badge
  de gain passé de corail à `positive` (vert) ; `tabular-nums` ajouté sur
  `MetricCard` ; hiérarchie de texte restaurée (plusieurs `font-bold`
  superflus retirés) ; bandeau check-in migré vers `.sticker-card-dashed`.
- **Diagnostic** : figure hero unifiée ; filtres de période en tinte douce
  au lieu d'un remplissage coral dupliqué à la main ; boutons
  `DiscoveryOpportunityCard` passés en violet (`variant="accent2"` — ils
  ouvrent le Copilote) ; `tabular-nums` ajouté sur les figures de gain ;
  `ScaleScoreModal` migré vers `.figure-score`.
- **Mes chiffres** : H1 aligné sur le libellé de nav ("Mes chiffres" au lieu
  de "Tes datas") ; marqueur "mois en cours" neutre au lieu de coral ; "+
  Remplir" neutre ; `tabular-nums` sur les chiffres de carte.
- **Copilote** : bulle flottante et bouton d'envoi passés en violet
  (`accent-2`), cohérent avec l'intention déjà documentée de ce token ; point
  de notification passé à une couleur neutre d'alerte pour rester visible
  sur fond violet.
- **Mon business** : barre de progression par section passée d'un mélange
  corail/violet/vert (avec 2 segments littéralement identiques) à une rampe
  neutre à 4 opacités ; toggles "actif/oui" passés de corail à `positive` ;
  figure hero unifiée.
- **Vue d'ensemble** : toggle de métrique du graphique en tinte douce ;
  titre "Ton funnel" remonté en vrai `<h2>` cohérent avec le reste de la
  page ; `tabular-nums` ajouté ; `chartTooltipStyle.borderRadius` référence
  maintenant le token au lieu d'une valeur en dur.
- **Journal de bord** : titres de section unifiés sur la même convention
  `<h2 className="text-base font-bold">` que le reste de l'app (au lieu de
  `<p className="font-display text-lg font-bold">`) ; marqueur "aujourd'hui"
  et case à cocher "terminé" passés de corail à neutre/`positive` ; glyphe
  d'amélioration ✦ et barre de progression de projet passés à `positive`.

Non traité dans cette passe (mineur, laissé tel quel) : tailles de police
arbitraires isolées (`text-[10px]`/`text-[11px]` dans le calendrier Journal,
contraintes par la densité de la grille 7 colonnes), taille des titres de
`Dialog`/`Drawer` (`text-base` vs `text-lg` selon les endroits — pas une
règle de marque, juste une préférence pas encore tranchée), wording
"Améliorer : {title}" du Copilote (changement de texte, hors périmètre
style-only de ce chantier).

Vérification effectuée : `npm run typecheck` et `npm run lint` passent
après chaque page. Je n'ai pas pu faire de captures d'écran de contrôle
authentifiées (pas d'accès aux identifiants de session) — à vérifier
visuellement dans le navigateur, notamment sur la réassignation
corail/violet du Copilote (§3.4), le changement le plus visible de tous.
