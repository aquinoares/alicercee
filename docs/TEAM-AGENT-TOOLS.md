# Ferramentas de aquisição da Casa Alicerce

## Objetivo

Entregar às cinco agentes somente indicadores agregados que já existem no Supabase, sem novo banco, servidor, API de terceiros ou migração.

## Execução

`ia-executar` consulta uma vez a função autenticada `alicerce-team-insights`. O módulo `tool-router.js` normaliza uma lista de campos permitidos e roteia os resultados para cada agente antes da chamada ao modelo. As ferramentas desta primeira etapa são consultas somente leitura e pré-executadas pelo servidor; o modelo não recebe credenciais nem pode escrever no banco.

## Matriz de acesso

| Agente | Ferramentas |
|---|---|
| Hera | Totais de clientes; inventário de anúncios do app; tráfego interno; indicações; qualidade dos dados |
| Tali | Todas as ferramentas agregadas |
| Aline | Totais; inventário; tráfego interno; indicações; uso com opt-in; qualidade |
| Mali | Inventário de anúncios do app; tráfego interno; qualidade |
| Alícia | Totais; uso com opt-in; qualidade |

## Limites conhecidos das fontes

- `customer_ads` registra anúncios publicados/cadastrados dentro do aplicativo. Não é comprovante de gasto em Meta Ads, Google Ads ou outra mídia externa.
- `ad_traffic_events` conta eventos de visualização e clique. Não equivale a pessoas únicas nem identifica por si só a origem externa do conteúdo.
- `referrals` conta indicações que foram efetivamente gravadas. Perfis e códigos de convite não são indicações convertidas.
- `alicerce_product_events` contém somente contas que aceitaram o compartilhamento opcional de eventos.
- A fonte atual não tem gasto de mídia, leads capturados, pedidos ou receita atribuída. CAC, CPL, ROI, ROAS e conversão de ponta a ponta não devem ser inventados.

## Privacidade

Nenhum nome, e-mail, telefone, contato, identificador de usuário, identificador de visitante ou conteúdo individual de anúncio é encaminhado às agentes. A camada roteia exclusivamente números agregados e limitações. Nenhuma ferramenta de envio, publicação, alteração de preço, assinatura ou contato com clientes é liberada.

## Testes

Execute:

```bash
node --test tests/agent-acquisition-tools.test.js
```

## Próxima fase separada

A base atual não possui uma tabela dedicada a leads de marketing nem campos de origem UTM na trilha de eventos consultada. A captura de novos leads, a atribuição de links compartilhados e a eventual importação de uma base antiga exigem desenho próprio de consentimento, deduplicação, retenção e acesso administrativo. Esta mudança não cria nem inventa esses registros.
