import type { Metadata } from "next";
import type { ReactNode } from "react";

import { SiteFooter } from "../site-footer";
import { SiteHeader } from "../site-header";

const LAST_UPDATED = "4 août 2026";
const CONTACT_EMAIL = "contact@scalex.app";

export const metadata: Metadata = {
  title: "Politique de confidentialité | Scale X",
  description:
    "Comment Scale X collecte, utilise et protège vos données personnelles : ce que nous collectons, pourquoi, avec qui nous le partageons et vos droits RGPD.",
  alternates: { canonical: "/politique-de-confidentialite" },
  openGraph: {
    title: "Politique de confidentialité | Scale X",
    description:
      "Comment Scale X collecte, utilise et protège vos données personnelles : ce que nous collectons, pourquoi, avec qui nous le partageons et vos droits RGPD.",
    type: "website",
  },
};

type Section = { id: string; title: string; body: ReactNode };

const SECTIONS: Section[] = [
  {
    id: "responsable-de-traitement",
    title: "1. Qui est responsable de vos données",
    body: (
      <p>
        Scale X (« nous », « notre ») est l&apos;éditeur du site et de l&apos;application accessibles à l&apos;adresse
        scalex.app, et à ce titre responsable du traitement de vos données personnelles au sens du Règlement
        Général sur la Protection des Données (RGPD) et de la loi Informatique et Libertés. Pour toute question,
        vous pouvez nous contacter à{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-accent hover:underline">
          {CONTACT_EMAIL}
        </a>
        .
      </p>
    ),
  },
  {
    id: "donnees-collectees",
    title: "2. Les données que nous collectons",
    body: (
      <>
        <p>Selon votre usage du produit, nous collectons :</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong className="text-foreground">Données de compte :</strong> nom, adresse email, mot de passe (haché,
            géré par Supabase Auth), rôle au sein de votre équipe.
          </li>
          <li>
            <strong className="text-foreground">Données de facturation :</strong> gérées directement par Stripe ; nous
            ne stockons jamais votre numéro de carte bancaire.
          </li>
          <li>
            <strong className="text-foreground">Clé API Anthropic (BYOK) :</strong> si vous fournissez la vôtre, elle
            est chiffrée en base de données, jamais affichée en clair après sa saisie, jamais journalisée.
          </li>
          <li>
            <strong className="text-foreground">Données business connectées :</strong> via les intégrations que vous
            activez (Stripe Connect, iClosed, Calendly, Instagram). Voir la section dédiée ci-dessous.
          </li>
          <li>
            <strong className="text-foreground">Données d&apos;usage :</strong> pages consultées, actions réalisées
            dans le produit, journaux techniques, collectées via notre outil de mesure d&apos;audience (PostHog).
          </li>
          <li>
            <strong className="text-foreground">Correspondance :</strong> les emails que vous nous envoyez lorsque
            vous nous contactez.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "finalites-base-legale",
    title: "3. Pourquoi nous les utilisons",
    body: (
      <>
        <p>Nous utilisons vos données pour les finalités suivantes, chacune adossée à une base légale RGPD :</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Fournir et faire fonctionner le service souscrit (exécution du contrat).</li>
          <li>
            Diagnostiquer votre activité et générer des recommandations via l&apos;agent IA (exécution du contrat).
          </li>
          <li>Vous envoyer le brief hebdomadaire et les notifications produit (exécution du contrat).</li>
          <li>Facturer votre abonnement (exécution du contrat et obligations légales comptables).</li>
          <li>Améliorer le produit et mesurer son usage (intérêt légitime).</li>
          <li>Assurer la sécurité du service et prévenir la fraude (intérêt légitime et obligation légale).</li>
          <li>Répondre à vos demandes de support (exécution du contrat).</li>
        </ul>
        <p>
          Nous ne prenons aucune décision automatisée produisant des effets juridiques à votre égard : les
          recommandations générées par l&apos;agent IA vous sont présentées pour que vous décidiez de les appliquer
          ou non.
        </p>
      </>
    ),
  },
  {
    id: "integrations-tierces",
    title: "4. Intégrations tierces (Stripe, iClosed, Calendly, Instagram)",
    body: (
      <>
        <p>
          Lorsque vous connectez un compte tiers, Scale X importe les données nécessaires au calcul de vos
          indicateurs :
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong className="text-foreground">Stripe Connect :</strong> transactions, produits, montants, statut de
            vos clients payants.
          </li>
          <li>
            <strong className="text-foreground">iClosed :</strong> appels de closing programmés et leur résultat
            (montant, statut).
          </li>
          <li>
            <strong className="text-foreground">Calendly :</strong> rendez-vous pris et leur statut.
          </li>
          <li>
            <strong className="text-foreground">Instagram :</strong> via l&apos;API Instagram (scopes en lecture
            seule <code className="rounded bg-surface-sunken px-1 py-0.5 text-[13px]">instagram_business_basic</code>{" "}
            et{" "}
            <code className="rounded bg-surface-sunken px-1 py-0.5 text-[13px]">
              instagram_business_manage_insights
            </code>
            ), l&apos;identifiant et les statistiques de performance (reach, impressions, interactions) de vos
            publications professionnelles. Nous ne collectons ni vos messages privés, ni vos identifiants de
            connexion, ni aucune donnée individuelle sur vos abonnés.
          </li>
        </ul>
        <p>
          Ces données peuvent contenir des données personnelles de vos propres clients ou prospects (nom, email,
          montant payé, statut d&apos;un appel). Vous restez responsable de traitement vis-à-vis de vos clients ;
          Scale X agit pour ces données spécifiques en tant que sous-traitant, dans le seul cadre de la fourniture
          du service de diagnostic.
        </p>
      </>
    ),
  },
  {
    id: "partage-sous-traitants",
    title: "5. Avec qui nous partageons vos données",
    body: (
      <>
        <p>
          Nous ne vendons jamais vos données personnelles. Nous les partageons uniquement avec les sous-traitants
          nécessaires au fonctionnement du service :
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Vercel Inc. : hébergement de l&apos;application.</li>
          <li>Supabase Inc. : base de données et authentification.</li>
          <li>Stripe : paiement de votre abonnement et lecture de votre compte Stripe connecté.</li>
          <li>Anthropic PBC : exécution des requêtes de l&apos;agent IA, en priorité via votre propre clé API.</li>
          <li>Resend : envoi des emails transactionnels et du brief hebdomadaire.</li>
          <li>Inngest Inc. : orchestration des tâches automatisées (synchronisation, relances).</li>
          <li>PostHog Inc. : mesure d&apos;audience et amélioration produit.</li>
          <li>Meta Platforms, Inc. : API Instagram, si vous connectez un compte Instagram professionnel.</li>
          <li>iClosed / Calendly LLC : si vous connectez le compte correspondant.</li>
        </ul>
      </>
    ),
  },
  {
    id: "cookies",
    title: "6. Cookies et traceurs",
    body: (
      <ul className="list-disc space-y-1.5 pl-5">
        <li>
          <strong className="text-foreground">Cookies essentiels :</strong> session d&apos;authentification
          (Supabase Auth), nécessaires au fonctionnement du produit et exemptés de consentement.
        </li>
        <li>
          <strong className="text-foreground">Cookies de mesure d&apos;audience :</strong> PostHog, pour comprendre
          l&apos;usage du produit et l&apos;améliorer. Vous pouvez vous y opposer via les réglages de votre
          navigateur.
        </li>
        <li>Nous ne déposons aucun cookie publicitaire ni traceur de suivi cross-site tiers.</li>
      </ul>
    ),
  },
  {
    id: "duree-conservation",
    title: "7. Durée de conservation",
    body: (
      <ul className="list-disc space-y-1.5 pl-5">
        <li>Données de compte : pendant toute la durée de votre abonnement.</li>
        <li>
          Après résiliation : conservées 30 jours (pour permettre une réactivation), puis supprimées, sauf durée de
          conservation légale plus longue (données de facturation : 10 ans, Code de commerce).
        </li>
        <li>Journaux techniques : 12 mois maximum.</li>
        <li>Données Instagram / iClosed / Calendly : supprimées dès la déconnexion de l&apos;intégration.</li>
      </ul>
    ),
  },
  {
    id: "transferts-hors-ue",
    title: "8. Transferts de données hors Union européenne",
    body: (
      <p>
        Certains de nos sous-traitants sont situés hors de l&apos;Union européenne, notamment aux États-Unis
        (Anthropic, Meta, PostHog, Stripe, Vercel). Ces transferts sont encadrés par les Clauses Contractuelles
        Types de la Commission européenne ou un mécanisme équivalent garantissant un niveau de protection
        adéquat.
      </p>
    ),
  },
  {
    id: "securite",
    title: "9. Sécurité de vos données",
    body: (
      <ul className="list-disc space-y-1.5 pl-5">
        <li>Chiffrement des clés API sensibles (Anthropic) en base ; jamais stockées en clair, jamais journalisées.</li>
        <li>Connexions chiffrées en HTTPS/TLS sur l&apos;ensemble de l&apos;application.</li>
        <li>Row Level Security (RLS) activée sur toutes les tables contenant des données par utilisateur.</li>
        <li>Accès aux données de production restreint selon le principe du moindre privilège.</li>
      </ul>
    ),
  },
  {
    id: "vos-droits",
    title: "10. Vos droits",
    body: (
      <>
        <p>Conformément au RGPD, vous disposez des droits suivants sur vos données personnelles :</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Droit d&apos;accès, de rectification et d&apos;effacement.</li>
          <li>Droit à la limitation et à la portabilité de vos données.</li>
          <li>Droit d&apos;opposition au traitement.</li>
          <li>Droit de retirer votre consentement à tout moment, lorsque le traitement en dépend.</li>
        </ul>
        <p>
          Pour exercer ces droits, écrivez-nous à{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-accent hover:underline">
            {CONTACT_EMAIL}
          </a>
          . Nous répondons sous un mois. Vous disposez également du droit d&apos;introduire une réclamation auprès
          de la CNIL (3 Place de Fontenoy, 75007 Paris,{" "}
          <a
            href="https://www.cnil.fr"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-accent hover:underline"
          >
            www.cnil.fr
          </a>
          ).
        </p>
      </>
    ),
  },
  {
    id: "suppression-instagram",
    title: "11. Déconnexion et suppression des données Instagram",
    body: (
      <p>
        Si vous avez connecté un compte Instagram professionnel, vous pouvez à tout moment déconnecter
        l&apos;intégration depuis Paramètres → Intégrations : cela révoque immédiatement notre accès à votre compte
        et arrête toute nouvelle collecte. Vous pouvez également demander la suppression complète des données déjà
        importées (statistiques de contenu, informations de connexion) en nous écrivant à{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-accent hover:underline">
          {CONTACT_EMAIL}
        </a>
        . Nous traitons la demande sous 30 jours maximum.
      </p>
    ),
  },
  {
    id: "mineurs",
    title: "12. Mineurs",
    body: (
      <p>
        Scale X est destiné aux professionnels majeurs. Nous ne collectons pas sciemment de données concernant des
        personnes mineures.
      </p>
    ),
  },
  {
    id: "modifications",
    title: "13. Modifications de cette politique",
    body: (
      <p>
        Nous pouvons modifier cette politique pour refléter une évolution du produit ou de la réglementation. La
        date de mise à jour en haut de page fait foi ; en cas de changement substantiel, nous vous informerons par
        email.
      </p>
    ),
  },
  {
    id: "contact",
    title: "14. Nous contacter",
    body: (
      <p>
        Pour toute question relative à cette politique ou à vos données personnelles, écrivez-nous à{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-accent hover:underline">
          {CONTACT_EMAIL}
        </a>
        .
      </p>
    ),
  },
];

export default function PrivacyPolicyPage() {
  return (
    <div className="bg-white">
      <SiteHeader />

      <main className="px-6 py-16 sm:px-10 sm:py-24">
        <div className="mx-auto max-w-[760px]">
          <p className="mb-3 text-[13.5px] font-semibold tracking-wide text-accent uppercase">Scale X</p>
          <h1 className="text-[clamp(2rem,4vw,2.75rem)] font-bold text-foreground">Politique de confidentialité</h1>
          <p className="mt-3 text-[14.5px] text-muted-foreground">Dernière mise à jour : {LAST_UPDATED}</p>

          <p className="mt-8 text-[15.5px] leading-relaxed text-muted-foreground">
            Cette politique explique quelles données Scale X collecte lorsque vous utilisez notre application,
            pourquoi nous les collectons, avec qui nous les partageons, et comment exercer vos droits. Elle
            s&apos;applique au site scalex.app et à l&apos;application produit.
          </p>

          <nav aria-label="Sommaire" className="mt-10 rounded-[var(--radius-card)] border border-border bg-surface-sunken p-6">
            <p className="mb-3 text-[13px] font-bold tracking-wide text-foreground uppercase">Sommaire</p>
            <ol className="grid gap-x-6 gap-y-1.5 text-[14px] text-muted-foreground sm:grid-cols-2">
              {SECTIONS.map((section) => (
                <li key={section.id}>
                  <a href={`#${section.id}`} className="transition-colors hover:text-accent">
                    {section.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="mt-4 divide-y divide-border">
            {SECTIONS.map((section) => (
              <section key={section.id} id={section.id} className="scroll-mt-28 py-8">
                <h2 className="mb-3 text-[19px] font-bold text-foreground">{section.title}</h2>
                <div className="space-y-3 text-[15px] leading-relaxed text-muted-foreground">{section.body}</div>
              </section>
            ))}
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
