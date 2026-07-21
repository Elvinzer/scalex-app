import { Handshake, Megaphone, UserRoundCheck, Users, Video } from "lucide-react";
import Link from "next/link";

import { Falco } from "@/components/falco/falco";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/current-user";
import { getAccountContext } from "@/lib/team/context";
import type { PermissionKey } from "@/lib/team/permissions";

import { activateAdvancedModules } from "./actions";

type ModuleCard = {
  label: string;
  description: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  // null = owner-only (not a role-grantable permission at all — Équipe).
  permission: PermissionKey | null;
};

const MODULES: ModuleCard[] = [
  { label: "Ads", description: "Pilote tes campagnes publicitaires.", href: "/acquisition/ads", icon: Megaphone, permission: "acquisition:ads" },
  { label: "Bibliothèque d'appels", description: "Rejoue tes meilleurs appels de closing.", href: "/ventes/videos", icon: Video, permission: "ventes:videos" },
  { label: "Suivi setting quotidien", description: "Détail jour par jour de ton setting.", href: "/acquisition/setting", icon: UserRoundCheck, permission: "acquisition:setting" },
  { label: "Module closing quotidien", description: "Détail jour par jour de ton closing.", href: "/ventes/closing", icon: Handshake, permission: "ventes:closing" },
  { label: "Équipe", description: "Gère les rôles et accès de ton équipe.", href: "/settings/equipe", icon: Users, permission: null },
];

export default async function AvancePage() {
  const { userId } = await getCurrentUser();
  const context = await getAccountContext(userId);
  // app/(app)/layout.tsx already redirects to /sign-in / shows the
  // suspended-access screen when context is null — this page only renders
  // once that guard has already passed, so context is never null here.
  const isOwner = context?.isOwner ?? false;
  const permissions = context?.isOwner ? "all" : (context?.permissions ?? new Set<string>());
  const advancedModulesEnabled = context?.advancedModulesEnabled ?? false;

  const visibleModules = MODULES.filter((mod) => {
    if (mod.permission === null) return isOwner; // Équipe: never role-grantable
    if (isOwner) return true;
    return permissions !== "all" && permissions.has(mod.permission);
  });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center gap-4">
        <Falco pose="neutral" size="sm" animate="enter" className="hidden sm:flex" />
        <div>
          <h1 className="text-3xl font-bold">Avancé</h1>
          <p className="mt-1 text-muted-foreground">
            Les modules au-delà de la boucle de valeur principale — toujours pleinement
            fonctionnels, juste rangés ici pour ne pas encombrer le menu.
          </p>
        </div>
      </div>

      {!advancedModulesEnabled && isOwner && (
        <div className="sticker-card-dashed flex flex-wrap items-center justify-between gap-4 p-6">
          <div>
            <p className="text-sm font-bold">Modules verrouillés</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Active-les en un clic — rien n&apos;est supprimé, ils restent réactivables à tout
              moment.
            </p>
          </div>
          <form action={activateAdvancedModules}>
            <Button type="submit">Activer les fonctions avancées</Button>
          </form>
        </div>
      )}

      {!advancedModulesEnabled && !isOwner && (
        <div className="sticker-card-dashed p-6 text-center">
          <p className="text-sm font-bold">Modules verrouillés</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Demande au propriétaire du compte de les activer depuis cette page.
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {visibleModules.map((mod) => {
          const Icon = mod.icon;
          const locked = !advancedModulesEnabled;
          return (
            <Link
              key={mod.href}
              href={mod.href}
              className={
                locked
                  ? "sticker-card pointer-events-none flex flex-col gap-3 p-5 opacity-50"
                  : "sticker-card hover-lift flex flex-col gap-3 p-5"
              }
              aria-disabled={locked}
              tabIndex={locked ? -1 : undefined}
            >
              <div className="flex size-9 items-center justify-center rounded-lg bg-muted">
                <Icon className="size-4.5" />
              </div>
              <div>
                <p className="font-bold">{mod.label}</p>
                <p className="mt-1 text-sm text-muted-foreground">{mod.description}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
