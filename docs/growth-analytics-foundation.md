# Fundação de eventos de produto do Alicerce

## Objetivo

Preparar uma fonte própria e mínima de eventos para as agentes de crescimento. Esta etapa não instala nem envia dados para Metabase, PostHog, Buffer, Brevo, GrowthBook, n8n ou Plane. Primeiro estabelece a origem segura dos indicadores.

## Eventos permitidos

- `app_opened`: abertura do aplicativo com sessão autenticada.
- `financial_record_created`: criação de um lançamento pelo fluxo existente.
- `first_movement_created`: primeira movimentação registrada na conta, conforme a coleção de movimentos já carregada pelo aplicativo.

O navegador envia somente `event_name` e um `event_id` aleatório. Não envia user_id, e-mail, telefone, valores, datas do lançamento, categorias, descrições, cartões ou conteúdo financeiro.

## Consentimento e exclusão

O compartilhamento começa desligado. A pessoa o ativa em Configurações. A preferência é salva em `alicerce_data/settings`. A Edge Function verifica essa preferência no servidor antes de aceitar cada evento; não confia apenas no estado do navegador.

Ao desativar, o Alicerce grava primeiro a preferência desligada e solicita a exclusão dos eventos anteriores vinculados à conta autenticada. A Edge Function deriva o user_id do JWT validado e não aceita um identificador de usuário enviado pelo navegador.

## Segurança

- A Edge Function exige JWT e valida a sessão com Supabase Auth.
- O banco mantém RLS ativo na tabela de eventos.
- `anon` e `authenticated` não recebem privilégios diretos na tabela de eventos.
- Somente a Edge Function utiliza `service_role`.
- A lista de nomes de eventos é allowlist fechada.
- O payload rejeita propriedades adicionais.
- O limite inicial é de 120 eventos por conta por hora.
- Os resultados entregues às agentes devem ser agregados; nunca retornar user_id ou eventos individuais.

## Limites desta etapa

Os eventos ainda não significam que todos os indicadores estejam disponíveis. CAC, LTV, ROI, ROAS, CPL, churn, ticket, receita atribuída e conversão de todas as etapas exigem instrumentação e fontes contábeis/de aquisição próprias. Os relatórios não devem estimar os componentes ausentes.
