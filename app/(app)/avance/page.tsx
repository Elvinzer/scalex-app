import { Handshake, Megaphone, UserRoundCheck, Video } from "lucide-react";

import { Falco } from "@/components/falco/falco";

type ModuleTeaser = {
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
};

// Modules volontairement mis en attente pré-PMF : la boucle de valeur
// (Dashboard → Mes chiffres → Diagnostic → Suivi/Contenu) passe d'abord.
// Le code de ces modules existe mais n'est pas relié tant qu'on ne les
// ouvre pas — ici c'est une simple vitrine « bientôt disponible », aucune
// route active. Funnel/Insights ont été retirés (doublon du Diagnostic) et
// la gestion d'équipe vit désormais dans Mon business (/business).
const TEASERS: ModuleTeaser[] = [
  { label: "Ads", description: "Pilote tes campagnes publicitaires et relie-les à ton diagnostic.", icon: Megaphone },
  { label: "Bibliothèque d'appels", description: "Rejoue et analyse tes meilleurs appels de closing.", icon: Video },
  { label: "Suivi setting quotidien", description: "Le détail jour par jour de ton setting, au-delà du mensuel.", icon: UserRoundCheck },
  { label: "Module closing quotidien", description: "Le détail jour par jour de ton closing, au-delà du mensuel.", icon: Handshake },
];

export default function AvancePage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center gap-4">
        <Falco pose="neutral" size="sm" animate="enter" className="hidden sm:flex" />
        <div>
          <h1 className="text-3xl font-bold">Avancé</h1>
          <p className="mt-1 text-muted-foreground">
            Les prochains modules pour aller plus loin, une fois ta boucle de valeur en place.
            En préparation — on les ouvre bientôt.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {TEASERS.map((mod) => {
          const Icon = mod.icon;
          return (
            <div
              key={mod.label}
              className="sticker-card flex flex-col gap-3 p-5 opacity-60"
              aria-disabled
            >
              <div className="flex items-center justify-between">
                <div className="flex size-9 items-center justify-center rounded-lg bg-muted">
                  <Icon className="size-4.5" />
                </div>
                <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-bold tracking-[0.06em] text-muted-foreground uppercase">
                  Bientôt
                </span>
              </div>
              <div>
                <p className="font-bold">{mod.label}</p>
                <p className="mt-1 text-sm text-muted-foreground">{mod.description}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
