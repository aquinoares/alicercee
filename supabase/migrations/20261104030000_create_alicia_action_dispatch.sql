create table if not exists public.alicia_action_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('reminder.create','reminder.update','reminder.complete','reminder.delete')),
  risk text not null check (risk in ('low','medium')),
  target_id text,
  idempotency_key text not null,
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

alter table public.alicia_action_logs enable row level security;

drop policy if exists alicia_action_logs_owner_read on public.alicia_action_logs;
create policy alicia_action_logs_owner_read on public.alicia_action_logs
  for select to authenticated
  using ((select auth.uid()) = user_id);

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
  p_request_fingerprint text default null,
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
  v_existing_action text;
  v_existing_fingerprint text;
  v_initial_date date;
  v_expected_day integer;
  v_month_end integer;
  v_repeat_rule text;
  v_alert_item jsonb;
  v_reminder_count integer;
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

  if coalesce(p_request_fingerprint, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'Impressão digital da ação inválida.' using errcode = '22023';
  end if;

  if p_action = 'reminder.delete' and p_confirmed is not true then
    raise exception 'Exclusão exige confirmação explícita.' using errcode = '42501';
  end if;

  insert into public.alicia_action_logs(
    user_id, action, risk, target_id, idempotency_key, request_fingerprint
  )
  values (
    p_user_id,
    p_action,
    case when p_action = 'reminder.delete' then 'medium' else 'low' end,
    nullif(trim(p_reminder_id), ''),
    trim(p_idempotency_key),
    p_request_fingerprint
  )
  on conflict (user_id, idempotency_key) do nothing;

  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    select target_id, action, request_fingerprint
      into v_target_id, v_existing_action, v_existing_fingerprint
      from public.alicia_action_logs
     where user_id = p_user_id
       and idempotency_key = trim(p_idempotency_key);

    if v_existing_action <> p_action or v_existing_fingerprint <> p_request_fingerprint then
      raise exception 'A chave de idempotência já foi usada para outra ação ou conteúdo.'
        using errcode = '23505';
    end if;

    return jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'action', p_action,
      'reminder_id', v_target_id
    );
  end if;

  insert into public.alicerce_data(user_id, store_name, data, updated_at)
  values (p_user_id, 'commitments', '[]'::jsonb, now())
  on conflict (user_id, store_name) do nothing;

  select coalesce(data, '[]'::jsonb)
    into v_data
    from public.alicerce_data
   where user_id = p_user_id
     and store_name = 'commitments'
   for update;

  if jsonb_typeof(v_data) <> 'array' then
    raise exception 'Formato de compromissos inválido; nenhum dado foi alterado.'
      using errcode = '22023';
  end if;

  select count(*) into v_reminder_count
    from jsonb_array_elements(v_data) as rows(value)
   where value->>'tipo' = 'lembrete';

  if p_action = 'reminder.create' and v_reminder_count >= 300 then
    raise exception 'Sua agenda já atingiu o limite de lembretes ativos e históricos.'
      using errcode = '54000';
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
    if v_date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'Data do lembrete inválida.' using errcode = '22023';
    end if;
    perform v_date::date;
    if v_time <> '' and (
      v_time !~ '^[0-9]{2}:[0-9]{2}$'
      or split_part(v_time, ':', 1)::integer > 23
      or split_part(v_time, ':', 2)::integer > 59
    ) then
      raise exception 'Horário do lembrete inválido.' using errcode = '22023';
    end if;
    if length(v_details) > 2000 or v_repeat not in ('nenhuma','diaria','semanal','mensal','anual') then
      raise exception 'Detalhes ou repetição inválidos.' using errcode = '22023';
    end if;
    if jsonb_typeof(v_alerts) <> 'array' or jsonb_array_length(v_alerts) > 5 then
      raise exception 'Avisos inválidos.' using errcode = '22023';
    end if;

    for v_alert_item in select value from jsonb_array_elements(v_alerts)
    loop
      if jsonb_typeof(v_alert_item) <> 'number'
        or (v_alert_item #>> '{}') not in ('0','10','60','1440','10080') then
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
     where value->>'id' = v_target_id
       and value->>'tipo' = 'lembrete'
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

      v_initial_date := (v_existing->>'data')::date;
      v_repeat_rule := coalesce(nullif(v_existing->>'repeticao', ''), 'nenhuma');

      if p_occurrence_date < v_initial_date then
        raise exception 'Não é possível concluir uma ocorrência anterior ao lembrete.'
          using errcode = '22023';
      end if;

      if v_repeat_rule = 'nenhuma' and p_occurrence_date <> v_initial_date then
        raise exception 'A data não corresponde ao lembrete.' using errcode = '22023';
      elsif v_repeat_rule = 'semanal'
        and extract(dow from p_occurrence_date) <> extract(dow from v_initial_date) then
        raise exception 'A data não corresponde à repetição semanal.' using errcode = '22023';
      elsif v_repeat_rule = 'mensal' then
        v_month_end := extract(day from (
          date_trunc('month', p_occurrence_date::timestamp) + interval '1 month - 1 day'
        ))::integer;
        v_expected_day := least(extract(day from v_initial_date)::integer, v_month_end);
        if extract(day from p_occurrence_date)::integer <> v_expected_day then
          raise exception 'A data não corresponde à repetição mensal.' using errcode = '22023';
        end if;
      elsif v_repeat_rule = 'anual' then
        v_month_end := extract(day from (
          date_trunc('month', p_occurrence_date::timestamp) + interval '1 month - 1 day'
        ))::integer;
        v_expected_day := least(extract(day from v_initial_date)::integer, v_month_end);
        if extract(month from p_occurrence_date)::integer <> extract(month from v_initial_date)::integer
          or extract(day from p_occurrence_date)::integer <> v_expected_day then
          raise exception 'A data não corresponde à repetição anual.' using errcode = '22023';
        end if;
      elsif v_repeat_rule not in ('nenhuma','diaria','semanal','mensal','anual') then
        raise exception 'Regra de repetição inválida.' using errcode = '22023';
      end if;

      v_done := case
        when jsonb_typeof(v_existing->'feitos') = 'array' then v_existing->'feitos'
        else '[]'::jsonb
      end;

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
      v_description := trim(coalesce(nullif(p_reminder->>'descricao', ''), v_existing->>'descricao', ''));
      v_date := trim(coalesce(nullif(p_reminder->>'data', ''), v_existing->>'data', ''));
      v_time := trim(coalesce(p_reminder->>'hora', v_existing->>'hora', ''));
      v_details := trim(coalesce(p_reminder->>'detalhes', v_existing->>'detalhes', ''));
      v_repeat := coalesce(nullif(trim(p_reminder->>'repeticao'), ''), v_existing->>'repeticao', 'nenhuma');
      v_alerts := coalesce(p_reminder->'avisos', v_existing->'avisos', '[0]'::jsonb);

      if v_description = '' or length(v_description) > 180
        or v_date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
        raise exception 'Descrição ou data inválida.' using errcode = '22023';
      end if;
      perform v_date::date;

      if v_time <> '' and (
        v_time !~ '^[0-9]{2}:[0-9]{2}$'
        or split_part(v_time, ':', 1)::integer > 23
        or split_part(v_time, ':', 2)::integer > 59
      ) then
        raise exception 'Horário inválido.' using errcode = '22023';
      end if;
      if length(v_details) > 2000
        or v_repeat not in ('nenhuma','diaria','semanal','mensal','anual')
        or jsonb_typeof(v_alerts) <> 'array'
        or jsonb_array_length(v_alerts) > 5 then
        raise exception 'Dados do lembrete inválidos.' using errcode = '22023';
      end if;

      for v_alert_item in select value from jsonb_array_elements(v_alerts)
      loop
        if jsonb_typeof(v_alert_item) <> 'number'
          or (v_alert_item #>> '{}') not in ('0','10','60','1440','10080') then
          raise exception 'Intervalo de aviso não permitido.' using errcode = '22023';
        end if;
      end loop;

      v_item := v_existing || jsonb_build_object(
        'descricao', v_description,
        'data', v_date,
        'hora', v_time,
        'detalhes', v_details,
        'repeticao', v_repeat,
        'avisos', v_alerts
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
   where user_id = p_user_id
     and store_name = 'commitments';

  update public.alicia_action_logs
     set target_id = v_target_id
   where user_id = p_user_id
     and idempotency_key = trim(p_idempotency_key);

  return jsonb_build_object(
    'ok', true,
    'action', p_action,
    'reminder_id', v_target_id
  );
end;
$function$;

revoke all on function public.alicia_mutate_commitments(uuid,text,jsonb,text,date,text,text,boolean)
  from public, anon, authenticated;
grant execute on function public.alicia_mutate_commitments(uuid,text,jsonb,text,date,text,text,boolean)
  to service_role;
