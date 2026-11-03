# Alicia — núcleo conversacional próprio v1

## Objetivo

Adicionar uma camada leve de interpretação conversacional em português brasileiro, sem depender de um modelo pago para cumprimentos, agradecimentos, acolhimento, continuidade curta e pedidos genéricos de ajuda.

## Integração

- Arquivo: `assets/alicia-brain.js`.
- O módulo é carregado depois do código atual do aplicativo.
- A integração intercepta somente o método geral de resposta durante `AlicerceIA.enviarMensagem`.
- O painel de análise financeira, o interpretador de gastos, a confirmação de lançamentos, cartões, parcelas e o motor financeiro continuam usando os caminhos existentes.
- Perguntas financeiras reconhecidas são devolvidas ao interpretador atual.

## Memória e privacidade

- Não cria tabelas nem migrations.
- Não grava mensagens, transcrições ou áudio no Supabase.
- Não usa localStorage, IndexedDB, cookies ou chamadas de rede.
- Reutiliza exclusivamente `AlicerceIA._messages`, que já mantém no máximo duas interações completas.
- A limpeza da conversa e a troca de conta continuam apagando o contexto temporário.

## Áudio

- Mantém o reconhecimento de fala e o fluxo de consentimento existentes.
- A transcrição reconhecida continua entrando no mesmo campo e passando pelo mesmo interpretador.
- Mantém o TTS atual sem alterar o provedor ou os segredos.

## Limites conhecidos

Este primeiro núcleo usa regras explícitas, sinônimos e padrões determinísticos. Ele melhora a naturalidade em intenções comuns, mas não equivale a um modelo geral de linguagem e não responde com conhecimento aberto sobre qualquer assunto. Quando não reconhece uma intenção, pede contexto em vez de inventar uma resposta.

## Testes

A suíte Playwright deve cobrir:
- saudação e pergunta de bem-estar;
- acolhimento diante de desânimo e continuidade de uma resposta curta;
- limite de duas interações completas e limpeza;
- preservação do interpretador financeiro existente;
- ausência de chamadas de rede ou gravação persistente pelo novo módulo.
