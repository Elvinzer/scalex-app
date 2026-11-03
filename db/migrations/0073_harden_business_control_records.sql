-- Custom SQL migration file, put your code below! --
-- Billing, referral money and usage ledgers are server-maintained projections.
-- Recovery permits an owner to read billing, never to grant a paid entitlement.
REVOKE ALL ON public.subscriptions, public.subscription_plans, public.referral_codes,
  public.referral_attributions, public.referral_commissions, public.referral_payouts,
  public.referral_program_settings, public.shared_agent_usage, public.agent_token_usage
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.subscriptions, public.subscription_plans, public.referral_codes,
  public.referral_attributions, public.referral_commissions, public.referral_payouts,
  public.referral_program_settings, public.shared_agent_usage, public.agent_token_usage
  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions, public.subscription_plans,
  public.referral_codes, public.referral_attributions, public.referral_commissions,
  public.referral_payouts, public.referral_program_settings, public.shared_agent_usage,
  public.agent_token_usage TO service_role;
--> statement-breakpoint
-- Referrals intentionally connect two different businesses. Their two account
-- columns are not duplicate scope columns like leads.user_id/account_id.
DROP TRIGGER IF EXISTS enforce_business_references ON public.referral_attributions;
DROP TRIGGER IF EXISTS enforce_business_references ON public.referral_commissions;
DROP POLICY business_scope_gate ON public.referral_attributions;
DROP POLICY business_scope_gate ON public.referral_commissions;
CREATE POLICY business_scope_gate ON public.referral_attributions AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (public.business_owner(referrer_account_id) AND public.business_billing_active(referrer_account_id))
  WITH CHECK (public.business_owner(referrer_account_id) AND public.business_billing_active(referrer_account_id));
CREATE POLICY business_scope_gate ON public.referral_commissions AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (public.business_owner(referrer_account_id) AND public.business_billing_active(referrer_account_id))
  WITH CHECK (public.business_owner(referrer_account_id) AND public.business_billing_active(referrer_account_id));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.enforce_referral_business_references() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE referrer uuid; referred uuid; referrer_owner uuid; referred_owner uuid;
BEGIN
  SELECT owner_user_id INTO referrer_owner FROM public.businesses WHERE id=NEW.referrer_account_id;
  SELECT owner_user_id INTO referred_owner FROM public.businesses WHERE id=NEW.referred_account_id;
  IF referrer_owner=referred_owner THEN
    RAISE EXCEPTION 'A business owner cannot refer their own business' USING ERRCODE='23514';
  END IF;
  IF TG_TABLE_NAME='referral_attributions' THEN
    SELECT account_id INTO referrer FROM public.referral_codes WHERE id=NEW.referral_code_id;
    IF referrer IS DISTINCT FROM NEW.referrer_account_id THEN
      RAISE EXCEPTION 'The referral code belongs to another business' USING ERRCODE='23514';
    END IF;
  ELSE
    SELECT referrer_account_id,referred_account_id INTO referrer,referred
      FROM public.referral_attributions WHERE id=NEW.attribution_id;
    IF referrer IS DISTINCT FROM NEW.referrer_account_id OR referred IS DISTINCT FROM NEW.referred_account_id THEN
      RAISE EXCEPTION 'The commission does not match its attribution' USING ERRCODE='23514';
    END IF;
    IF NEW.payout_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.referral_payouts p WHERE p.id=NEW.payout_id AND p.referrer_account_id=NEW.referrer_account_id
    ) THEN
      RAISE EXCEPTION 'The payout belongs to another business' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.enforce_referral_business_references() FROM PUBLIC;
CREATE TRIGGER enforce_referral_business_references BEFORE INSERT OR UPDATE ON public.referral_attributions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_referral_business_references();
CREATE TRIGGER enforce_referral_business_references BEFORE INSERT OR UPDATE ON public.referral_commissions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_referral_business_references();
--> statement-breakpoint
-- Older projections may already have the customer when the owner mirror does
-- not. Preserve that identity instead of creating a second Stripe customer.
UPDATE public.businesses b SET stripe_customer_id=s.stripe_customer_id
  FROM public.subscriptions s WHERE s.user_id=b.id AND b.stripe_customer_id IS NULL;
