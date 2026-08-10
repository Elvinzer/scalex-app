export type TechnicalAlertIcon = "key" | "sync";

export type TechnicalAlert = {
  id: string;
  icon: TechnicalAlertIcon;
  titleKey: "invalidKey" | "syncFailed";
  tool?: string;
  detailKey: "invalidKeyDetail" | "syncFailedDetail";
  href: string;
};

export function buildTechnicalAlerts({ keyInvalid, failedSyncs }: { keyInvalid: boolean; failedSyncs: string[] }): TechnicalAlert[] {
  const alerts: TechnicalAlert[] = [];

  if (keyInvalid) {
    alerts.push({
      id: "compte-api-key",
      icon: "key",
      titleKey: "invalidKey",
      detailKey: "invalidKeyDetail",
      href: "/settings",
    });
  }

  for (const tool of failedSyncs) {
    alerts.push({
      id: `compte-sync-${tool}`,
      icon: "sync",
      titleKey: "syncFailed",
      tool,
      detailKey: "syncFailedDetail",
      href: "/integrations",
    });
  }

  return alerts;
}
