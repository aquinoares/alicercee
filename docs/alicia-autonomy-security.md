# Alicia — autonomia segura

## Objetivo

A Alicia pode agir dentro do Alicerce, mas não recebe acesso genérico ao banco, ao navegador, a APIs externas ou ao sistema operacional. A autonomia é concedida por uma lista explícita de ações implementadas e validadas no servidor.

## Permissões da primeira versão

| Área | Permissão | Regra |
| --- | --- | --- |
| Consultas financeiras | Ler saldos, gastos, cartões, parcelas e compromissos da própria conta | O Alicerce calcula os valores; a Alicia não inventa nem altera totais |
| Organização | Sugerir classificação e registrar contexto autorizado | Não altera valor, data, status de pagamento ou saldo |
| Despesa | Preparar lançamento | A gravação continua na tela de conferência do Alicerce |
| Lembretes | Listar, criar, reagendar, concluir e excluir lembretes próprios | Criar/reagendar/concluir seguem o pedido; excluir exige confirmação explícita |
| Ações financeiras | Pagamentos, transferências, baixa de parcelas, exclusões ou alteração de valores | Fora do executor autônomo desta versão; permanecem nos fluxos próprios do Alicerce |

Pedidos ambíguos devem gerar uma pergunta objetiva. A Alicia só comunica sucesso depois que o servidor confirma a operação.

## Arquitetura de execução

1. A interface recebe a intenção e encaminha apenas uma ação conhecida.
2. A Edge Function `alicia-actions` valida o JWT e identifica o usuário pela sessão. O cliente nunca escolhe o `user_id`.
3. A função aceita somente as ações `reminder.*` declaradas no dispatcher.
4. A RPC `alicia_mutate_commitments` é executável apenas por `service_role`, valida os dados, bloqueia a linha do store de compromissos durante a alteração e grava o resultado atomicamente.
5. `alicia_action_logs` registra usuário, ação, risco, alvo, data e chave de idempotência; não guarda o texto completo da conversa.
6. O store `commitments` continua no modelo de dados existente do Alicerce, sob RLS por proprietário. Calendário e alertas atuais continuam consumindo esse store.

## Controles obrigatórios

- Autenticação Supabase obrigatória; JWT inválido não executa ações.
- Identidade do usuário derivada exclusivamente de `auth.getUser(token)`.
- RLS nas tabelas privadas e políticas por `auth.uid()`.
- Chave `service_role` somente no servidor.
- Allowlist fechada de ações; nenhuma chamada arbitrária de SQL ou função dinâmica.
- Validação de descrição, data, horário, repetição e intervalos de alerta.
- Idempotência por usuário para impedir criação duplicada em repetição de requisição.
- Confirmação específica antes de exclusão.
- Falha fechada: erro, timeout ou resposta inesperada nunca vira mensagem de sucesso.
- Registros de auditoria sem valores financeiros, conteúdo de mensagens ou segredos.

## Responsabilidade de segurança

HARE, conforme indicado pelo responsável do produto, deve revisar os requisitos, ameaças, testes e mudanças da Alicia. A identidade técnica exata de HARE ainda precisa ser confirmada no inventário de agentes do repositório.

HARE não deve ser a barreira de segurança em tempo de execução. Modelos de linguagem podem errar ou ser induzidos por conteúdo não confiável. A autorização efetiva permanece no código, no JWT, no dispatcher, nas políticas RLS e nas permissões do banco. Nenhum prompt pode ampliar essas permissões.

## Limitações conhecidas

- Lembretes são persistidos na conta e aparecem no calendário e nos alertas do app.
- A infraestrutura atual não tem service worker, Push API, armazenamento de inscrições push nem agendador de notificações. Portanto, não há garantia de aviso com o app fechado ou em segundo plano. Isso é uma entrega separada.
- A lista inicial de ações do servidor contém somente lembretes. Preparação de despesas e consultas continuam usando o motor local e os fluxos de interface já existentes.
- O executor `ia-executar` permanece separado: ele é uma ferramenta administrativa de missões dos agentes, não um executor pessoal de dados financeiros.

## Testes necessários antes de ampliar permissões

- Usuário A não lê nem altera lembretes de usuário B.
- JWT ausente, inválido ou expirado é rejeitado.
- Ação fora da allowlist é rejeitada.
- Data, horário, repetição e alertas inválidos são rejeitados.
- Repetição da mesma chave de idempotência não duplica uma ação.
- Exclusão sem confirmação é rejeitada.
- Erro no banco não retorna sucesso ao chat.
- Alterações de lembrete aparecem no calendário sem substituir compromissos não relacionados.
- Uma despesa preparada não altera saldos até a confirmação no fluxo próprio do Alicerce.
