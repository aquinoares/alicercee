# Alicia Chat Experience v1 — auditoria e camada isolada

Data: 03/11/2026  
Repositório: aquinoares/alicercee  
Branch: feat/alicia-brain-natural-ptbr-v1  
PR: #15 — permanece em rascunho

## Limites de execução

Esta entrega acrescenta um módulo separado, carregado depois de assets/alicia-brain.js. O núcleo original de crise, o botão "Preciso de ajuda agora" e tests/corpus_cego_3.mjs permanecem intactos. O corpus cego nº 3 não é reescrito nem apresentado como novo teste cego.

Não foi feito merge, deploy, liberação a clientes, migration, criação de tabela, alteração de política RLS, alteração de Edge Function nem operação de leitura/gravação no Supabase.

O módulo financeiro é explicitamente test-only. AliciaExpense.bindTestStore() só aceita um adaptador marcado testOnly: true, com arrays cards/installments e funções addMovement/addInstallmentsBatch. O módulo não liga automaticamente ao Store real, a alicerce_data ou a dados de usuário autenticado. Sem adaptador de teste, a Alicia informa que interpretou a mensagem, mas não registrou nem consultou dados reais.

## Baseline antes da correção

Os dez cenários solicitados foram executados contra o parser anterior, sem alteração prévia. O resultado foi mostrado na conversa antes de editar o código:

| Cenário | Resultado anterior |
|---|---|
| Picolé, cinco reais, dinheiro | O nome do item incluía parte da frase ("Acabei") |
| Resposta informal sobre vontade de comprar picolé | A frase inteira era usada como item |
| R$ 32 no mercado | Não reconhecia o valor |
| R$ 50 de Uber ontem no Pix | Perdia valor e data |
| "comprei um negócio" | Perguntava o valor; comportamento esperado |
| Açaí de R$ 18 no débito | Não reconhecia a intenção de gasto |
| Tênis de R$ 300 em 3x no cartão | Caminho de cartão/parcelas não suportado |
| Parcelas deste mês | Sem rota de consulta no chat |
| Quanto falta pagar do cartão | Sem rota de consulta no chat |
| Adicionar compra no cartão | Sem fluxo para coletar os dados ausentes |

Nenhum lançamento real foi criado para fazer esse baseline.

## Diagnóstico de cartões e parcelas (somente leitura de código e metadados)

O app guarda cards e installments nos arrays do Store, persistidos dentro do registro JSON de public.alicerce_data por user_id. Store.addMovement() e Store.addInstallment() adicionam registros e chamam Store.save().

Existem tabelas SQL separadas public.cards, public.card_purchases, public.payment_cards e public.transactions com RLS habilitado, mas as telas de Cartões examinadas usam Store.cards e Store.installments dentro de alicerce_data. Uma nova consulta a essas tabelas SQL não corrigiria o caminho que as telas atuais usam.

O mês da fatura é filtrado por installments.data, que é a data de vencimento da parcela. dataCompra é metadado da compra original e não serve como filtro do mês de vencimento.

- Store.getCardCurrentInvoice(cardId) calcula o mês alvo com fechamento/vencimento do cartão e filtra installments.data; exclui status pago.
- Store.getCardInvoiceByPeriod(cardId, year, month) filtra installments.data pelo ano/mês.
- Store.getCardMonthTotals(ym, cardId) filtra tipo cartao e o mês de installments.data.
- Store.getCardView()/getCardViewA() agrupam as linhas por compra e consideram as parcelas que vencem no mês.
- renderCartaoDetalhe(), detalhe do cartão e exportação de fatura usam essas estruturas.

Assim, uma compra antiga deve aparecer quando uma das suas parcelas tem vencimento no mês consultado. O código confirma a regra de data/filtro; não prova que uma conta real esteja com os dados corretos. Nenhuma linha de compra ou transação de cliente foi lida e não foi feito teste de acesso RLS com usuário autenticado. A policy inspecionada de alicerce_data é owner-scoped por auth.uid() = user_id.

## Alterações incluídas

### Áudio e interface
- Desativa em runtime os handlers de microfone, reconhecimento de voz e TTS; não apaga as funções legadas.
- Remove do HTML renderizado os botões de microfone e "Ouvir resposta"; mantém o botão de câmera.
- Atualiza o placeholder para "Digite sua mensagem".
- Exibe uma vez por sessão a dica "Dica: toque no microfone do teclado para ditar."
- Inclui aviso de que Alicia é assistente digital, não substitui atendimento profissional nem serviço de emergência, com CVV 188 e SAMU 192.
- O botão "Preciso de ajuda agora" permanece no cérebro original e não foi removido.

