# Checklist mise en prod (MEP)

À parcourir intégralement le jour du déploiement. Chaque case non cochée = action manuelle
dans un dashboard externe (pas du code, donc rien que `git log` ne peut retrouver).

## 1. Google Cloud Console (login Google)
- [ ] Écran de consentement OAuth passé en **Production** (bouton "Publier l'application"
      dans Google Cloud Console → API et services → Écran de consentement OAuth). En mode
      Test, seuls les comptes ajoutés comme "utilisateurs test" peuvent se connecter.
- [ ] Domaine de prod ajouté dans **Identifiants → ID client OAuth Web** :
  - Origines JavaScript autorisées : `https://<domaine-prod>`
  - URI de redirection autorisés : l'URL de callback Supabase (`https://<projet>.supabase.co/auth/v1/callback`)
    — normalement déjà présente si même projet Supabase qu'en dev, à vérifier sinon

## 2. Supabase
- [ ] Provider Google activé en prod (Authentication → Providers → Google) si projet Supabase
      séparé du dev — Client ID/Secret à recopier
- [ ] RLS (Row Level Security) activée sur **toutes** les tables user-scoped de `db/schema.ts`,
      policies revérifiées une à une (pas seulement testées en dev)
- [ ] Migrations Drizzle appliquées sur la DB de prod — automatique au déploiement (`vercel-build`
      lance `db:migrate`) ; en manuel si besoin : `npm run db:migrate` pointé sur `DIRECT_URL` prod
- [ ] Email templates Supabase (magic link) : expéditeur/domaine cohérent avec la prod, pas les
      valeurs par défaut Supabase (`noreply@mail.app.supabase.io`)

## 3. Stripe Connect
- [ ] Clés Stripe passées de test (`sk_test_...`) à live (`sk_live_...`)
- [ ] `STRIPE_CONNECT_CLIENT_ID` / `STRIPE_CONNECT_CLIENT_SECRET` = version live (Stripe Dashboard
      → Connect → Settings)
- [ ] Webhook Stripe Connect/configuration existante vérifiée côté domaine de prod si nécessaire
- [ ] URI de redirection OAuth Connect mise à jour côté Stripe avec le domaine de prod

## 4. Programme de parrainage
- [ ] Dans l'admin Minaly (`/admin/referrals`), activer le programme et définir le taux global
- [ ] Dans l'admin Minaly (`/admin/referrals`), vérifier les overrides par compte et le taux effectif
- [ ] Dans l'espace utilisateur (`/parrainage`), créer un code de test et vérifier le lien `/r/<code>`
- [ ] Dans le compte Stripe **plateforme** (pas Stripe Connect), créer un endpoint webhook vers
      `https://<domaine-prod>/api/webhooks/stripe-billing`
- [ ] Abonner cet endpoint aux événements `invoice.paid` et `invoice.voided`
- [ ] Copier le signing secret de cet endpoint dans `STRIPE_WEBHOOK_SECRET` des variables Vercel
- [ ] Tester attribution, premier paiement, renouvellement et calcul HT hors frais Stripe
- [ ] Chaque mois, effectuer le virement hors plateforme puis utiliser `/admin/referrals` pour
      marquer les commissions disponibles comme payées et enregistrer la référence du virement

## 5. Inngest
- [ ] App déployée connectée à Inngest Cloud (`INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` prod,
      pas les valeurs dev), `INNGEST_DEV` absent/à 0 en prod
- [ ] Les fonctions (brief hebdo, sync Stripe, relances) apparaissent bien dans le dashboard
      Inngest Cloud après le premier déploiement
- [ ] Vérifier qu'un run manuel de chaque fonction passe sans erreur en prod

## 6. Resend
- [ ] Domaine d'envoi vérifié (SPF/DKIM configurés côté DNS) — sinon le brief hebdo part en spam
- [ ] `RESEND_API_KEY` = clé prod

## 7. Variables d'environnement Vercel
Vérifier que **toutes** les variables de `.env.example` sont présentes dans Vercel (Production),
avec des valeurs différentes de dev pour celles qui ne doivent jamais être partagées :
- [ ] `ENCRYPTION_KEY` — valeur unique prod, jamais celle de dev
- [ ] `UNSUBSCRIBE_TOKEN_SECRET` — valeur unique prod
- [ ] `ADMIN_EMAILS` — liste à jour
- [ ] `APP_URL` et `NEXT_PUBLIC_APP_URL` — `https://www.minaly.io`, sans slash final
- [ ] Reste des variables (`NEXT_PUBLIC_SUPABASE_*`, `DATABASE_URL`, `DIRECT_URL`,
      `ANTHROPIC_SHARED_API_KEY`, `GROQ_API_KEY`, `POSTHOG_*`) présentes et pointées sur les
      bonnes ressources prod

## 8. Sécurité (gap connu, à combler avant MEP)
- [ ] **Headers de sécurité pas encore configurés** — `next.config.ts` n'a actuellement aucun
      header (CSP, `X-Frame-Options`, `Referrer-Policy`, HSTS). Exigé par `CLAUDE.md`, à faire
      avant l'ouverture au public
- [ ] `npm audit` propre (pas de vuln critique/haute sans justification)
- [ ] Aucun secret dans le repo (`git log -p | grep` sur les patterns de clés courantes, ou
      `git secrets`/équivalent)

## 9. SEO/GEO (gap connu, à combler avant MEP)
- [ ] **`robots.txt` et `sitemap.xml` n'existent pas encore** dans `app/` — exigés par
      `CLAUDE.md` pour `app/(marketing)/`, à générer avant le launch public
- [ ] `llms.txt` / `llms-full.txt` à la racine, à jour avec le contenu réel des pages marketing
- [ ] `app/(app)/` bien en `noindex, nofollow` (robots meta) — à vérifier, pas juste supposé

## 10. Build & déploiement
- [ ] `npm run typecheck` && `npm run lint` clean
- [ ] Preview Vercel build sans erreur sur le commit final
- [ ] Domaine custom branché sur Vercel + HTTPS actif

## 11. Smoke test post-déploiement (à faire sur le domaine de prod, pas en local)
- [ ] Signup + connexion via magic link
- [ ] Signup + connexion via Google (`Se connecter` sur la LP → `/sign-in` → bouton Google)
- [ ] Connexion Stripe Connect avec un vrai compte (lecture seule des paiements)
- [ ] Réception effective d'un email (brief hebdo ou test manuel Resend)
- [ ] Un job Inngest se déclenche et se termine sans erreur en prod
