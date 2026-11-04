create table if not exists public.alicia_action_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('reminder.create','reminder.update','reminder.complete','reminder.delete')),
  risk text not null check (risk in ('low','medium')),
  target_id text,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

alter table public.alicia_action_logs enable row level security;
drop policy if exists alicia_action_logs_owner_read on public.alicia_action_logs;
create policy alicia_action_logs_owner_read on public.alicia_action_logs
  for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.alicia_action_logs from anon;
grant select on public.alicia_action_logs to authenticated;
grant all on public.alicia_action_logs to service_role;

create or replace function public.alicia_mutate_commitments(
  p_user_id uuid,
  p_action text,
  p_reminder jsonb default '{}'::jsonb,
  p_reminder_id text default null,
  p_occurrence_date date default null,
  p_idempotency_key text default null,
  p_confirmed boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_inserted integer;
  v_data jsonb;
  v_next jsonb;
  v_existing jsonb;
  v_item jsonb;
  v_done jsonb;
  v_description text;
  v_date text;
  v_time text;
  v_details text;
  v_repeat text;
  v_alerts jsonb;
  v_target_id text;
  v_minutes integer;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'Usuário obrigatório.' using errcode = '22023';
  end if;
  if p_action not in ('reminder.create','reminder.update','reminder.complete','reminder.delete') then
    raise exception 'Ação não permitida.' using errcode = '22023';
  end if;
  if coalesce(length(trim(p_idempotency_key)), 0) < 8 or length(p_idempotency_key) > 128 then
    raise exception 'Chave de idempotência inválida.' using errcode = '22023';
  end if;
  if p_action = 'reminder.delete' and p_confirmed is not true then
    raise exception 'Exclusão exige confirmação explícita.' using errcode = '42501';
  end if;

  insert into public.alicia_action_logs(user_id, action, risk, target_id, idempotency_key)
  values (p_user_id, p_action, case when p_action = 'reminder.delete' then 'medium' else 'low' end,
          nullif(trim(p_reminder_id), ''), trim(p_idempotency_key))
  on conflict (user_id, idempotency_key) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    select target_id into v_target_id
      from public.alicia_action_logs
     where user_id = p_user_id and idempotency_key = trim(p_idempotency_key);
    return jsonb_build_object('ok', true, 'duplicate', true, 'action', p_action, 'reminder_id', v_target_id);
  end if;

  insert into public.alicerce_data(user_id, store_name, data, updated_at)
  values (p_user_id, 'commitments', '[]'::jsonb, now())
  on conflict (user_id, store_name) do nothing;

  select coalesce(data, '[]'::jsonb)
    into v_data
    from public.alicerce_data
   where user_id = p_user_id and store_name = 'commitments'
   for update;

  if jsonb_typeof(v_data) <> 'array' then
    raise exception 'Formato de compromissos inválido; nenhum dado foi alterado.' using errcode = '22023';
  end if;

  if p_action = 'reminder.create' then
    v_description := trim(coalesce(p_reminder->>'descricao', ''));
    v_date := trim(coalesce(p_reminder->>'data', ''));
    v_time := trim(coalesce(p_reminder->>'hora', ''));
    v_details := trim(coalesce(p_reminder->>'detalhes', ''));
    v_repeat := coalesce(nullif(trim(p_reminder->>'repeticao'), ''), 'nenhuma');
    v_alerts := coalesce(p_reminder->'avisos', '[0]'::jsonb);

    if v_description = '' or length(v_description) > 180 then
      raise exception 'Descrição do lembrete inválida.' using errcode = '22023';
    end if;
    if v_date !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'Data do lembrete inválida.' using errcode = '22023';
    end if;
    perform v_date::date;
    if v_time <> '' and (v_time !~ '^\d{2}:\d{2}$' or split_part(v_time, ':', 1)::integer > 23 or split_part(v_time, ':', 2)::integer > 59) then
      raise exception 'Horário do lembrete inválido.' using errcode = '22023';
    end if;
    if length(v_details) > 2000 or v_repeat not in ('nenhuma','diaria','semanal','mensal','anual') then
      raise exception 'Detalhes ou repetição inválidos.' using errcode = '22023';
    end if;
    if jsonb_typeof(v_alerts) <> 'array' or jsonb_array_length(v_alerts) > 5 then
      raise exception 'Avisos inválidos.' using errcode = '22023';
    end if;
    for v_minutes in select value::text::integer from jsonb_array_elements(v_alerts)
    loop
      if v_minutes not in (0,10,60,1440,10080) then
        raise exception 'Intervalo de aviso não permitido.' using errcode = '22023';
      end if;
    end loop;

    v_item := jsonb_build_object(
      'id', gen_random_uuid()::text,
      'userId', p_user_id::text,
      'tipo', 'lembrete',
      'descricao', v_description,
      'valor', null,
      'data', v_date,
      'hora', v_time,
      'detalhes', v_details,
      'repeticao', v_repeat,
      'avisos', v_alerts,
      'feitos', '[]'::jsonb,
      'status', 'pendente'
    );
    v_next := v_data || jsonb_build_array(v_item);
    v_target_id := v_item->>'id';

  elsif p_action in ('reminder.update','reminder.complete','reminder.delete') then
    v_target_id := nullif(trim(p_reminder_id), '');
    if v_target_id is null then
      raise exception 'Identificador do lembrete obrigatório.' using errcode = '22023';
    end if;

    select value into v_existing
      from jsonb_array_elements(v_data) as rows(value)
     where value->>'id' = v_target_id and value->>'tipo' = 'lembrete'
     limit 1;

    if v_existing is null then
      raise exception 'Lembrete não encontrado nesta conta.' using errcode = 'P0002';
    end if;

    if p_action = 'reminder.delete' then
      select coalesce(jsonb_agg(value order by ordinality), '[]'::jsonb)
        into v_next
        from jsonb_array_elements(v_data) with ordinality as rows(value, ordinality)
       where value->>'id' <> v_target_id;

    elsif p_action = 'reminder.complete' then
      if p_occurrence_date is null then
        raise exception 'Data da conclusão obrigatória.' using errcode = '22023';
      end if;
      v_done := case when jsonb_typeof(v_existing->'feitos') = 'array' then v_existing->'feitos' else '[]'::jsonb end;
      if not (v_done ? p_occurrence_date::text) then
        v_done := v_done || jsonb_build_array(p_occurrence_date::text);
      end if;
      select coalesce(jsonb_agg(
        case when value->>'id' = v_target_id
          then jsonb_set(v_existing, '{feitos}', v_done, true)
          else value
        end order by ordinality
      ), '[]'::jsonb)
        into v_next
        from jsonb_array_elements(v_data) with ordinality as rows(value, ordinality);

    else
      v_description := trim(coalesce(p_reminder->>'descricao', v_existing->>'descricao', ''));
      v_date := trim(coalesce(p_reminder->>'data', v_existing->>'data', ''));
      v_time := trim(coalesce(p_reminder->>'hora', v_existing->>'hora', ''));
      v_details := trim(coalesce(p_reminder->>'detalhes', v_existing->>'detalhes', ''));
      v_repeat := coalesce(nullif(trim(p_reminder->>'repeticao'), ''), v_existing->>'repeticao', 'nenhuma');
      v_alerts := coalesce(p_reminder->'avisos', v_existing->'avisos', '[0]'::jsonb);
      if v_description = '' or length(v_description) > 180 or v_date !~ '^\d{4}-\d{2}-\d{2}$' then
        raise exception 'Descrição ou data inválida.' using errcode = '22023';
      end if;
      perform v_date::date;
      if v_time <> '' and (v_time !~ '^\d{2}:\d{2}$' or split_part(v_time, ':', 1)::integer > 23 or split_part(v_time, ':', 2)::integer > 59) then
        raise exception 'Horário inválido.' using errcode = '22023';
      end if;
      if length(v_details) > 2000 or v_repeat not in ('nenhuma','diaria','semanal','mensal','anual') or jsonb_typeof(v_alerts) <> 'array' or jsonb_array_length(v_alerts) > 5 then
        raise exception 'Dados do lembrete inválidos.' using errcode = '22023';
      end if;
      for v_minutes in select value::text::integer from jsonb_array_elements(v_alerts)
      loop
        if v_minutes not in (0,10,60,1440,10080) then
          raise exception 'Intervalo de aviso não permitido.' using errcode = '22023';
        end if;
      end loop;
      v_item := v_existing || jsonb_build_object(
        'descricao', v_description, 'data', v_date, 'hora', v_time,
        'detalhes', v_details, 'repeticao', v_repeat, 'avisos', v_alerts
      );
      select coalesce(jsonb_agg(
        case when value->>'id' = v_target_id then v_item else value end
        order by ordinality
      ), '[]'::jsonb)
        into v_next
        from jsonb_array_elements(v_data) with ordinality as rows(value, ordinality);
    end if;
  end if;

  update public.alicerce_data
     set data = v_next, updated_at = now()
   where user_id = p_user_id and store_name = 'commitments';

  update public.alicia_action_logs
     set target_id = v_target_id
   where user_id = p_user_id and idempotency_key = trim(p_idempotency_key);

  return jsonb_build_object('ok', true, 'action', p_action, 'reminder_id', v_target_id);
end;
$function$;

revoke all on function public.alicia_mutate_commitments(uuid,text,jsonb,text,date,text,boolean) from public, anon, authenticated;
grant execute on function public.alicia_mutate_commitments(uuid,text,jsonb,text,date,text,boolean) to service_role;