### Cuidado e mensagens de segurança
- Após crise, a primeira tentativa de retomar assunto financeiro gera uma única pergunta delicada sobre como a pessoa está e se deseja continuar.
- Se a pessoa insiste em seguir, a próxima solicitação financeira é encaminhada sem repetir o alerta e sem condicionar ajuda financeira.
- O estado fica em memória e expira automaticamente após 30 minutos.
- Cinco variações distintas para acolhimento baixo e cinco para risco médio; as cinco respostas médias mantêm SAMU 192 e CVV 188.
- O caminho de risco alto continua usando a resposta original do cérebro.
- Uma frase ambígua como "minha filha mandou áudio dizendo que vai embora" recebe pergunta curta de contexto, sem presumir crise.

### Gastos
- Parser separado para verbos comuns, números e valores por extenso, "conto", "uns 30", Pix, dinheiro, cartão, crédito/débito, datas relativas e quantidade de parcelas.
- Dicionário inicial com alimentos, transporte, saúde, contas, lazer, vestuário e regionalismos nordestinos.
- Se faltar apenas forma de pagamento, pergunta somente isso. O estado pendente guarda o campo esperado e a próxima mensagem o preenche sem repetir a pergunta.
- Palavras genéricas como "negócio" são convertidas em descrição provisória "Compra", não na frase inteira.
- A categoria desconhecida tem opções de escolha; a opção "Mudar categoria" atualiza o movimento de teste existente, sem criar duplicata.

### Cartão e parcelas
- O modelo distingue cartão de crédito (parcelas futuras em installments) de cartão de débito (despesa paga em movements).
- Compra parcelada no crédito exige prévia e confirmação antes de criar as linhas.
- O adaptador de teste exige inclusão em lote addInstallmentsBatch para não aceitar inclusão parcial.
- Consulta mensal usa data de vencimento, inclui compras antigas com parcela vencendo no mês e usa o cartão correspondente.
- Consulta de fatura segue a regra atual do app: parcela em aberto se status não for pago.
- Se houver mais de um cartão, pergunta qual foi usado; com um cartão só, usa esse cartão sem perguntar.
- Débito solicitado em parcelas pede confirmação para registrar à vista, sem converter silenciosamente.

### Mensagens não entendidas
- Alicia acolhe e pergunta como a pessoa está; pede consentimento antes do registro.
- O registro é local, limitado, sem envio à nuvem e sem user_id.
- Filtros conservadores bloqueiam números, termos financeiros, URLs, identificadores explícitos e contexto comum de familiares/nomes.
- Limitação: heurísticas locais não garantem detectar todo nome escrito integralmente em minúsculas. Não habilitar coleta para clientes sem revisão de privacidade e extração de entidades mais forte.

## Evidências e testes

O arquivo tests/alicia-experience.test.mjs acrescenta testes automatizados de parser, datas, pagamento pendente, categorias, consultas de parcelas e fatura, cartão de crédito/débito, confirmação de compra parcelada, estado de cuidado, crise durante pendência, ambiguidade, variação de respostas, consentimento local e interface sem áudio.

O comando npm run test:brain passa a executar os testes existentes do cérebro junto com os testes isolados da nova camada. Os testes novos usam apenas um adaptador em memória explicitamente marcado testOnly. O resultado do CI será registrado pelo GitHub após o commit.

## O que ainda não foi validado

1. Não havia conta de teste aprovada nem dataset de cartões conectado nesta sessão. Portanto não houve reconciliação end-to-end com as telas e valores reais de Cartões/Empréstimos.
2. A camada financeira não está ligada ao Store de produção; não deve ser tratada como pronta para clientes. O Store real não tem método updateMovement nem addInstallmentsBatch; o adaptador de teste fornece operações próprias.
3. Correção e desfazer só aparecem quando o adaptador de teste implementa os métodos necessários. Não há edição de lançamento em dados reais.
4. Não foi reproduzida falha RLS com usuário autenticado. Se uma conta de teste demonstrar bloqueio, propor policy mínima por auth.uid() = user_id e esperar aprovação; nenhuma chave service-role vai para o navegador.
5. O corpus cego nº 3 já foi revelado e não foi reutilizado como conjunto cego. Seus testes existentes continuam como regressão, sem alegação de nova avaliação cega.
