# Alicerce — testes de interface, acessibilidade e regressão

Esta suíte usa Playwright, Chromium e axe-core para verificar fluxos reais da interface com dados artificiais. As alterações visuais do aplicativo nesta proposta são limitadas à acessibilidade inicial; os novos cenários ampliam principalmente a cobertura automatizada.

## Cobertura atual

- Inicialização sem sessão e transição da abertura para o login.
- Retorno seguro para credenciais inválidas.
- Cadastro com confirmação por e-mail, incluindo o código de indicação quando presente.
- Solicitação de recuperação de senha e endereço de retorno configurado pelo aplicativo.
- Layout mobile em 320, 360 e 390 pixels e permissão de zoom do navegador.
- Baseline axe na abertura e no login nos quatro temas (grafite, prata, marinho e moderno).
- Renderização de Home, Gastos, Cartões e Configurações.
- Cadastro de gasto manual e de cartão, com verificação dos dados persistidos no localStorage após recarregar a página.
- Reclassificação de categoria/subcategoria e confirmação de gasto.
- Compra no crédito à vista e parcelada, com conferência de valores em centavos, número de parcelas e vencimentos.
- Edição e exclusão de cartões, verificando a preservação de parcelas e empréstimos não relacionados.
- Restauração de gastos e cartões pelo repositório cloud simulado após remover o cache local.
- Isolamento de dois usuários no mock que reproduz a regra de acesso por proprietário, incluindo bloqueio de gravação com sessão incompatível.
- Falha simulada de sincronização, verificando que a cópia local permanece preservada.
- Pré-visualização dos PDFs de Gastos e Visão Financeira.
- Classificação de produto antes da categoria ampla do estabelecimento, com exemplos como shampoo e detergente no Carrefour.
- Aprendizado por correção explícita vinculado a estabelecimento + produto, sem contaminar outros itens.
- Reconhecimento de lanches, fast food e subcategorias válidas da taxonomia.
- Normalização conservadora de aliases brasileiros e sufixos de loja/terminal, preservando a identidade de estabelecimentos desconhecidos.
- Benchmark curado de 43 exemplos brasileiros sintéticos, com medição de acerto por categoria e subcategoria.
- Benchmark complementar de 40 itens cotidianos brasileiros, cobrindo feira, casa, serviços, transporte, saúde, educação, família e animais; exige categoria/subcategoria válidas e evidência do produto.
- Dimensões financeiras separadas: natureza, compromisso, recorrência, comportamento, flexibilidade e contexto; sem transformar ausência de dados em certeza.
- Revisão manual de gastos indeterminados, com confirmação persistida no lançamento e propagada para todas as parcelas da mesma compra.
- Benchmark de 27 descrições bancárias ruidosas, validando estabelecimento, valor, categoria, subcategoria, confiança e ausência de produto inventado.
- Catálogo adicional de redes brasileiras de supermercados, hortifrúti, farmácias, energia e vestuário.
- Testes de colisão para identificadores numéricos e calibração conservadora de confiança: loja isolada = média, produto ou correção individual = alta, descrição sem evidência = baixa.
- Extração monetária que prioriza valores com moeda/rótulo e valores decimais finais, sem confundir NSU/IDs longos com o total da compra.
- Baseline axe das telas Home, Gastos, Cartões e Configurações.

## Resultado automatizado atual

A suíte reúne 67 cenários Playwright, executa benchmarks com 43 exemplos-base e 40 exemplos complementares de despesas brasileiras, além de 27 descrições bancárias ruidosas. Oito cenários novos cobrem separação das dimensões, incerteza, dados confirmados, recorrência, agregação financeira, confirmação manual de perfis em despesas e compras parceladas e preservação da escolha explícita de manter a natureza indeterminada. Os exemplos são sintéticos e servem para regressão do comportamento esperado; não são transações de clientes e não representam, sozinhos, a precisão real em produção. O CI imprime acertos e total por categoria e par categoria/subcategoria. A quantidade de testes aprovados deve ser confirmada no workflow referente ao commit mais recente desta branch.

## Isolamento e limites

- O CDN do Supabase é interceptado pelo Playwright e substituído por um mock local.
- Chamadas ao domínio Supabase do projeto são bloqueadas no navegador de teste.
- Os fluxos de escrita usam um identificador fictício e validam o armazenamento local; a sessão simulada permanece nula e o teste exige zero operações upsert.
- Nenhuma conta, senha, token ou dado financeiro real é usado.
- A suíte não comprova entrega real de e-mail, autenticação com o Supabase de produção ou sincronização real em nuvem. Esses cenários exigem ambiente de homologação isolado e credenciais próprias, não dados de clientes.
- O teste de arquivo/imagem não implementa OCR real; o OCR continua fora do escopo desta suíte.

## Execução

Use Node.js 22.12.0 ou superior.

```sh
npm ci
npx playwright install chromium
npm run test:e2e
npm run test:e2e:report
```

O CI executa `npm ci` com versões fixadas no `package-lock.json`, instala Chromium e anexa o relatório/capturas ao workflow.

## Acessibilidade

O axe-core é executado com critérios WCAG 2.1 A/AA. As telas financeiras principais são bloqueadas quando uma violação é encontrada; a abertura e o login mantêm relatório de baseline para revisão contínua.
