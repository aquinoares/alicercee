# Destino e ciclo dos alertas internos

**Somente especificação. Não implantado. Nenhuma tabela/migration criada.**

Configuração proposta em segredos de servidor:
- `ALICIA_SAFETY_ALERT_CHANNEL`: `email` ou `webhook`.
- `ALICIA_SAFETY_ALERT_RECIPIENT`: endereço ou URL privada do responsável.
- `ALICIA_SAFETY_ALERT_SECRET`: segredo do provedor, quando aplicável.

Nenhum destinatário foi inventado ou configurado.

Payload mínimo previsto: `event_code`, `risk_level` (`medium`/`high`) e `occurred_at` (ISO-8601 UTC). Não enviar mensagem, transcrição, áudio, nome, CPF, telefone, saldo, dívida, cartão ou histórico.

Ciclo de tratamento:
- `seen_at`: horário em que o responsável visualiza o alerta.
- `handled_at`: horário em que conclui o encaminhamento.

A função atual registra um código em `logs_ia`, mas os campos de visualização/tratamento e o schema real precisam ser confirmados. Antes de persistir esses horários, apresentar a alteração mínima para aprovação.

Não implantar `alicia-safety-alert`, não preencher destinatário/URL real e não criar tabela, coluna, trigger, policy ou migration até aprovação explícita.