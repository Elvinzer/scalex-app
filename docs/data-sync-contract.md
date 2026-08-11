# Contrat de synchronisation des données métier

Ce contrat formalise les 13 flux qui doivent rester cohérents entre les pages. Les pages peuvent présenter une projection différente (période, filtre ou permission), mais elles ne doivent pas réinventer la source ni le calcul.

| # | Source canonique | Projections raccordées |
|---|---|---|
| 1 | `setting_kpi_entries` + champs Setting de `monthly_metrics` | Datas, check-in Dashboard, Dashboard, Diagnostic, funnel Acquisition, rapport hebdomadaire, Roadmap |
| 2 | `closing_kpi_entries` + champs Closing de `monthly_metrics` | Datas, check-in Dashboard, Dashboard, Diagnostic, funnel Closing, rapport hebdomadaire, Roadmap |
| 3 | `sales_calls` (iClosed, Calendly, manuel) | Suivi d’appel, appels réservés/honorés, Dashboard, Diagnostic, Datas, funnels et Roadmap |
| 4 | `sales` non orphelines | Ventes, CA contracté/encaissé, appels liés, commissions setters, Dashboard, Diagnostic et attribution vidéo |
| 5 | `leads` + `lead_stage_history` | Pipeline, volumes mensuels Datas, Diagnostic, Dashboard, Roadmap et actions de relance |
| 6 | `sales.setter_id` + `setters` + commission de l’offre | Pipeline, liste/détail des setters, ventes et projections de CA/commissions |
| 7 | `content_posts` | Contenu, Dashboard, Diagnostic, recommandations et contexte Falco |
| 8 | `youtube_video_insights` + `instagram_post_insights` | Contenu, rétention Dashboard/Diagnostic et contexte Falco ; les vidéos privées/non listées sont exclues partout |
| 9 | `video_attributions` + `sales` | Ventes, statistiques vidéo, Contenu, gains contenu, Diagnostic et Falco |
| 10 | `email_campaigns` | Mail, agrégat acquisition Diagnostic et contexte Falco |
| 11 | `meta_ad_metrics_daily` au niveau campagne | Meta Ads, agrégat acquisition Diagnostic et contexte Falco |
| 12 | `native_booking_leads` | RDV natifs, centre d’actions de revenu, agrégat acquisition Diagnostic et contexte Falco |
| 13 | Profil business, leviers, découverte et cycle d’amélioration | Business, Diagnostic, Dashboard, Copilote, Roadmap, Journal et starter plans |

## Règles d’implémentation

- Les agrégats partagés vivent dans `lib/diagnostic/aggregate.ts` et sont alimentés par `lib/diagnostic/request-cache.ts`.
- Les métriques d’appel utilisent `isMonthlyCallSourceAvailable()`. Une série composée uniquement d’annulations ne remplace donc pas les données manuelles ou quotidiennes.
- Les ventes non orphelines sont prioritaires pour les ventes conclues et le CA ; les appels et les lignes mensuelles restent des fallback historiques quand aucune vente n’existe.
- Les modifications métier et les synchronisations appellent `revalidateBusinessData()`. Les modifications du Journal appellent `revalidateJournalSurfaces()` pour mettre à jour Journal, Roadmap, Dashboard et Diagnostic ensemble.
- Les lectures répétées d’une même source sont mémorisées au niveau de la requête (`React cache()`), ce qui évite qu’une page composée ou un agent relise plusieurs fois les mêmes lignes.
