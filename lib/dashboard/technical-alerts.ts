export type TechnicalAlertIcon = "key" | "sync";

export type TechnicalAlert = {
  id: string;
  icon: TechnicalAlertIcon;
  title: string;
  detail: string;
  href: string;
};

export function buildTechnicalAlerts({ keyInvalid, failedSyncs }: { keyInvalid: boolean; failedSyncs: string[] }): TechnicalAlert[] {
  const alerts: TechnicalAlert[] = [];

  if (keyInvalid) {
    alerts.push({
      id: "compte-api-key",
      icon: "key",
      title: "Clé API Anthropic invalide",
      detail: "Renouvelle-la pour débloquer les insights de l’agent.",
      href: "/settings",
    });
  }

  for (const tool of failedSyncs) {
    alerts.push({
      id: `compte-sync-${tool}`,
      icon: "sync",
      title: `Synchronisation ${tool} en échec`,
      detail: "Reconnecte l’intégration pour reprendre la récupération de tes appels.",
      href: "/integrations",
    });
  }

  return alerts;
}
