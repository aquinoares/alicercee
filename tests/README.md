# Alicerce — testes de interface e acessibilidade

Esta etapa acrescenta Playwright e axe-core sem alterar o index.html, o motor financeiro ou as integrações do aplicativo.

## Cobertura inicial

- Recuperação de sessão sem usuário conectado e exibição da abertura.
- Transição da abertura para o login.
- Feedback esperado para credenciais inválidas, usando um cliente Supabase simulado.
- Larguras de celular de 320, 360 e 390 pixels, com captura de tela e verificação de rolagem horizontal.
- Baseline axe nas telas de abertura e login, nos quatro temas: azul/grafite, claro/prata, marinho e moderno.

## Isolamento

- O script CDN do Supabase é interceptado pelo teste e substituído por um mock.
- Chamadas para o domínio Supabase do Alicerce são bloqueadas no navegador de teste.
- O teste não usa conta, senha, token ou dados financeiros reais.
- O servidor estático local lê os arquivos do repositório, sem modificar o aplicativo.

## Requisito de ambiente e execução local

Use Node.js 22.12.0 ou superior, exigido pelo axe-core/playwright 4.14.0.

npm ci
npx playwright install chromium
npm run test:e2e
npm run test:e2e:report

As dependências e suas dependências transitivas ficam fixadas no package-lock.json. O CI usa npm ci para reproduzir exatamente essa árvore.

## Política do baseline

As violações axe são coletadas como diagnóstico e anexadas ao relatório; não bloqueiam o primeiro baseline. Depois de revisar e corrigir as ocorrências, as regras aprovadas podem ser convertidas em critérios bloqueantes.

Nenhuma alteração visual ou correção no aplicativo é feita automaticamente nesta etapa.
