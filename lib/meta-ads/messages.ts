export function metaAdsErrorMessage(value: unknown): string | null {
  if (value === "config") {
    return "Meta Ads n’est pas configuré sur cet environnement. Ajoute META_APP_ID et META_APP_SECRET dans les variables serveur, puis redémarre l’application.";
  }
  if (value === "ads_read") {
    return "Meta n’a pas accordé la permission de lecture des publicités. Reconnecte Meta Ads et accepte ads_read.";
  }
  if (value === "denied") {
    return "Tu as refusé la connexion Meta Ads. La lecture reste inactive ; tu peux relancer la connexion quand tu veux.";
  }
  if (value === "state") {
    return "La connexion Meta Ads a expiré. Relance la connexion depuis cette page.";
  }
  if (value === "access") {
    return "La connexion Meta Ads nécessite les droits du propriétaire du compte. Relance-la depuis Intégrations.";
  }
  if (value === "token") {
    return "Meta a renvoyé un jeton inutilisable. Relance la connexion et vérifie le compte autorisé.";
  }
  if (value === "oauth") {
    return "La connexion Meta Ads n’a pas abouti. Réessaie depuis cette page.";
  }
  return null;
}
