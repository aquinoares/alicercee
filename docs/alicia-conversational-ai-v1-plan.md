# Alicia conversacional v1 — escopo de teste

Esta branch reúne o cérebro conversacional autenticado, histórico privado e ajustes de voz para teste controlado.

## Experiência de voz
- Alicia tenta narrar automaticamente cada resposta usando o TTS remoto já existente.
- Um único botão liga/desliga a voz; a preferência fica salva por conta e começa ligada.
- O botão de microfone orienta a pessoa a usar o microfone nativo do teclado do celular.
- Não há confirmação repetida para narrar respostas nem para usar o microfone do teclado.
- Navegadores podem bloquear reprodução automática até uma interação do usuário; nesse caso, o texto permanece disponível.

## Dados, privacidade e permissões
- Histórico e memórias ficam vinculados ao usuário autenticado.
- RLS restringe conversas, mensagens e memórias ao próprio usuário; service role apenas no servidor.
- O consentimento para enviar texto/histórico ao OpenRouter permanece explícito e é salvo por conta após a primeira autorização. Não é solicitado a cada mensagem.
- O contexto financeiro enviado ao modelo é calculado pelo Alicerce; não se deve inventar valores nem afirmar ações não executadas.
- Ações atuais: consultas que o interpretador financeiro local consegue responder, revisão/classificação contextual existente e preparação de despesa simples. O fluxo de lançamento ainda abre a conferência do Alicerce antes de salvar.
- Lembretes automáticos e execução geral de tarefas ainda não estão implementados como ferramentas da Alicia; ela não deve afirmar que os criou.

## Não incluído nesta publicação
- Nenhuma alteração na Edge Function ia-executar.
- Nenhuma nova permissão de microfone ou captura de áudio.
- Nenhuma migration aplicada no Supabase remoto e nenhuma Edge Function alicia-chat implantada.
- Nenhuma publicação do frontend em produção.

## Próximos passos de validação
1. Revisar e testar o frontend no preview da branch.
2. Criar ambiente Supabase de desenvolvimento antes de aplicar a migration.
3. Implantar alicia-chat no ambiente de desenvolvimento e validar duas contas isoladas.
4. Testar TTS automático em navegadores móveis e desktop.
5. Implementar ferramentas de lembretes e ações adicionais somente depois de definir contratos, autorização e trilha de auditoria.