# Alicerce — Especificação da dimensão de natureza financeira v1

## Objetivo

Separar a árvore de categorias existente da avaliação financeira do lançamento. A categoria responde **onde o dinheiro foi gasto**. As dimensões respondem **qual é a natureza do gasto, que compromisso existe, como ele se repete e quão flexível é**.

Esta camada é analítica. Ela não muda categoria, subcategoria, saldo, caixa, vencimento, fatura ou valor de lançamento.

## Dimensões

| Campo | Valores | O que prova |
|---|---|---|
| \`nature\` | \`essential\`, \`discretionary\`, \`undetermined\` | Impacto de cortar ou adiar, não a existência de dívida |
| \`commitment\` | \`contractual\`, \`non_contractual\`, \`undetermined\` | Obrigação contratual confirmada; não é sinônimo de recorrência |
| \`recurrence\` | \`recurring\`, \`occasional\`, \`undetermined\` | Repetição observada em meses distintos |
| \`behavior\` | \`fixed\`, \`variable\`, \`undetermined\` | Estabilidade do valor mensal; não define a natureza |
| \`flexibility\` | \`low\`, \`medium\`, \`high\`, \`undetermined\` | Possibilidade estimada de adiar, reduzir ou substituir |
| \`context\` | \`work\`, \`health\`, \`family\`, \`housing\`, \`leisure\`, \`convenience\`, \`education\`, \`other\`, \`undetermined\` | Finalidade explicitada ou confirmada |

Cada dimensão tem confiança e evidência próprias. A camada não produz uma única confiança global que esconda incerteza.

## Confirmação explícita pelo usuário

A Visão Financeira oferece uma fila dos gastos do mês atual cuja natureza continua indeterminada. A pessoa pode abrir cada lançamento e confirmar natureza, contexto, flexibilidade e compromisso, ou manter a natureza como indeterminada. Um campo opcional registra uma frase curta de finalidade no campo já existente `purpose` do próprio registro.

A confirmação é persistida em `analysis.expenseProfile` com `source: "user_confirmed"`, validada pela mesma allowlist de dimensões. Para compras no cartão, o perfil é aplicado a todas as parcelas não vinculadas a empréstimo que compartilham o mesmo `compraId`, pois representam a mesma compra. Nenhum valor, data, categoria, subcategoria, status ou saldo é alterado. Recorrência e estabilidade de valores continuam sendo calculadas a partir do histórico, sem serem preenchidas manualmente.

A fila inicial considera somente o período atual e os itens cuja natureza está indeterminada. Ela não obriga a pessoa a classificar um gasto para continuar usando o app.

## Regras de segurança

1. Reutilizar exclusivamente \`Store.getAnalysisEntries()\` como fonte para despesas pessoais analisáveis. Ela já respeita o motor central e exclui registros que não representam consumo.
2. A classificação de categoria e subcategoria permanece intacta. Não criar categorias novas para representar necessidade.
3. Uma correção/perfil do usuário só prevalece quando estiver em \`analysis.expenseProfile\` com \`source: "user_confirmed"\`. O objeto é validado por allowlist.
4. Sem contexto suficiente, usar \`undetermined\`. Não transformar ausência de informação em \`non_contractual\`, \`occasional\` ou \`discretionary\`.
5. Horário e dia da semana não provam finalidade. Uber às 8h ou 23h continua indeterminado sem contexto informado.
6. Nome do estabelecimento não descreve todos os itens comprados. Carrefour sem itens discriminados continua indeterminado.
7. Farmácia não significa automaticamente medicamento essencial. Valor baixo não prova higiene; valor alto não prova doença crônica.
8. Repetição observada em pelo menos três meses distintos pode indicar recorrência. Só há comportamento fixo quando os totais mensais são estáveis dentro da faixa de 75% a 125% da mediana; fora dela, a recorrência continua observada, mas o comportamento é variável.
9. Recorrência não confirma contrato. Contratual só é inferido de metadados explícitos de parcelamento ou de um perfil confirmado.
10. A avaliação é derivada e não persiste novas tags automaticamente. Não sobrescreve lançamentos nem sincroniza classificações inferidas.

## Regras v1 para natureza

- **Essencial estimado:** aluguel, energia, água e gás residencial; transporte/moradia/trabalho quando a finalidade de trabalho foi informada; saúde quando a finalidade de saúde foi informada; medicamentos de uso contínuo somente quando o usuário informou esse contexto; e compra de mercado/feira/padaria cujos itens identificados sejam todos alimentos básicos reconhecidos.
- **Discricionário estimado:** streaming, cinema, shows, jogos, hobbies e eventos; apostas; bares; ou finalidade explicitamente informada como lazer/conveniência.
- **Indeterminado:** supermercado sem itens, Uber/99/táxi sem finalidade, farmácia sem tipo/uso dos produtos, restaurante/delivery sem contexto, mensalidade escolar, academia, seguro e financiamento sem finalidade conhecida, e todo caso não coberto por evidência segura.

Essas regras são hipóteses conservadoras, não verdades universais. O painel as apresenta como estimativas.

## Compromisso, recorrência e comportamento

- Parcelamento com mais de uma parcela, documentado no lançamento, pode marcar \`commitment=contractual\`.
- Três ou mais meses distintos do mesmo estabelecimento + categoria + subcategoria podem marcar \`recurrence=recurring\`.
- Valores mensais dentro de 75%–125% da mediana indicam \`behavior=fixed\`; variação maior indica \`variable\`.
- Sem evidência, compromisso, recorrência e comportamento ficam indeterminados.

## Agregação da Visão Financeira

No período escolhido, somar somente as despesas já elegíveis no motor financeiro:

- Essenciais estimadas
- Discricionárias estimadas
- Indeterminadas

Valores indeterminados ficam isolados e não entram em sugestões de economia. O total do período é o denominador das participações.

O indicador experimental de revisão aparece somente com pelo menos cinco lançamentos, despesas discricionárias de alta flexibilidade acima de 20% do total e parcela indeterminada abaixo de 15%. Ele convida a revisar, não manda cortar gastos nem afirma que a despesa é supérflua.

Se os indeterminados forem 15% ou mais, o painel prioriza pedir contexto em vez de sugerir economia.

## Fora do escopo desta fase

- Alterar a taxonomia ou os lançamentos existentes.
- Persistir automaticamente uma natureza inferida.
- Inferir contrato a partir de recorrência.
- Julgar consumo por hora, dia, valor isolado ou estabelecimento.
- Tratar a classificação como aconselhamento financeiro ou prova de necessidade familiar.

## Revisão conversacional pela Alicia

A confirmação também pode ser iniciada no chat quando a pessoa pede para revisar gastos sem contexto (ou escolhe a sugestão correspondente). A Alicia não interrompe conversas comuns nem inicia perguntas financeiras automaticamente.

1. A fonte continua sendo Store.getAnalysisEntries(), limitada ao mês atual e aos lançamentos cuja natureza permanece indeterminada.
2. A Alicia apresenta um lançamento por vez, priorizando os maiores valores. Parcelas com o mesmo compraId são tratadas como uma única compra para evitar perguntas repetidas.
3. A finalidade é perguntada em linguagem natural. A resposta é salva no campo purpose do próprio registro e os campos de perfil só são preenchidos quando a resposta fornece evidência explícita.
4. Se a resposta indicar uma finalidade reconhecível, o classificador pode produzir uma estimativa derivada com a evidência user_stated_purpose. Isso não transforma uma inferência em confirmação explícita de natureza.
5. Se a pessoa responder que não sabe, a natureza é salva explicitamente como undetermined, com confiança baixa. Alicia segue para o próximo item sem insistir no mesmo gasto durante aquela revisão.
6. Compromisso e flexibilidade só são confirmados quando a resposta contém evidência textual específica. Recorrência e estabilidade continuam derivadas do histórico.
7. A resposta é vinculada ao lançamento; em compras de cartão, o perfil e a finalidade são aplicados às parcelas da mesma compra, exceto registros vinculados a empréstimos.

O estado temporário da revisão é descartado ao trocar de conta ou limpar a conversa. A persistência continua usando Store.save() e os registros JSON existentes, sem nova tabela ou migration. Valores, datas, categorias, subcategorias, status e saldos não são alterados. A pessoa pode interromper a revisão a qualquer momento.
