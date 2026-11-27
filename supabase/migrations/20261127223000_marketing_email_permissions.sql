-- Separate, opt-in promotional email permission. No historical opt-in is inferred.
create table public.marketing_email_consent_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  granted boolean not null,
  policy_version text not null check (policy_version = '2026-11-27-v1'),
  recorded_at timestamptz not null default clock_timestamp()
);
alter table public.marketing_email_consent_events enable row level security;
revoke all on public.marketing_email_consent_events from public, anon, authenticated;
grant select on public.marketing_email_consent_events to authenticated;
grant insert (user_id, granted, policy_version) on public.marketing_email_consent_events to authenticated;
create policy marketing_read_own on public.marketing_email_consent_events for select to authenticated using ((select auth.uid()) = user_id);
create policy marketing_append_own on public.marketing_email_consent_events for insert to authenticated with check ((select auth.uid()) = user_id);
create index marketing_consent_latest on public.marketing_email_consent_events (user_id, id desc);

-- Manual suppression for email replies requesting removal, complaints or bounces.
-- Only privileged backend/operators may maintain it, never browser clients.
create table public.marketing_email_suppressions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reason text not null check (reason in ('unsubscribe','complaint','bounce')),
  recorded_at timestamptz not null default clock_timestamp()
);
alter table public.marketing_email_suppressions enable row level security;
revoke all on public.marketing_email_suppressions from public, anon, authenticated;
-- Read with a privileged backend only. Filter eligible subscriptions separately.
-- A user must explicitly opt in, and must not be suppressed.
create view public.marketing_email_eligible with (security_invoker = true) as
select e.user_id, e.recorded_at, e.policy_version
from (select distinct on (user_id) user_id, granted, recorded_at, policy_version
      from public.marketing_email_consent_events order by user_id, id desc) e
where e.granted and not exists (
  select 1 from public.marketing_email_suppressions s where s.user_id=e.user_id
);
revoke all on public.marketing_email_eligible from public, anon, authenticated;
grant select on public.marketing_email_eligible to service_role;
