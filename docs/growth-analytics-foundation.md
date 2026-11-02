# Fundação de eventos de produto do Alicerce

## Objetivo

Preparar uma fonte própria e mínima de eventos para as agentes de crescimento. Esta etapa não instala nem envia dados para Metabase, PostHog, Buffer, Brevo, GrowthBook, n8n ou Plane. Primeiro estabelece a origem segura dos indicadores.

## Eventos permitidos

- `app_opened`: abertura do aplicativo com sessão autenticada.
- `movement_created`: criação de um registro financeiro por lançamento manual/assistido (`Store.addMovement`) ou por compra no cartão/parcelamento (`Store.addInstallment`).
- `first_movement_created`: primeiro registro financeiro da conta, considerando conjuntamente as coleções `movements` e `installments`; não depende de a pessoa começar por um gasto manual.

O navegador envia somente `event_name` e um `event_id` aleatório. Não envia user_id, e-mail, telefone, valores, datas do lançamento, categorias, descrições, cartões ou conteúdo financeiro. Após validar o JWT, a Edge Function associa o evento ao user_id da sessão; essa associação é necessária para métricas agregadas, deduplicação e exclusão dos dados ao revogar o consentimento.

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

## Publicação da Edge Function

A função usa uma allowlist de origens. Os padrões incluem o domínio principal conhecido do Alicerce e os endereços locais de desenvolvimento/teste. Para uma URL de preview ou um domínio adicional, configure o segredo de ambiente `ALICERCE_ANALYTICS_ALLOWED_ORIGINS` no Supabase com as origens exatas separadas por vírgula (protocolo + host + porta, sem caminho). Não use curingas.

A migração SQL precisa ser aplicada antes da implantação da função. Depois, implante `alicerce-analytics-events` com JWT obrigatório e confira os logs de OPTIONS/POST. Esta PR apenas versiona a migração e a função; não altera o projeto de produção.

## Limites desta etapa

Os eventos ainda não significam que todos os indicadores estejam disponíveis. CAC, LTV, ROI, ROAS, CPL, churn, ticket, receita atribuída e conversão de todas as etapas exigem instrumentação e fontes contábeis/de aquisição próprias. Os relatórios não devem estimar os componentes ausentes.
