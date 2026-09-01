# Rapport de migration CRM

La migration `0054_same_falcon.sql` complète le backfill additif commencé par
`0051_organic_whistler.sql`. Elle ne supprime aucune colonne legacy et ne
modifie pas `users.crm_enabled`, qui reste désactivé par défaut.

## Données reprises

- `leads.account_id` est déjà rempli par la migration 0051.
- Les étapes legacy sont projetées vers les cinq étapes CRM. `stage`,
  `lost_reason`, `is_no_show` et `sale_id` restent inchangés.
- Une ligne d'historique CRM est créée pour un lead qui n'en possède pas.
- Les événements de création, de profil, de résultat et de note sont créés
  avec `source = migration` et une clé stable basée sur l'identifiant legacy.
- Une relance legacy devient une action CRM. Son échéance, son auteur et son
  état terminé sont conservés dans la nouvelle ligne ; les colonnes legacy ne
  sont pas effacées.
- Aucun appel historique n'est relié automatiquement : une relation fiable
  doit être confirmée depuis CRM Appels.

Les événements `first_message_sent` ne sont créés que si
`message_occurred_at` existe. Le backfill ne transforme donc pas une date de
création ou de mise à jour en date de message.

## Requêtes de contrôle

```sql
select count(*) as leads_without_account
from leads
where account_id is null;

select crm_stage, crm_outcome, count(*)
from leads
group by crm_stage, crm_outcome
order by crm_stage, crm_outcome;

select count(*) as leads_without_stage_history
from leads l
where not exists (
  select 1 from crm_lead_stage_history h
  where h.account_id = l.account_id and h.lead_id = l.id
);

select count(*) as legacy_reminders_without_crm_action
from leads l
where l.reminder_date is not null
  and not exists (
    select 1 from crm_actions a
    where a.account_id = l.account_id
      and a.idempotency_key = 'legacy-reminder:' || l.id
  );

select count(*) as calls_without_reliable_link
from sales_calls c
where not exists (
  select 1 from crm_call_links l where l.sales_call_id = c.id
);
```

## Rollback et activation progressive

Le rollback fonctionnel consiste à remettre `crm_enabled` à `false` pour le
compte pilote et à conserver les routes legacy. Les lignes `crm_*` restent
disponibles pour l'audit et ne doivent pas être supprimées par un rollback de
flag. Toute correction de données doit passer par une nouvelle migration
additive.

Activation recommandée : vérifier les cinq requêtes sur un compte pilote,
comparer les actions et les ventes avec les anciennes surfaces, activer le flag
pour ce compte, puis élargir progressivement. Les appels non reliés restent
mesurés séparément jusqu'à une association explicite.
