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
- Pré-visualização dos PDFs de Gastos e Visão Financeira.
- Baseline axe das telas Home, Gastos, Cartões e Configurações.

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
