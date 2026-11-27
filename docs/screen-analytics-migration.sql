-- Migration draft: apply before deploying the analytics Edge Function.
-- No change to RLS, grants or existing event records.
begin;
alter table public.alicerce_product_events drop constraint alicerce_product_events_event_name_check;
alter table public.alicerce_product_events add constraint alicerce_product_events_event_name_check check (event_name in ('app_opened', 'movement_created', 'first_movement_created', 'screen_view_home', 'screen_view_assistente', 'screen_view_visao', 'screen_view_gastos', 'screen_view_cartoes', 'screen_view_emprestimos', 'screen_view_calendario', 'screen_view_beneficios', 'screen_view_insurance', 'screen_view_renda_extra', 'screen_view_financiamento', 'screen_view_consorcio', 'screen_view_planos', 'screen_view_indicacoes', 'screen_view_trafego', 'screen_view_add', 'screen_view_cash_balance'));
commit;
