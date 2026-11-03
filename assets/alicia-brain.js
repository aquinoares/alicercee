/*
 * Alicia — núcleo conversacional local v1
 *
 * Responsabilidades:
 * - reconhecer intenções sociais comuns em português brasileiro;
 * - responder com acolhimento sem fingir sentimentos humanos;
 * - usar somente o contexto temporário já mantido por AlicerceIA._messages;
 * - deixar perguntas e comandos financeiros para o interpretador financeiro existente.
 *
 * Privacidade:
 * - sem fetch, APIs, cookies, localStorage, IndexedDB ou gravação no Supabase;
 * - não armazena transcrições nem cria memória persistente;
 * - o histórico continua limitado pela implementação existente de AlicerceIA.
 *
 * Limite deliberado:
 * - este núcleo é um interpretador determinístico leve, não um modelo geral de linguagem.
 * - quando não reconhece uma intenção, pede contexto em vez de inventar respostas.
 */
(function (root) {
  'use strict';

  var VERSION = '1.0.0';

  function normalize(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function hasAny(value, patterns) {
    for (var i = 0; i < patterns.length; i++) {
      if (patterns[i].test(value)) return true;
    }
    return false;
  }

  function isNegated(value, index) {
    var before = value.slice(Math.max(0, index - 36), index);
    return /\b(?:nao|nunca|jamais)\s+(?:(?:estou|to|me sinto|sinto|fico|fiquei|muito|ta|ando)\s*)?$/.test(before);
  }

  function hasAffirmed(value, pattern) {
    var match = pattern.exec(value);
    return !!match && !isNegated(value, match.index);
  }

  function isFinancialQuestion(value) {
    var topics = /\b(?:gasto|gastos|gastei|despesa|despesas|saldo|fatura|cartao|conta|dinheiro|orcamento|economia|economizar|parcelas|receita|renda)\b/;
    var question = /\b(?:quanto|onde|qual|quais|compare|comparar|compara|analise|analisa|aumentou|diminuiu|sobrou|posso pagar|consigo pagar)\b/;
    return topics.test(value) && question.test(value);
  }

  function lastMessage(messages, role) {
    if (!Array.isArray(messages)) return '';
    for (var i = messages.length - 1; i >= 0; i--) {
      var item = messages[i];
      if (item && item.role === role && typeof item.text === 'string') {
        return item.text;
      }
    }
    return '';
  }

  function previousAssistantAsked(messages) {
    if (!Array.isArray(messages) || messages.length < 2) return false;
    for (var i = messages.length - 2; i >= 0; i--) {
      var item = messages[i];
      if (!item || item.role !== 'assistant' || !item.text) continue;
      var text = normalize(item.text);
      return /\?|quer me contar|me conta|o que aconteceu|o que esta pesando|o que esta mais dificil|como voce esta|como esta seu dia/.test(text);
    }
    return false;
  }

  function classify(message, messages, language) {
    if (language && language !== 'pt') return 'unsupported_language';

    var value = normalize(message);
    if (!value) return 'empty';
    if (isFinancialQuestion(value)) return 'financial';

    if (/^(?:tudo bem|tudo certo|como voce esta|como vai|ta tudo bem|esta tudo bem)(?: alicia)?$/.test(value)) {
      return 'wellbeing_question';
    }

    if (/^(?:(?:oi|ola|bom dia|boa tarde|boa noite|e ai|opa|fala)(?: alicia)?)(?: tudo bem)?$/.test(value)) {
      return 'greeting';
    }

    if (hasAny(value, [
      /\bvoce tem sentimentos\b/,
      /\bvoce sente emocao\b/,
      /\bvoce e uma pessoa\b/,
      /\bvoce e humana\b/,
      /\bvoce e humano\b/,
      /\bvoce e real\b/
    ])) {
      return 'identity_feelings';
    }

    if (hasAny(value, [
      /\bquem e voce\b/,
      /\bo que voce faz\b/,
      /\bqual e sua funcao\b/,
      /\bme fala sobre voce\b/,
      /\bme conte sobre voce\b/
    ])) {
      return 'identity';
    }

    if (hasAny(value, [
      /\bnao estou bem\b/,
      /\bnao to bem\b/,
      /\bme sinto mal\b/,
      /\bme sinto triste\b/,
      /\bestou triste\b/,
      /\bestou desanimad[oa]\b/,
      /\bando desanimad[oa]\b/,
      /\bdecepcionad[oa]\b/,
      /\bsem animo\b/,
      /\bdesanimad[oa]\b/
    ])) {
      return 'sadness';
    }

    if (
      hasAffirmed(value, /\b(?:preocupad[oa]|ansios[oa]|nervos[oa]|inquiet[oa])\b/) ||
      hasAffirmed(value, /\b(?:com medo|com receio|com muita preocupacao)\b/)
    ) {
      return 'worry';
    }

    if (hasAffirmed(value, /\b(?:sobrecarregad[oa]|perdid[oa]|confus[oa]|sem saber por onde comecar)\b/)) {
      return 'overwhelmed';
    }

    if (hasAffirmed(value, /\b(?:frustrad[oa]|irritad[oa]|com raiva|chatead[oa]|indignad[oa])\b/)) {
      return 'frustration';
    }

    if (hasAffirmed(value, /\b(?:cansad[oa]|esgotad[oa]|exaust[oa]|sem energia)\b/)) {
      return 'tiredness';
    }

    if (hasAffirmed(value, /\b(?:feliz|animad[oa]|aliviad[oa]|orgulhos[oa]|satisfeit[oa])\b/) ||
        hasAffirmed(value, /\b(?:consegui|deu certo|deu tudo certo|terminei|alcancei minha meta)\b/)) {
      return 'positive';
    }

    if (hasAny(value, [
      /\bobrigad[oa]\b/,
      /\bvaleu\b/,
      /\bagradeco\b/,
      /\bmuito obrigado\b/
    ])) {
      return 'gratitude';
    }

    if (hasAny(value, [
      /\bdesculpa\b/,
      /\bme desculpe\b/,
      /\bperdao\b/,
      /\bfoi mal\b/
    ])) {
      return 'apology';
    }

    if (/^(?:sim|isso|exatamente|pode ser|talvez|nao|ainda nao sei|nao sei|nao lembro)$/.test(value) &&
        previousAssistantAsked(messages)) {
      if (/^(?:sim|isso|exatamente|pode ser)$/.test(value)) return 'followup_yes';
      if (value === 'nao') return 'followup_no';
      return 'followup_unsure';
    }

    if (hasAny(value, [
      /\bme ajuda\b/,
      /\bpreciso de ajuda\b/,
      /\bquero conversar\b/,
      /\bqueria conversar\b/,
      /\bconversa comigo\b/,
      /\bso quero conversar\b/,
      /\bpodemos conversar\b/,
      /\bquero falar\b/
    ])) {
      return 'support';
    }

    if (/\b(?:estou bem|to bem|tudo certo por aqui|tudo tranquilo)\b/.test(value)) {
      return 'doing_well';
    }

    return 'unknown';
  }

  var RESPONSES = {
    greeting: 'Oi! Que bom ter você por aqui. Como está seu dia?',
    wellbeing_question: 'Estou aqui, pronta para conversar e ajudar. E você, como está hoje?',
    identity_feelings: 'Não tenho sentimentos como uma pessoa. Mas fui criada para responder com respeito, atenção e cuidado, sem julgar você.',
    identity: 'Sou a Alicia, assistente do Alicerce. Posso ajudar você a entender sua organização financeira, acompanhar objetivos e conversar sobre outras questões. Quando eu não souber algo, vou dizer com clareza.',
    sadness: 'Sinto muito que hoje esteja sendo difícil. Você não precisa resolver tudo de uma vez. Quer me contar o que mais está pesando?',
    worry: 'Entendo que isso possa estar deixando você preocupado. Vamos por partes, sem pressa. O que está mais urgente para você agora?',
    overwhelmed: 'Quando muita coisa se junta, pode ficar difícil saber por onde começar. Vamos escolher apenas um próximo passo. O que precisa de atenção primeiro?',
    frustration: 'Entendo que isso esteja sendo frustrante. Não vou julgar você. Quer me contar o que aconteceu?',
    tiredness: 'Parece que você está precisando de um pouco de respiro. Podemos ir com calma. O que seria mais útil neste momento: conversar ou resolver uma coisa pequena?',
    positive: 'Que notícia boa! Isso merece ser reconhecido. Me conta: o que deu certo?',
    gratitude: 'Por nada. Vamos seguindo no seu ritmo. Estou aqui para ajudar no que for possível.',
    apology: 'Não precisa se desculpar. Podemos seguir com calma, do jeito que for melhor para você.',
    followup_yes: 'Pode me contar no seu ritmo. Estou acompanhando. O que aconteceu?',
    followup_no: 'Tudo bem. Você não precisa falar sobre isso agora. Podemos mudar de assunto ou cuidar de outra coisa.',
    followup_unsure: 'Tudo bem não ter certeza agora. Podemos começar por uma parte pequena: o que você sabe até aqui?',
    support: 'Claro. Podemos conversar com calma. O que está passando pela sua cabeça? Não precisa organizar tudo antes de me contar.',
    doing_well: 'Que bom saber disso. Tem algo específico em que você queira minha ajuda hoje?',
    unknown: 'Quero entender direitinho. Você pode me contar um pouco mais sobre isso? Não precisa organizar tudo de uma vez.'
  };

  function respond(message, messages, language) {
    var intent = classify(message, messages, language);
    if (intent === 'financial' || intent === 'unsupported_language' || intent === 'empty') {
      return { handled: false, intent: intent, text: '' };
    }
    return {
      handled: true,
      intent: intent,
      text: RESPONSES[intent] || RESPONSES.unknown
    };
  }

  root.AliciaBrain = {
    version: VERSION,
    normalize: normalize,
    classify: classify,
    respond: respond
  };

  /*
   * Integração segura:
   * só intercepta a resposta geral do chat. Ações e perguntas financeiras
   * continuam no fluxo original; o painel de análise também permanece intacto.
   */
  if (typeof AlicerceIA !== 'undefined' &&
      AlicerceIA &&
      typeof AlicerceIA.responder === 'function' &&
      typeof AlicerceIA.enviarMensagem === 'function' &&
      !AlicerceIA._aliciaBrainV1Installed) {
    var originalResponder = AlicerceIA.responder;
    var originalEnviarMensagem = AlicerceIA.enviarMensagem;

    AlicerceIA.responder = function (question) {
      if (this._aliciaBrainChatMode) {
        var currentMessage = lastMessage(this._messages, 'user') || question;
        var language = (typeof Store !== 'undefined' && Store.lang) ? Store.lang : 'pt';
        var result = root.AliciaBrain.respond(currentMessage, this._messages, language);
        if (result && result.handled) {
          this._lastBrainIntent = result.intent;
          return result.text;
        }
      }
      return originalResponder.apply(this, arguments);
    };

    AlicerceIA.enviarMensagem = async function (question) {
      this._aliciaBrainChatMode = true;
      try {
        return await originalEnviarMensagem.apply(this, arguments);
      } finally {
        this._aliciaBrainChatMode = false;
      }
    };

    AlicerceIA._aliciaBrainV1Installed = true;
  }
})(window);
