-- Alicerce first-party product analytics.
-- Stores opt-in, low-detail usage events only. No amount, category,
-- description, contact, email, transaction payload or device fingerprint.
begin;

create table public.alicerce_product_events (
  event_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_name text not null
    check (event_name in ('app_opened', 'movement_created', 'first_movement_created')),
  created_at timestamptz not null default now()
);

alter table public.alicerce_product_events enable row level security;

revoke all privileges
  on table public.alicerce_product_events
  from public, anon, authenticated;

grant select, insert, delete
  on table public.alicerce_product_events
  to service_role;

create index alicerce_product_events_name_created_idx
  on public.alicerce_product_events (event_name, created_at desc);

create index alicerce_product_events_user_created_idx
  on public.alicerce_product_events (user_id, created_at desc);

create unique index alicerce_product_events_first_movement_once_idx
  on public.alicerce_product_events (user_id)
  where event_name = 'first_movement_created';

comment on table public.alicerce_product_events is
  'Opt-in, low-detail product usage events. No financial values, transaction details, contact data, email or event properties. RLS enabled; only the authenticated analytics Edge Function service role can access it.';

comment on column public.alicerce_product_events.user_id is
  'Pseudonymous Auth user key used only for deduplication and aggregate active-user metrics; never returned to agent clients.';

comment on column public.alicerce_product_events.event_name is
  'Allowlisted product lifecycle event; event payloads and financial data are intentionally not stored.';

commit;
