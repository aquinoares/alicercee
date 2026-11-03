/*
 * Alicia — cérebro conversacional próprio v2
 * Interpretador local determinístico; não é um modelo geral de linguagem.
 * Sem histórico persistente, APIs de IA ou envio de transcrições.
 */
(function (root) {
  'use strict';

  var VERSION = '2.0.0';
  var PERSONA = {
    identity: 'Alicia, assistente digital financeira do Alicerce.',
    language: 'pt-BR',
    tone: 'natural, acolhedor, claro, direto e sem julgamento',
    defaultSentences: 2,
    maxQuestions: 1,
    maxEmoji: 0,
    neverPretendHuman: true,
    neverInventFinancialNumbers: true,
    conversationMemory: 'contexto temporário; máximo de duas interações completas',
    permanentMemory: 'desativada até autorização clara e implementação própria',
    priority: ['seguranca', 'privacidade', 'intencao', 'motor_financeiro', 'conversa']
  };

  function normalize(value) {
    var raw = String(value || '').toLowerCase().replace(/\bc\s*\/\s*/g, 'com ');
    var text = raw.normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    var corrections = {
      qaunto: 'quanto', qanto: 'quanto', qunto: 'quanto',
      gstei: 'gastei', ontm: 'ontem', ontne: 'ontem',
      farmcia: 'farmacia', cartaoo: 'cartao'
    };
    return text.replace(/\b[a-z0-9]+\b/g, function (word) {
      return corrections[word] || word;
    }).replace(/\s+/g, ' ').trim();
  }

  function hasAny(value, patterns) {
    for (var i = 0; i < patterns.length; i++) {
      if (patterns[i].test(value)) return true;
    }
    return false;
  }

  function lastMessage(messages, role, endBeforeLast) {
    if (!Array.isArray(messages)) return '';
    var start = endBeforeLast ? messages.length - 2 : messages.length - 1;
    for (var i = start; i >= 0; i--) {
      var item = messages[i];
      if (item && item.role === role && typeof item.text === 'string') return item.text;
    }
    return '';
  }

  function lastAssistantText(messages) {
    return lastMessage(messages, 'assistant', true);
  }

  function previousAssistantAsked(messages) {
    var raw = lastAssistantText(messages);
    if (raw.indexOf('?') >= 0) return true;
    var text = normalize(raw);
    return !!text && /quer me contar|me conta|o que aconteceu|o que esta pesando|o que esta mais dificil|o que precisa de atencao|o que esta mais urgente|o que esta passando|como voce esta|como esta seu dia|tem algo especifico|qual e seu objetivo|qual deles|quer comparar/.test(text);
  }

  function isFinancialQuestion(value) {
    var topics = /\b(?:gasto|gastos|gastei|despesa|despesas|saldo|fatura|cartao|conta|dinheiro|orcamento|economia|economizar|parcelas|receita|renda|uber|mercado|farmacia)\b/;
    var question = /\b(?:quanto|onde|qual|quais|compare|comparar|compara|analise|analisa|aumentou|diminuiu|sobrou|posso pagar|consigo pagar|gastei)\b/;
    return topics.test(value) && question.test(value);
  }

  function hasPreviousFinancialContext(messages) {
    var previous = normalize(lastMessage(messages, 'user', true));
    return isFinancialQuestion(previous) ||
      /\b(?:gasto|gastos|despesa|despesas|saldo|fatura|cartao|dinheiro|uber|mercado|farmacia)\b/.test(previous);
  }

  function isFinancialFollowup(value, messages) {
    var periodOnly = /^(?:e\s+)?(?:(?:no|na|neste|nesta|nesse|nessa|do|da)\s+)?(?:mes passado|mes anterior|semana passada|esta semana|nessa semana|hoje|ontem|ultimos 7 dias|ultimos 3 meses)$/.test(value);
    return periodOnly && hasPreviousFinancialContext(messages);
  }

  function isThirdPartyDanger(value) {
    return hasAny(value, [
      /\b(?:vou|quero|queria|pretendo|penso em)\s+(?:machucar|ferir|agredir|matar)\s+(?:alguem|uma pessoa|ele|ela|meu|minha)\b/,
      /\b(?:quero|vou|queria)\s+fazer\s+mal\s+a\s+(?:alguem|uma pessoa|ele|ela)\b/,
      /\b(?:vou|quero|queria)\s+atacar\s+(?:alguem|uma pessoa|ele|ela)\b/
    ]);
  }

  function isEverydayMetaphor(value) {
    return hasAny(value, [
      /\b(?:essa|a) conta vai me matar(?: kkk+| haha+| rs+)?\b/,
      /\b(?:essa|a) fatura vai me matar(?: kkk+| haha+| rs+)?\b/,
      /\bmorri de rir\b/,
      /\bmorrendo de rir\b/,
      /\bmorri de tanto rir\b/
    ]);
  }

  function isSelfSafetyRisk(value) {
    if (isEverydayMetaphor(value)) return false;
    return hasAny(value, [
      /\b(?:quero|queria|vou|penso em|estou pensando em|tenho vontade de|pretendo)\s+(?:me\s+)?(?:matar|suicidar)\b/,
      /\b(?:tirar|acabar com)\s+a minha vida\b/,
      /\b(?:quero|queria|vou|penso em|tenho vontade de)\s+(?:me\s+)?(?:machucar|ferir)\b/,
      /\b(?:quero|queria|vou|penso em|tenho vontade de)\s+(?:sumir|desaparecer)\b/,
      /\b(?:seria melhor|era melhor|melhor) (?:se )?eu nao existisse\b/,
      /\b(?:seria melhor|era melhor) sem mim\b/,
      /\b(?:nao aguento mais|nao da mais|nao consigo continuar)\b/,
      /\b(?:quero|queria) acabar com tudo\b/,
      /\bpra que continuar\b/,
      /\bpara que continuar\b/,
      /\bso quero dormir e nao acordar\b/,
      /\bso queria dormir e nao acordar\b/,
      /\bnao quero mais viver\b/,
      /\bnao queria mais viver\b/,
      /\bqueria nao acordar\b/,
      /\bnao quero acordar\b/,
      /\bqueria deixar de existir\b/,
      /\bseria melhor se eu sumisse\b/
    ]);
  }

  function hasSensitiveData(message) {
    var raw = String(message || '');
    var normalized = normalize(raw);
    var cpf = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/.test(raw);
    var email = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(raw);
    var password = /\b(?:senha|password|pass)\s*(?:e|é|:|=)\s*\S+/i.test(raw);
    var cardNumber = /\b(?:\d[ -]?){13,19}\b/.test(raw) && /\b(?:cartao|credito|debito|cvv|cvc)\b/.test(normalized);
    var explicitSecret = /\b(?:meu|minha)\s+(?:cpf|senha|cartao completo|numero do cartao|cvv)\b/.test(normalized) && /\b\d{4,}\b/.test(raw);
    return cpf || email || password || cardNumber || explicitSecret;
  }

  function classify(message, messages, language) {
    var value = normalize(message);
    if (!value) return 'empty';

    /* Segurança é avaliada antes de finanças, memória e conversa. */
    if (isThirdPartyDanger(value)) return 'third_party_danger';
    if (isSelfSafetyRisk(value)) return 'self_safety_crisis';
    if (hasSensitiveData(message)) return 'sensitive_data';

    if (/\b(?:esquece|esqueca|apaga|apague|limpa|limpe)\b.*\b(?:o que eu falei|essa conversa|minhas mensagens|o que eu disse|isso)\b/.test(value)) {
      return 'forget';
    }
    if (/\b(?:o que voce sabe sobre mim|o que sabe de mim|quais dados voce guarda|o que voce guardou|minhas memorias)\b/.test(value)) {
      return 'privacy_summary';
    }
    if (/^(?:deixa pra la|deixa|esquece|nao quero falar|prefiro nao falar|vamos mudar de assunto)$/.test(value)) {
      return 'leave_it';
    }
    if (language && language !== 'pt') return 'unsupported_language';

    if (isFinancialFollowup(value, messages)) return 'financial_followup';
    if (/\b(?:quanto|qual|que valor)\b.*\b(?:vou ter|terei|vai sobrar|sobrara|vou juntar|vou acumular)\b.*\b(?:ano que vem|proximo ano|ano seguinte)\b/.test(value)) {
      return 'forecast_without_data';
    }
    if (isFinancialQuestion(value)) return 'financial';

    if (/\b(?:devo|deveria|vale a pena|melhor comprar|compro)\b.*\b(?:bitcoin|cripto|criptomoeda|acao|acoes|fundo|investimento)\b/.test(value) ||
        /\b(?:bitcoin|criptomoeda|investir em)\b/.test(value)) return 'investment';

    if (/\b(?:me ajuda|ajuda me|quero|preciso)\b.*\b(?:economizar|guardar dinheiro|juntar dinheiro|poupar)\b/.test(value)) {
      return 'savings_support';
    }
    if (/\b(?:e o outro|e a outra|e os outros|e as outras|qual deles|qual delas)\b/.test(value)) return 'ambiguous';

    if (/^(?:tudo bem|tudo certo|como voce esta|como vai|ta tudo bem|esta tudo bem)(?: alicia)?$/.test(value)) {
      return 'wellbeing_question';
    }
    if (/^(?:(?:oi|ola|bom dia|boa tarde|boa noite|e ai|opa|fala)(?: alicia)?)(?: tudo bem)?$/.test(value)) {
      return value.indexOf('tudo bem') >= 0 ? 'greeting_wellbeing' : 'greeting';
    }

    if (hasAny(value, [
      /\bvoce tem sentimentos\b/, /\bvoce sente emocao\b/, /\bvoce e uma pessoa\b/,
      /\bvoce e humana\b/, /\bvoce e humano\b/, /\bvoce e real\b/
    ])) return 'identity_feelings';

    if (hasAny(value, [
      /\bquem e voce\b/, /\bo que voce faz\b/, /\bqual e sua funcao\b/,
      /\bme fala sobre voce\b/, /\bme conte sobre voce\b/
    ])) return 'identity';

    if (/\b(?:esse app nao serve pra nada|esse aplicativo nao serve pra nada|app nao funciona|aplicativo nao funciona|nao consigo usar o app|o app travou|aplicativo travou)\b/.test(value)) {
      return 'app_frustration';
    }

    if (/\b(?:mais um mes no vermelho|no vermelho de novo|nao consegui guardar nada|nao consegui economizar|nao consegui poupar)\b/.test(value) ||
        hasAny(value, [
          /\bnao estou bem\b/, /\bnao to bem\b/, /\bme sinto mal\b/, /\bme sinto triste\b/,
          /\bestou triste\b/, /\bestou desanimad[oa]\b/, /\bando desanimad[oa]\b/,
          /\bdecepcionad[oa]\b/, /\bsem animo\b/, /\bdesanimad[oa]\b/
        ])) return 'sadness';

    if (hasAny(value, [
      /\b(?:preocupad[oa]|ansios[oa]|nervos[oa]|inquiet[oa])\b/,
      /\b(?:com medo|com receio|com muita preocupacao)\b/
    ])) return 'worry';

    if (hasAny(value, [/\b(?:sobrecarregad[oa]|perdid[oa]|confus[oa]|sem saber por onde comecar)\b/])) {
      return 'overwhelmed';
    }
    if (hasAny(value, [/\b(?:frustrad[oa]|irritad[oa]|com raiva|chatead[oa]|indignad[oa])\b/])) return 'frustration';
    if (hasAny(value, [/\b(?:cansad[oa]|esgotad[oa]|exaust[oa]|sem energia)\b/])) return 'tiredness';

    if (/\b(?:consegui pagar|quitei|paguei a divida|terminei de pagar|alcancei minha meta|consegui guardar|consegui economizar)\b/.test(value)) {
      return 'achievement';
    }
    if (hasAny(value, [/\bfeliz\b/, /\banimad[oa]\b/, /\baliviad[oa]\b/, /\borgulhos[oa]\b/, /\bsatisfeit[oa]\b/, /\bdeu certo\b/])) {
      return 'positive';
    }
    if (hasAny(value, [/\bobrigad[oa]\b/, /\bvaleu\b/, /\bagradeco\b/, /\bmuito obrigado\b/])) return 'gratitude';
    if (hasAny(value, [/\bdesculpa\b/, /\bme desculpe\b/, /\bperdao\b/, /\bfoi mal\b/])) return 'apology';

    if (/^(?:sim|isso|exatamente|pode ser|talvez|nao|ainda nao sei|nao sei|nao lembro|ok|certo)$/.test(value) &&
        previousAssistantAsked(messages)) {
      if (/^(?:sim|isso|exatamente|pode ser)$/.test(value)) return 'followup_yes';
      if (value === 'nao') return 'followup_no';
      if (value === 'ok' || value === 'certo') return 'followup_ack';
      return 'followup_unsure';
    }

    if (/\b(?:essa|a) conta vai me matar(?: kkk+| haha+| rs+)?\b/.test(value) ||
        /\b(?:essa|a) fatura vai me matar(?: kkk+| haha+| rs+)?\b/.test(value) ||
        /\b(?:morri de rir|morrendo de rir|morri de tanto rir)\b/.test(value)) return 'figurative_expression';

    if (hasAny(value, [
      /\bme ajuda\b/, /\bpreciso de ajuda\b/, /\bquero conversar\b/, /\bqueria conversar\b/,
      /\bconversa comigo\b/, /\bso quero conversar\b/, /\bpodemos conversar\b/, /\bquero falar\b/
    ])) return 'support';

    if (/\b(?:qual o melhor time|qual e o melhor time|melhor time do brasil|qual time e melhor|quem vai ganhar o brasileirao)\b/.test(value)) {
      return 'out_of_scope';
    }
    if (/^(?:estou bem|to bem|tudo certo por aqui|tudo tranquilo)$/.test(value)) return 'doing_well';
    return 'unknown';
  }

  var RESPONSES = {
    greeting: [
      'Oi! Bom ter você por aqui. Como está seu dia?',
      'Olá! Vamos conversar com calma. Como posso ajudar hoje?'
    ],
    greeting_wellbeing: [
      'Boa noite! Estou aqui, pronta para ajudar. E você, tudo bem?',
      'Boa noite! Por aqui, tudo pronto para conversar. Como você está?'
    ],
    wellbeing_question: [
      'Estou aqui, pronta para conversar e ajudar. E você, como está hoje?',
      'Tudo certo por aqui para seguir com você. Como está seu dia?'
    ],
    sadness: [
      'Mês difícil não apaga o esforço que você já fez. Quer que a gente olhe juntos o que aconteceu, sem pressa?',
      'Parece que esse mês pesou. Não vou julgar você; podemos entender o que aconteceu, um passo de cada vez. Quer olhar isso comigo?'
    ],
    app_frustration: [
      'Poxa, parece que o Alicerce te atrapalhou. Quero entender sem me defender: o que não funcionou?',
      'Que chato passar por isso. Vamos identificar o que travou para eu orientar melhor. Em que parte aconteceu?'
    ],
    worry: [
      'A fatura pode preocupar mesmo. Posso consultar o valor real que já está no Alicerce, sem fazer estimativas. Quer que eu mostre?',
      'Entendo que isso esteja pesando. Podemos conferir o valor registrado no motor financeiro, sem adivinhar nada. Quer consultar?'
    ],
    overwhelmed: [
      'Quando muita coisa se junta, fica difícil escolher por onde começar. Podemos separar uma coisa de cada vez. O que está mais urgente?',
      'Vamos reduzir isso a um próximo passo pequeno. O que merece atenção primeiro?'
    ],
    frustration: [
      'Parece que isso te deixou frustrado. Não vou diminuir o que aconteceu. Quer me contar o que travou?',
      'Isso não saiu como você esperava. Vamos entender o ponto que incomodou, sem julgamento. O que aconteceu?'
    ],
    tiredness: [
      'Parece que você está precisando de um respiro. Podemos ir com calma e deixar o restante para depois. O que seria mais útil agora?',
      'Você não precisa resolver tudo neste momento. Podemos escolher algo pequeno ou simplesmente retomar quando estiver melhor.'
    ],
    achievement: [
      'Conseguir pagar essa dívida é um passo importante. Isso merece reconhecimento, sem exagero. Se quiser, podemos olhar como manter esse avanço.',
      'Você concluiu uma etapa que exigiu esforço. Que bom ver esse progresso; podemos pensar no próximo passo no seu ritmo.'
    ],
    positive: [
      'Que notícia boa! É importante reconhecer esse avanço. Quer me contar o que deu certo?',
      'Bom saber que as coisas caminharam. O que você acha que mais ajudou?'
    ],
    gratitude: [
      'Por nada. Vamos seguindo no seu ritmo; estou aqui para ajudar no que for possível.',
      'Conte comigo para organizar o próximo passo, sem pressa.'
    ],
    apology: [
      'Não precisa se desculpar. Podemos seguir com calma, do jeito que for melhor para você.',
      'Está tudo bem. Podemos continuar de onde for mais confortável.'
    ],
    followup_yes: [
      'Pode me contar no seu ritmo. Estou acompanhando. O que aconteceu?',
      'Certo, vamos por partes. O que você gostaria de me contar primeiro?'
    ],
    followup_no: [
      'Tudo bem. Você não precisa falar sobre isso agora. Podemos mudar de assunto ou deixar para depois.',
      'Sem problema. Respeito seu tempo; seguimos quando você quiser.'
    ],
    followup_ack: [
      'Certo. Ficamos por aqui e retomamos quando você quiser.',
      'Combinado. Quando quiser continuar, é só me chamar.'
    ],
    followup_unsure: [
      'Tudo bem não ter certeza agora. Podemos começar por uma parte pequena: o que você sabe até aqui?',
      'Não precisa decidir neste momento. Podemos olhar com calma para o que já está claro.'
    ],
    savings_support: [
      'Claro. Economizar fica mais fácil quando sabemos o que você quer priorizar, sem sair cortando tudo. Seu foco é aliviar o mês, quitar uma dívida ou juntar para algum objetivo?',
      'Vamos pensar em algo que caiba na sua rotina. O que você quer alcançar primeiro: mais folga no mês, quitar uma dívida ou guardar para um plano?'
    ],
    support: [
      'Claro. Podemos conversar com calma. O que está passando pela sua cabeça? Não precisa organizar tudo antes de me contar.',
      'Estou aqui para ajudar a organizar as ideias. Por onde você prefere começar?'
    ],
    ambiguous: [
      'Quero acompanhar sem adivinhar. Qual deles você quer dizer?',
      'Me dá só mais um detalhe para eu saber a qual você está se referindo. Qual deles?'
    ],
    forecast_without_data: [
      'Não encontrei essa informação agora. Não vou estimar um valor sem dados confiáveis. Posso ajudar a organizar um cenário com premissas claras.',
      'Ainda não tenho uma projeção confiável para esse período. Prefiro não inventar um número; posso mostrar os dados atuais e explicar o que falta.'
    ],
    investment: [
      'Bitcoin pode variar bastante e envolve risco de perda; não seria responsável eu dizer para comprar ou não. Posso explicar diferenças entre opções e pontos de atenção, e uma decisão desse tamanho pode ser discutida com um profissional habilitado.'
    ],
    out_of_scope: [
      'Meu foco é ajudar com sua organização financeira e com o uso do Alicerce. Sobre futebol, prefiro não inventar uma resposta. Posso ajudar em outro assunto?'
    ],
    identity_feelings: [
      'Sou uma assistente digital e não tenho sentimentos como uma pessoa. Minha forma de acolher aparece no cuidado com as palavras, na atenção ao contexto e no respeito por você.'
    ],
    identity: [
      'Sou a Alicia, assistente digital do Alicerce. Posso ajudar a entender seus registros financeiros, acompanhar objetivos e conversar com clareza, sem julgamento. Quando eu não souber algo, vou dizer.'
    ],
    privacy_summary: [
      'Nesta versão, não guardo conversas nem memórias pessoais permanentes. Uso apenas o contexto temporário das últimas duas interações; você pode apagá-lo pelo botão “Limpar conversa”.'
    ],
    forget: [
      'Pronto. Apaguei o contexto temporário desta conversa. Não mantenho uma cópia permanente das suas mensagens.'
    ],
    sensitive_data: [
      'Por segurança, você não precisa compartilhar CPF, senhas ou números completos de cartão. Não vou reutilizar esse dado; envie apenas a informação necessária, sem identificadores.'
    ],
    leave_it: [
      'Tudo bem. Não precisa continuar agora. Quando quiser retomar, estou por aqui.',
      'Sem problema. Respeito seu tempo; podemos deixar esse assunto para depois.'
    ],
    figurative_expression: [
      'Entendi como força de expressão. Podemos olhar para esse gasto sem alarme e sem julgamento. Quer conferir o que aconteceu?'
    ],
    third_party_danger: [
      'Isso precisa de atenção imediata. Se alguém estiver em perigo, ligue para a Polícia Militar no 190 ou para o SAMU no 192 agora. Não tente lidar com a situação sozinho; procure ajuda presencial de emergência.'
    ],
    self_safety_crisis: [
      'Estou levando o que você disse a sério. Sua segurança importa. Você está em segurança agora? O CVV atende gratuitamente pelo 188, 24 horas, e também em cvv.org.br; se houver risco imediato, ligue para o SAMU 192. Procure agora alguém de confiança para ficar com você; posso continuar aqui enquanto você busca apoio.'
    ],
    doing_well: [
      'Que bom saber disso. Tem algo específico em que você queira minha ajuda hoje?'
    ],
    unknown: [
      'Quero entender direitinho antes de responder. Você pode explicar com outras palavras?',
      'Não quero adivinhar o que você quis dizer. Quer me dar mais um detalhe?'
    ]
  };

  function chooseResponse(intent, messages) {
    var variants = RESPONSES[intent] || RESPONSES.unknown;
    if (variants.length < 2) return variants[0];
    var previous = lastAssistantText(messages);
    if (previous && previous === variants[0]) return variants[1];
    return variants[0];
  }

  function respond(message, messages, language) {
    var intent = classify(message, messages, language);
    if (intent === 'financial' || intent === 'financial_followup' ||
        intent === 'unsupported_language' || intent === 'empty') {
      return { handled: false, intent: intent, text: '' };
    }
    return { handled: true, intent: intent, text: chooseResponse(intent, messages) };
  }

  function clearTemporaryState(alicia) {
    alicia._messages = [];
    alicia._pendingExpenseDraft = null;
    alicia._pendingFinancialReview = null;
    alicia._question = '';
    alicia._answer = '';
    alicia._welcomeTypingStarted = false;
    alicia._pendingPrivacyAction = '';
    alicia._pendingSpeechIndex = -1;
    alicia._pendingSpeechButton = null;
  }

  function appendLocalReply(alicia, userLabel, answer) {
    if (!Array.isArray(alicia._messages)) alicia._messages = [];
    if (userLabel) alicia._messages.push({ role: 'user', text: userLabel });
    alicia._messages.push({ role: 'assistant', text: answer });
    while (alicia._messages.length > 4) alicia._messages.splice(0, 2);
    alicia._question = userLabel || '';
    alicia._answer = answer;
    if (typeof render === 'function') render();
  }

  function registerSafetyAlert(type) {
    var client = root.alicerceSupabase;
    if (!client || !client.functions || typeof client.functions.invoke !== 'function') return false;
    try {
      var request = client.functions.invoke('alicia-safety-alert', { body: { type: type } });
      if (request && typeof request.catch === 'function') {
        request.catch(function () { /* a resposta de acolhimento não depende do log */ });
      }
      return true;
    } catch (error) {
      return false;
    }
  }

  root.AliciaBrain = {
    version: VERSION,
    persona: PERSONA,
    normalize: normalize,
    classify: classify,
    respond: respond,
    hasSensitiveData: hasSensitiveData,
    isSelfSafetyRisk: isSelfSafetyRisk,
    isThirdPartyDanger: isThirdPartyDanger,
    registerSafetyAlert: registerSafetyAlert
  };

  if (typeof AlicerceIA !== 'undefined' &&
      AlicerceIA &&
      typeof AlicerceIA.responder === 'function' &&
      typeof AlicerceIA.enviarMensagem === 'function' &&
      !AlicerceIA._aliciaBrainV2Installed) {
    var originalResponder = AlicerceIA.responder;
    var originalEnviarMensagem = AlicerceIA.enviarMensagem;

    AlicerceIA.responder = function (question) {
      if (this._aliciaBrainChatMode) {
        var currentMessage = question || lastMessage(this._messages, 'user');
        var language = (typeof Store !== 'undefined' && Store.lang) ? Store.lang : 'pt';
        var result = root.AliciaBrain.respond(currentMessage, this._messages, language);
        if (result && result.handled) {
          this._lastBrainIntent = result.intent;
          return result.text;
        }
        if (result && result.intent === 'financial' &&
            normalize(currentMessage) !== String(currentMessage || '').toLowerCase()) {
          return originalResponder.call(this, normalize(currentMessage));
        }
      }
      return originalResponder.apply(this, arguments);
    };

    AlicerceIA.enviarMensagem = async function (question) {
      var input = typeof document !== 'undefined' ? document.getElementById('alicerce-assistant-input') : null;
      var rawMessage = String(question !== undefined ? question : (input ? input.value : '') || '').trim();
      if (!rawMessage) return;

      var language = (typeof Store !== 'undefined' && Store.lang) ? Store.lang : 'pt';
      var intent = root.AliciaBrain.classify(rawMessage, this._messages, language);

      if (typeof this.pararAudio === 'function') this.pararAudio();
      if (typeof this.pararReconhecimento === 'function') this.pararReconhecimento(true);

      if (intent === 'self_safety_crisis' || intent === 'third_party_danger') {
        this._pendingExpenseDraft = null;
        this._pendingFinancialReview = null;
        appendLocalReply(this, '[mensagem de segurança recebida]', chooseResponse(intent, this._messages));
        registerSafetyAlert(intent === 'self_safety_crisis' ? 'self_safety' : 'third_party_safety');
        if (input) input.value = '';
        return;
      }

      if (intent === 'sensitive_data') {
        this._pendingExpenseDraft = null;
        this._pendingFinancialReview = null;
        appendLocalReply(this, '[conteúdo sensível omitido]', chooseResponse(intent, this._messages));
        if (input) input.value = '';
        return;
      }

      if (intent === 'forget') {
        clearTemporaryState(this);
        this._messages.push({ role: 'assistant', text: chooseResponse(intent, []) });
        this._answer = this._messages[0].text;
        if (input) input.value = '';
        if (typeof render === 'function') render();
        return;
      }

      if (intent === 'leave_it') {
        this._pendingExpenseDraft = null;
        this._pendingFinancialReview = null;
        appendLocalReply(this, rawMessage, chooseResponse(intent, this._messages));
        if (input) input.value = '';
        return;
      }

      this._aliciaBrainChatMode = true;
      try {
        return await originalEnviarMensagem.apply(this, arguments);
      } finally {
        this._aliciaBrainChatMode = false;
      }
    };

    AlicerceIA._aliciaBrainV2Installed = true;
  }
})(window);
