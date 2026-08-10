export function metaAdsErrorMessage(value: unknown): string | null {
  if (value === "config") {
    return "Meta Ads n’est pas configuré sur cet environnement. Ajoute META_APP_ID et META_APP_SECRET, puis redémarre l’application. Les credentials INSTAGRAM_* du flow Instagram Login ne conviennent pas au Marketing API.";
  }
  if (value === "ads_read") {
    return "Meta n’a pas accordé la permission de lecture des publicités. Reconnecte Meta Ads et accepte ads_read.";
  }
  if (value === "redirect_uri") {
    return "Meta a refusé l’URL de retour. Vérifie que l’URL exacte /api/meta-ads/callback est déclarée dans les réglages OAuth de l’application.";
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
  if (value === "server") {
    return "Meta a répondu correctement, mais Scale X n’a pas pu enregistrer la connexion. Vérifie les logs du serveur puis réessaie.";
  }
  if (value === "oauth") {
    return "La connexion Meta Ads n’a pas abouti. Réessaie depuis cette page.";
  }
  return null;
}
