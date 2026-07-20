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
- [ ] Migrations Drizzle appliquées sur la DB de prod (`npm run db:push` pointé sur `DATABASE_URL` prod)
- [ ] Email templates Supabase (magic link) : expéditeur/domaine cohérent avec la prod, pas les
      valeurs par défaut Supabase (`noreply@mail.app.supabase.io`)

## 3. Stripe Connect
- [ ] Clés Stripe passées de test (`sk_test_...`) à live (`sk_live_...`)
- [ ] `STRIPE_CONNECT_CLIENT_ID` / `STRIPE_CONNECT_CLIENT_SECRET` = version live (Stripe Dashboard
      → Connect → Settings)
- [ ] Webhook endpoint créé côté Stripe pointant vers le domaine de prod, `STRIPE_WEBHOOK_SECRET`
      renseigné — **rappel** : `.env.example` note que le receiver webhook n'est pas encore codé ;
      si toujours vrai au moment de la MEP, vérifier si ce n'est plus bloquant pour le launch
- [ ] URI de redirection OAuth Connect mise à jour côté Stripe avec le domaine de prod

## 4. Inngest
- [ ] App déployée connectée à Inngest Cloud (`INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` prod,
      pas les valeurs dev), `INNGEST_DEV` absent/à 0 en prod
- [ ] Les fonctions (brief hebdo, sync Stripe, relances) apparaissent bien dans le dashboard
      Inngest Cloud après le premier déploiement
- [ ] Vérifier qu'un run manuel de chaque fonction passe sans erreur en prod

## 5. Resend
- [ ] Domaine d'envoi vérifié (SPF/DKIM configurés côté DNS) — sinon le brief hebdo part en spam
- [ ] `RESEND_API_KEY` = clé prod

## 6. Variables d'environnement Vercel
Vérifier que **toutes** les variables de `.env.example` sont présentes dans Vercel (Production),
avec des valeurs différentes de dev pour celles qui ne doivent jamais être partagées :
- [ ] `ENCRYPTION_KEY` — valeur unique prod, jamais celle de dev
- [ ] `UNSUBSCRIBE_TOKEN_SECRET` — valeur unique prod
- [ ] `ADMIN_EMAILS` — liste à jour
- [ ] `APP_URL` — URL absolue du domaine de prod, sans slash final
- [ ] Reste des variables (`NEXT_PUBLIC_SUPABASE_*`, `DATABASE_URL`, `DIRECT_URL`,
      `ANTHROPIC_SHARED_API_KEY`, `GROQ_API_KEY`, `POSTHOG_*`) présentes et pointées sur les
      bonnes ressources prod

## 7. Sécurité (gap connu, à combler avant MEP)
- [ ] **Headers de sécurité pas encore configurés** — `next.config.ts` n'a actuellement aucun
      header (CSP, `X-Frame-Options`, `Referrer-Policy`, HSTS). Exigé par `CLAUDE.md`, à faire
      avant l'ouverture au public
- [ ] `npm audit` propre (pas de vuln critique/haute sans justification)
- [ ] Aucun secret dans le repo (`git log -p | grep` sur les patterns de clés courantes, ou
      `git secrets`/équivalent)

## 8. SEO/GEO (gap connu, à combler avant MEP)
- [ ] **`robots.txt` et `sitemap.xml` n'existent pas encore** dans `app/` — exigés par
      `CLAUDE.md` pour `app/(marketing)/`, à générer avant le launch public
- [ ] `llms.txt` / `llms-full.txt` à la racine, à jour avec le contenu réel des pages marketing
- [ ] `app/(app)/` bien en `noindex, nofollow` (robots meta) — à vérifier, pas juste supposé

## 9. Build & déploiement
- [ ] `npm run typecheck` && `npm run lint` clean
- [ ] Preview Vercel build sans erreur sur le commit final
- [ ] Domaine custom branché sur Vercel + HTTPS actif

## 10. Smoke test post-déploiement (à faire sur le domaine de prod, pas en local)
- [ ] Signup + connexion via magic link
- [ ] Signup + connexion via Google (`Se connecter` sur la LP → `/sign-in` → bouton Google)
- [ ] Connexion Stripe Connect avec un vrai compte (lecture seule des paiements)
- [ ] Réception effective d'un email (brief hebdo ou test manuel Resend)
- [ ] Un job Inngest se déclenche et se termine sans erreur en prod
