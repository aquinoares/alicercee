# Voz remota da Alicia — protótipo

Este protótipo usa uma única voz fixa: `pt-BR-FranciscaNeural`. O modelo não é baixado no celular. O navegador envia somente o texto da resposta ao Supabase; uma Edge Function valida a sessão e encaminha o texto ao serviço privado hospedado no Render. O Render consulta o serviço online Edge TTS e devolve MP3.

## O que este protótipo não promete

- O pacote comunitário `edge-tts` usa o serviço online de fala do Microsoft Edge; não é a API comercial Azure Speech com SLA.
- Não há garantia de disponibilidade, uso ilimitado ou gratuidade permanente.
- O plano gratuito do Render é apenas para teste: ele pode dormir após 15 minutos sem tráfego, levar cerca de um minuto para acordar e tem cotas mensais.
- Francisca é uma voz diferente da Dora/Kokoro. A substituição definitiva depende de ouvir e aprovar a amostra.

## Implantação de teste sem cartão

1. No Render, crie um Blueprint a partir desta branch e escolha o arquivo `render.yaml` da raiz. Confirme que o serviço `alicerce-alicia-tts` está no plano Free. Não adicione método de pagamento.
2. O Blueprint gera `ALICIA_TTS_API_KEY` automaticamente. Copie a URL pública do serviço (por exemplo `https://alicerce-alicia-tts.onrender.com`) e o valor gerado dessa variável no painel Render.
3. No Supabase do Alicerce, abra **Project Settings → Edge Functions → Secrets** e cadastre:
   - `ALICIA_TTS_URL` = URL pública do serviço Render, sem barra no final.
   - `ALICIA_TTS_API_KEY` = valor gerado pelo Render.
4. Só depois disso implante a Edge Function `alicia-tts` a partir desta branch ou do arquivo `supabase/functions/alicia-tts/index.ts`.

## Testes

- `GET /health` deve responder com `ok: true`.
- Uma chamada autenticada da função `alicia-tts` deve devolver MP3.
- O navegador deve reproduzir o áudio e revogar a URL temporária ao terminar.
- Sem URL/chave, o app mantém o texto e mostra uma mensagem de indisponibilidade.

O texto pode conter valores e informações financeiras. Antes da chamada, a interface apresenta um aviso de privacidade; o texto da resposta é transmitido ao provedor online para gerar o áudio. O servidor não grava o texto ou o MP3.

## Segurança

- A chave de serviço nunca é enviada ao navegador.
- A Edge Function exige sessão Supabase válida; `verify_jwt` está desligado apenas para permitir o preflight CORS, e a função valida o token com `auth.getUser()` antes de encaminhar.
- O servidor exige a chave interna, recebe o ID do usuário validado pela Edge Function, aceita somente a voz fixa e limita tamanho e taxa de requisições.
- Não envie senhas, tokens, número completo de cartão ou outros segredos no texto.

## Licenças e dependências

O servidor utiliza o pacote comunitário `edge-tts` (LGPL-3.0); o código da API deste protótipo é próprio. A existência de código aberto não transforma o serviço online subjacente em uma API oficial com compromisso de disponibilidade ou termos de uso comerciais garantidos.
