-- HERA: temporary Pro access and minimal commercial lead capture.
-- Promotional grants live separately from subscriptions and never replace paid plans.
BEGIN;

CREATE TABLE IF NOT EXISTS public.temporary_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'pro' CHECK (plan = 'pro'),
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 5 AND 500),
  source text NOT NULL DEFAULT 'hera' CHECK (source = 'hera'),
  granted_by uuid NOT NULL REFERENCES auth.users(id),
  revoked_at timestamptz,
  revoked_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > starts_at)
);

CREATE INDEX IF NOT EXISTS temporary_access_grants_user_expiry_idx
  ON public.temporary_access_grants (user_id, expires_at DESC);

ALTER TABLE public.temporary_access_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.temporary_access_grants FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.temporary_access_grants TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.temporary_access_grants TO service_role;

DROP POLICY IF EXISTS temporary_access_grants_read_own
  ON public.temporary_access_grants;
CREATE POLICY temporary_access_grants_read_own
  ON public.temporary_access_grants
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

-- Serialize grants per user; refuse active paid plans and overlapping promotions.
CREATE OR REPLACE FUNCTION public.grant_temporary_pro_access(
  p_user_id uuid,
  p_days integer,
  p_reason text,
  p_granted_by uuid
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  plan text,
  starts_at timestamptz,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_now timestamptz := pg_catalog.now();
  v_grant public.temporary_access_grants;
BEGIN
  IF p_user_id IS NULL OR p_granted_by IS NULL THEN
    RAISE EXCEPTION 'INVALID_ACTOR_OR_USER';
  END IF;
  IF p_days IS NULL OR p_days < 1 OR p_days > 30 THEN
    RAISE EXCEPTION 'INVALID_GRANT_DAYS';
  END IF;
  IF p_reason IS NULL OR pg_catalog.char_length(pg_catalog.btrim(p_reason)) < 5
     OR pg_catalog.char_length(pg_catalog.btrim(p_reason)) > 500 THEN
    RAISE EXCEPTION 'INVALID_GRANT_REASON';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text, 0)
  );

  IF EXISTS (
    SELECT 1 FROM public.subscriptions AS s
    WHERE s.user_id = p_user_id
      AND s.status = 'active'
      AND s.plan IN ('pro', 'vip', 'infinit', 'trial')
      AND (s.expires_at IS NULL OR s.expires_at > v_now)
  ) THEN
    RAISE EXCEPTION 'ACTIVE_PAID_SUBSCRIPTION';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.temporary_access_grants AS g
    WHERE g.user_id = p_user_id
      AND g.revoked_at IS NULL
      AND g.starts_at <= v_now
      AND g.expires_at > v_now
  ) THEN
    RAISE EXCEPTION 'ACTIVE_TEMPORARY_GRANT';
  END IF;

  INSERT INTO public.temporary_access_grants (
    user_id, plan, starts_at, expires_at, reason, source, granted_by
  )
  VALUES (
    p_user_id, 'pro', v_now, v_now + (p_days * interval '1 day'),
    pg_catalog.btrim(p_reason), 'hera', p_granted_by
  )
  RETURNING * INTO v_grant;

  RETURN QUERY
  SELECT v_grant.id, v_grant.user_id, v_grant.plan,
         v_grant.starts_at, v_grant.expires_at;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_temporary_pro_access(uuid, integer, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_temporary_pro_access(uuid, integer, text, uuid)
  TO service_role;

CREATE TABLE IF NOT EXISTS public.commercial_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  email text NOT NULL UNIQUE,
  interested_plan text NOT NULL DEFAULT 'unknown'
    CHECK (interested_plan IN ('normal', 'pro', 'infinit', 'unknown')),
  source text NOT NULL DEFAULT 'hera' CHECK (source = 'hera'),
  contact_consent boolean NOT NULL DEFAULT false,
  consent_recorded_at timestamptz,
  email_subject text,
  email_body text,
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'contacted', 'converted', 'not_interested', 'do_not_contact')),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  updated_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (email = pg_catalog.lower(pg_catalog.btrim(email))),
  CHECK (
    (contact_consent = false AND consent_recorded_at IS NULL)
    OR (contact_consent = true AND consent_recorded_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS commercial_leads_updated_at_idx
  ON public.commercial_leads (updated_at DESC);

ALTER TABLE public.commercial_leads ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.commercial_leads FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.commercial_leads TO service_role;

COMMIT;
