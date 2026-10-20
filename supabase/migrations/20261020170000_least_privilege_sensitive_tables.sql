-- Alicerce security hardening
-- Safe to apply after verifying current RLS and grants.
-- The browser client reads subscriptions; privileged writes happen server-side
-- through Edge Functions using server-only credentials.
BEGIN;

REVOKE INSERT, UPDATE, DELETE
  ON TABLE public.subscriptions
  FROM anon, authenticated;

GRANT SELECT
  ON TABLE public.subscriptions
  TO authenticated;

-- This table currently has RLS enabled but no policies, and no direct frontend
-- code accesses it. Keep it server-only until an explicit ownership policy is
-- designed and tested for the WhatsApp linking flow.
REVOKE ALL PRIVILEGES
  ON TABLE public.whatsapp_accounts
  FROM anon, authenticated;

COMMIT;
