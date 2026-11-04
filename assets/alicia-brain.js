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

  function editDistanceWithin(source, target, maximum) {
    var a = String(source || '');
    var b = String(target || '');
    if (Math.abs(a.length - b.length) > maximum) return maximum + 1;
    var previous = [];
    var current = [];
    var i;
    var j;
    for (j = 0; j <= b.length; j++) previous[j] = j;
    for (i = 1; i <= a.length; i++) {
      current = [i];
      var rowMinimum = i;
      for (j = 1; j <= b.length; j++) {
        var cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
        current[j] = Math.min(
          current[j - 1] + 1,
          previous[j] + 1,
          previous[j - 1] + cost
        );
        if (current[j] < rowMinimum) rowMinimum = current[j];
      }
      if (rowMinimum > maximum) return maximum + 1;
      previous = current;
    }
    return previous[b.length];
  }

  function normalize(value) {
    var raw = String(value || '').toLowerCase()
      .replace(/\bnum(?=\s+tô(?:\s|$))/g, 'nao')
      .replace(/\bnum(?=\s+(?:quero|queria|to|estou|aguento|aguentando|tenho|consigo)\b)/g, 'nao')
      .replace(/([a-z])\1{3,}/g, '$1$1')
      .replace(/\bc\s*\/\s*/g, 'com ');
    var text = raw.normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    var corrections = {
      qaunto: 'quanto', qanto: 'quanto', qunto: 'quanto',
      gstei: 'gastei', ontm: 'ontem', ontne: 'ontem',
      farmcia: 'farmacia', cartaoo: 'cartao',
      aguentano: 'aguentando', aguentano: 'aguentando',
      dexar: 'deixar', dxa: 'deixa', tras: 'tras',
      qro: 'quero', qria: 'queria', amanhaa: 'amanha',
      remdio: 'remedio', remedioo: 'remedio',
      predioo: 'predio', varnda: 'varanda'
    };
    var fuzzyWords = [
      'aguentando', 'aguento', 'deixar', 'desaparecer', 'desapareco',
      'acordar', 'remedio', 'medicamentos', 'varanda', 'predio',
      'terminar', 'despedida', 'escrever', 'familia', 'mae',
      'sumir', 'viver', 'matar', 'morrer', 'continuar'
    ];
    return text.split(' ').map(function (word) {
      if (corrections[word]) return corrections[word];
      if (word.length < 6) return word;
      var best = word;
      var bestDistance = 2;
      for (var index = 0; index < fuzzyWords.length; index++) {
        var candidate = fuzzyWords[index];
        if (Math.abs(candidate.length - word.length) > 1) continue;
        var distance = editDistanceWithin(word, candidate, 1);
        if (distance < bestDistance) {
          best = candidate;
          bestDistance = distance;
          if (distance === 0) break;
        }
      }
      return best;
    }).join(' ').replace(/\s+/g, ' ').trim();
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
    var topics = /\b(?:gasto|gastos|gastei|despesa|despesas|saldo|fatura|cartao|conta|dinheiro|grana|orcamento|economia|economizar|parcelas|parcelar|receita|renda|uber|mercado|farmacia|extrato|luz|energia|agua|internet|telefone|aluguel|paguei|pagamento|sobrou|pix|transferencia|transferencias)\b/;
    var question = /\b(?:quanto|onde|qual|quais|compare|comparar|compara|analise|analisa|aumentou|diminuiu|sobrou|posso pagar|consigo pagar|posso parcelar|parcelar|mostra|mostre|exibe|exibir|consulta|consultar|ver|veja|kd|cade|gastei|paguei|entrou|entraram|recebi)\b/;
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
      /\bmorri de tanto rir\b/,
      /\b(?:essa|a) fatura me mata\b/,
      /\b(?:fiquei|estou|to) mort[oa] de vergonha\b/,
      /\b(?:estou|to) morrendo de preguica\b/,
      /\bme mato de rir\b/,
      /\b(?:esse|o) boleto me deu um infarto\b/,
      /\bse (?:a )?minha mae (?:vir|ver) (?:essa )?fatura\b.*\bela me mata\b/,
      /\b(?:esse|o) preco e um crime\b/,
      /\b(?:desapareco|desapareceria|sumo)\b.*\b(?:saldo|conta|fatura|boleto)\b.*\b(?:kkk|haha|rs)\b/,
      /\b(?:a vontade era|vontade era|vontade de)\b.*\b(?:sumir|desaparecer)\b.*\b(?:fatura|conta|boleto)\b/,
      /\b(?:sumir|desaparecer)\b.*\b(?:quando vi|ao ver)\b.*\b(?:fatura|conta|boleto)\b/
    ]);
  }

  function isPastOrNegatedSelfSafetyStatement(value) {
    if (/\b(?:estou|to) em seguranca\b.*\bnao (?:vou|penso em|tenho intencao de) me (?:machucar|ferir|matar)\b/.test(value)) return true;
    if (isExplicitNegatedSelfHarmStatement(value)) return true;
    if (/\bnao e que eu queira me matar\b/.test(value) &&
        /\b(?:so|apenas)\b.*\b(?:cansad[oa]|esgotad[oa]|contas|dificil)\b/.test(value)) return true;
    if (/\b(?:ano passado|no ano passado|naquele ano|naquela epoca)\b/.test(value) &&
        /\b(?:hoje|agora)\b.*\b(?:melhor|bem|mais tranquil[oa])\b/.test(value)) return true;
    return false;
  }

  function isExplicitNegatedSelfHarmStatement(value) {
    return /\bnao (?:vou|quero|pretendo) me (?:matar|machucar|ferir)\b/.test(value) &&
      /\b(?:so|apenas)\b.*\b(?:triste|cansad[oa]|desanimad[oa]|queria sumir|queria desaparecer|queria descansar|sem animo)\b/.test(value);
  }

  function hasHeavyNegativeTone(value) {
    return hasAny(value, [
      /\bnao tenho forcas\b/,
      /\bto no limite\b/,
      /\bnao da mais\b/,
      /\bnao consigo fazer mais nada\b/,
      /\bnao sei por que continuo tentando\b/,
      /\bme sinto um lixo\b/,
      /\bnao tenho animo\b/,
      /\bsem vontade de fazer nada\b/,
      /\b(?:to|estou) numa fase muito ruim\b/,
      /\b(?:to|estou) muito mal\b/,
      /\btudo parece pesado\b/,
      /\bnao tenho vontade de nada\b/,
      /\bnao tenho vontade de fazer nada\b/,
      /\bnao consigo mais\b/,
      /\bsem forcas para continuar\b/
    ]);
  }

  function isThirdPartySelfSafetyConcern(value) {
    return hasAny(value, [
      /\b(?:meu|minha)\s+(?:irmao|irma|amigo|amiga|mae|pai|filho|filha|companheiro|companheira|namorado|namorada)\b.*\b(?:disse|falou|contou|escreveu|escrever|mandou|gravou)\b.*\b(?:nao quer mais viver|nao quer viver|nao quer continuar|nao quer estar aqui|nao aguento mais|nao aguenta mais|quer morrer|quer sumir|pensa em se matar|desistir de tudo)\b/,
      /\b(?:meu|minha)\s+(?:irmao|irma|amigo|amiga|mae|pai|filho|filha|companheiro|companheira|namorado|namorada)\b.*\b(?:postou|publicou|escreveu|escrever|mandou|gravou)\b.*\b(?:despedida|se despedindo|audio se despedindo|adeus|tchau|nao aguento mais|nao aguenta mais|nao quer mais viver|sumir)\b/
    ]);
  }

  function isThirdPartyImmediateConcern(value) {
    return hasAny(value, [
      /\b(?:tomou|tomando|pegou|pegando|ingeriu)\b.*\b(?:cartela|comprimidos?|remedios?|medicamentos?)\b/,
      /\b(?:na|em uma) varanda\b.*\b(?:pular|se jogar)\b/,
      /\b(?:vai|quer|pretende)\s+(?:se jogar|pular|se matar)\b/,
      /\b(?:tem tudo pronto|plano pronto|ja escolheu como)\b/,
      /\b(?:se despediu|despedida final|carta de despedida)\b/
    ]);
  }

  function isImmediateSelfSafetyRisk(value) {
    return hasAny(value, [
      /\b(?:tomei|ing[ei]ri|bebi|usei)\b.*\b(?:comprimidos?|remedios?|medicamentos?|veneno)\b/,
      /\b(?:peguei|separei|abri|tirei|estou com|to com|tenho)\b.*\b(?:a )?cartela\b.*\b(?:remedios?|comprimidos?|medicamentos?)\b/,
      /\b(?:peguei|abri|separei|estou com|to com|tenho)\b.*\b(?:o )?(?:vidro|frasco|pote)\b.*\b(?:remedios?|comprimidos?|medicamentos?)\b/,
      /\b(?:to|estou) com (?:o )?veneno\b/,
      /\b(?:vou|quero|pretendo) me despedir de todos\b/,
      /\b(?:deixei|escrevi|preparei|terminei) (?:uma )?(?:carta|mensagem|recado) pronta\b.*\b(?:familia|mae|pai|todos)\b/,
      /\b(?:to|estou) na beirada (?:do|da)\b.*\b(?:viaduto|ponte|predio|varanda)\b/,
      /\b(?:vou|pretendo) partir dessa pra melhor\b/,
      /\b(?:vou|pretendo|estou pensando em) tomar (?:todos os )?(?:os )?(?:comprimidos?|remedios?|medicamentos?)\b/,
      /\b(?:vou|pretendo|decidi|ja escolhi|planejei|tenho um plano)\b.*\b(?:me jogar|pular|saltar|me matar|me suicidar|tirar (?:a )?minha vida|acabar com tudo)\b/,
      /\b(?:ja escolhi como vou fazer|so falta coragem)\b/,
      /\b(?:vou|to pensando em|estou pensando em|pretendo) fazer uma besteira com (?:a )?minha vida\b/,
      /\b(?:vou me jogar|me jogar da|pular da?)\b.*\b(?:ponte|predio|viaduto)\b/,
      /\b(?:to|estou) aqui na varanda\b.*\b(?:pensando em pular|pensando em me jogar|vou pular|vou me jogar)\b/,
      /\b(?:nao vejo|nao tem) (?:nenhuma )?saida\b.*\b(?:vou|quero|pretendo) (?:terminar|acabar) com tudo\b.*\b(?:hoje|agora)\b/,
      /\btenho tudo pronto\b.*\b(?:so falta|falta)\b.*\b(?:escrever|me despedir|carta|recado)\b.*\b(?:mae|pai|familia)\b/
    ]);
  }

  /*
   * Segunda camada independente do interpretador de intenções.
   * Recebe somente o texto da mensagem e devolve low, medium ou high.
   * Não recebe perfil, nome, histórico, saldo ou dados financeiros.
   */
  function assessSelfHarmRisk(message) {
    var value = normalize(message);
    if (!value || isEverydayMetaphor(value)) return 'low';
    if (isExplicitNegatedSelfHarmStatement(value)) return 'low';
    if (isImmediateSelfSafetyRisk(value)) return 'high';
    if (isPastOrNegatedSelfSafetyStatement(value)) return 'low';

    if (hasAny(value, [
      /\b(?:quero|queria|vou|pretendo|penso em|estou pensando em|to pensando em)\s+(?:me\s+)?(?:matar|suicidar)\b/,
      /\b(?:vou|queria|quero|pretendo)\s+(?:me\s+)?(?:machucar|ferir)\b/,
      /\b(?:vou|to pensando em|estou pensando em|pretendo) fazer uma besteira com (?:a )?minha vida\b/,
      /\b(?:tirar|acabar com) a minha vida\b/
    ])) return 'high';

    if (hasAny(value, [
      /\b(?:desligar tudo|sumir|desaparecer)\b.*\b(?:nao voltar|nunca mais voltar)\b/,
      /\b(?:nao voltar|nunca mais voltar)\b/,
      /\b(?:a familia|minha familia)\b.*\bficaria\b.*\b(?:melhor|bem)\b.*\b(?:sem mim|sem esse peso)\b/,
      /\b(?:sou|sinto que sou|me sinto como) (?:um )?peso\b/,
      /\bnao tem mais motivo\b.*\b(?:pra|para) (?:eu )?(?:ficar|continuar|estar) aqui\b/,
      /\bsem esperanca\b/,
      /\bnao sei por que ainda acordo\b/,
      /\bso penso em acabar com tudo\b/,
      /\b(?:quero|queria) acabar com tudo\b/,
      /\b(?:nao aguento mais|nao vejo saida)\b.*\b(?:acabar|sumir|morrer|nao ficar|deixar tudo pra tras)\b/,
      /\bqueria (?:poder )?(?:desligar tudo|nao acordar|nao voltar)\b/,
      /\b(?:quero|queria|vou|penso em|estou pensando em|tenho vontade de|pretendo)\s+(?:me\s+)?(?:sumir|desaparecer)\b/,
      /\bninguem (?:ia|iria|vai) sentir (?:a )?minha falta\b/,
      /\b(?:seria melhor|era melhor|melhor) (?:se )?eu nao existisse\b/,
      /\b(?:seria melhor|era melhor) sem mim\b/,
      /\bnao quero mais estar aqui\b/,
      /\bsinto que(?: eu)? (?:to|estou) sumindo\b/,
      /\b(?:nao quero|nao queria) mais viver\b/,
      /\bso (?:quero|queria) dormir e nao acordar\b/,
      /\bqueria deixar de existir\b/,
      /\bnao aguento mais\b.*\b(?:continuar|viver|ficar|nada)\b/,
      /\b(?:pra|para) que continuar\b/,
      /\b(?:queria|nao quero|nao queria) (?:mais )?acordar(?: amanha)?\b/,
      /\b(?:queria|quero) dormir (?:para|pra) sempre\b/,
      /\bseria melhor se eu sumisse\b/,
      /\bnao consigo continuar\b/,
      /\bnao consigo mais acordar\b/,
      /\b(?:cansei de tudo|cansado de tudo)\b.*\b(?:quero sumir|sumir de vez)\b/,
      /\bnao (?:to |estou )?aguentando mais nada\b.*\b(?:deixar tudo pra tras|sumir)\b/,
      /\bnao aguento mais nada\b.*\b(?:deixar tudo pra tras|sumir)\b/,
      /\b(?:nao tenho|nao vejo) (?:nenhuma )?saida\b/,
      /\bqueria ir embora pra sempre\b/,
      /\bo mundo fica melhor sem mim\b/,
      /\bqueria nao existir(?: mais)?\b/
    ])) return 'medium';

    return 'low';
  }

  function isSelfSafetyRisk(value) {
    return assessSelfHarmRisk(value) !== 'low';
  }



  function hasSensitiveData(message) {
    var raw = String(message || '');
    var normalized = normalize(raw);
    var cpf = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/.test(raw);
    var email = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(raw);
    var password = /\b(?:minha\s+)?(?:senha|password|pass)(?:\s+do\s+[a-z0-9]+){0,4}\s*(?:e|é|:|=)\s*\S+/i.test(raw);
    var cardNumber = /\b(?:\d[ -]?){13,19}\b/.test(raw) && /\b(?:cartao|credito|debito|cvv|cvc)\b/.test(normalized);
    var cardTail = /\bcartao\b.*\b(?:final|terminado em)\s*\d{4}\b/.test(normalized);
    var expiry = /\bvalidade\s*\d{2}\s*\d{2,4}\b/.test(normalized);
    var cvv = /\b(?:cvv|cvc|codigo de seguranca)\s*(?:e|é|:|=)?\s*\d{3,4}\b/.test(normalized);
    var explicitSecret = /\b(?:meu|minha)\s+(?:cpf|senha|cartao completo|numero do cartao|cvv)\b/.test(normalized) && /\b\d{3,}\b/.test(raw);
    return cpf || email || password || cardNumber || (cardTail && (expiry || cvv)) || cvv || explicitSecret;
  }

  function isSensitiveDataRequest(value) {
    return hasAny(value, [
      /\b(?:me manda|manda|me passa|passa|me diga|diga|me informa|informa|me mostra|mostra|consulta|consultar|ver|quero saber|qual e|me da|me de|me traz|me fornece)\b.*\b(?:cpf|saldo|extrato|movimentacao|movimentacoes|conta|cartao|fatura)\b.*\b(?:da|do)\s+(?:minha ex|meu ex|ex|minha|meu|dele|dela|outra pessoa|terceiro)\b/,
      /\b(?:me manda|manda|me passa|passa|me diga|diga|me informa|informa|me mostra|mostra|qual e|me da|me de|me traz|me fornece)\b.*\bcpf\b.*\b(?:cadastrado|cadastrada|registrado|registrada)?\b.*\b(?:do|da)\s+(?:meu|minha|seu|sua)\s+(?:marido|esposa|esposo|mulher|namorado|namorada|pai|mae|filho|filha|irmao|irma|amigo|amiga)\b/
    ]);
  }

  function classify(message, messages, language) {
    var value = normalize(message);
    if (!value) return 'empty';

    /* Segurança é avaliada antes de finanças, memória e conversa. */
    if (isThirdPartyDanger(value)) return 'third_party_danger';
    if (isThirdPartySelfSafetyConcern(value)) return 'third_party_self_safety';
    if (isExplicitNegatedSelfHarmStatement(value)) return 'care_check';
    var riskLevel = assessSelfHarmRisk(message);
    if (riskLevel === 'high' || riskLevel === 'medium') return 'self_safety_crisis';
    if (hasSensitiveData(message)) return 'sensitive_data';
    if (isSensitiveDataRequest(value)) return 'sensitive_data_request';
    if (isEverydayMetaphor(value)) return 'figurative_expression';
    if (isPastOrNegatedSelfSafetyStatement(value)) {
      if (/\bnao e que eu queira me matar\b/.test(value)) return 'tiredness';
      return 'past_reflection';
    }

    if (/\b(?:pode|quero|preciso|me ajuda a)?\s*(?:apagar|apague|limpar|limpe)\b.*\b(?:o que a gente conversou|conversa|mensagens|historico)\b.*\b(?:ontem|antes|de outro dia)\b/.test(value)) {
      return 'forget_past';
    }
    if (/\b(?:esquece|esqueca)\s+(?:o que eu falei|o que eu disse|essa conversa|minhas mensagens)\b/.test(value) ||
        /\b(?:apaga|apague|limpa|limpe)\b.*\b(?:o que eu falei|essa conversa|minhas mensagens|o que eu disse)\b/.test(value)) {
      return 'forget';
    }
    if (/\b(?:o que voce sabe sobre mim|o que sabe de mim|quais dados voce guarda|o que voce guardou|minhas memorias)\b/.test(value)) {
      return 'privacy_summary';
    }
    if (/^(?:deixa pra la|deixa|esquece|nao quero falar|prefiro nao falar|vamos mudar de assunto)$/.test(value) ||
        /\b(?:esquece|deixa)\b.*\bdepois\b.*\ba gente ve\b/.test(value) ||
        /\b(?:ah\s+)?deixa\s+(?:quieto|quieta|isso quieto|pra la|para la)\b/.test(value)) {
      return 'leave_it';
    }

    if (language && language !== 'pt') return 'unsupported_language';

    if (/\b(?:to|estou) sem grana\b.*\bate (?:o )?dia \d{1,2}\b/.test(value)) return 'cashflow_support';
    if (/\b(?:me lembra|lembra|lembrete|quero lembrar|preciso lembrar)\b.*\b(?:pagar|pagamento)\b.*\b(?:amanha|hoje|depois)\b/.test(value)) return 'reminder';
    if (/\b(?:to|estou) devendo\b.*\b(?:por onde comeco|como comeco|o que faco)\b/.test(value)) return 'debt_support';
    if (isFinancialFollowup(value, messages)) return 'financial_followup';
    if (/\b(?:quanto|qual|que valor)\b.*\b(?:vou ter|terei|vai sobrar|sobrara|vou juntar|vou acumular)\b.*\b(?:ano que vem|proximo ano|ano seguinte)\b/.test(value)) {
      return 'forecast_without_data';
    }
    if (isFinancialQuestion(value)) return 'financial';
    if (hasHeavyNegativeTone(value)) return 'care_check';

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
          /\bdecepcionad[oa]\b/, /\bsem animo\b/, /\bdesanimad[oa]\b/,
          /\b(?:ando|estou|to|tenho estado|venho ficando) (?:muito )?pra baixo\b/,
          /\bsem esperanca(?: nenhuma)?\b/
        ])) return 'sadness';

    if (hasAny(value, [
      /\b(?:preocupad[oa]|ansios[oa]|nervos[oa]|inquiet[oa])\b/,
      /\b(?:com medo|com receio|com muita preocupacao)\b/
    ])) return 'worry';

    if (hasAny(value, [/\b(?:sobrecarregad[oa]|perdid[oa]|confus[oa]|sem saber por onde comecar)\b/])) {
      return 'overwhelmed';
    }
    if (hasAny(value, [/\b(?:frustrad[oa]|irritad[oa]|com raiva|chatead[oa]|indignad[oa])\b/])) return 'frustration';
    if (hasAny(value, [
      /\b(?:cansad[oa]|esgotad[oa]|exaust[oa]|sem energia)\b/,
      /\bmort[oa] de cansaco\b/,
      /\bexaust[oa] de tudo\b/
    ])) return 'tiredness';

    if (/\b(?:ano passado|no ano passado|naquela epoca)\b/.test(value) && /\b(?:hoje|agora)\b/.test(value)) return 'past_reflection';
    if (hasAny(value, [
      /\bando sem vontade de fazer nada\b/,
      /\b(?:to|estou) numa fase muito ruim\b/,
      /\bnao tenho animo\b/,
      /\bsem vontade de fazer nada\b/,
      /\bnao sei mais o que fazer\b/,
      /\btudo parece pesado\b/
    ])) return 'care_check';

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
      'Sinto que as coisas têm pesado para você. Como você está se sentindo nos últimos dias?',
      'Parece que você vem carregando muita coisa. Como tem sido para você lidar com isso?'
    ],

    care_check: [
      'Não precisa organizar tudo de uma vez. Como você está? Estou aqui para ouvir sem julgamento.'
    ],
    past_reflection: [
      'Obrigado por me contar. Que bom saber que hoje você está melhor. Como tem se sentido nos últimos dias?'
    ],
    third_party_self_safety: [
      'Leve isso a sério e tente falar com essa pessoa agora, de preferência pessoalmente. Pergunte diretamente se ela pensa em se machucar ou tirar a própria vida. Escute sem julgar, não a deixe sozinha se houver risco e chame alguém de confiança que possa estar perto. O CVV atende pelo 188. Se houver plano, acesso a meios, tentativa ou perigo imediato, ligue para o SAMU 192 agora. Você consegue falar com essa pessoa neste momento?'
    ],
    self_safety_balcony: [
      'Afaste-se da varanda agora e vá para dentro, para um lugar seguro, perto de outras pessoas. Peça a alguém de confiança que fique com você e ligue para o SAMU 192 imediatamente. O CVV atende pelo 188, 24 horas. Você está em segurança agora, longe da varanda e acompanhado?'
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
      'Parece que tudo isso tem pesado bastante. Como você está se sentindo hoje?',
      'Você não precisa resolver tudo neste momento. Como tem ficado emocionalmente com tanta coisa acontecendo?'
    ],
    reminder: [
      'Eu não consigo programar uma notificação automática nesta versão. Para não te prometer um lembrete que não posso disparar, adicione “Pagar a internet” ao calendário do seu celular para amanhã.'
    ],
    debt_support: [
      'Vamos começar separando as despesas essenciais, os vencimentos e os juros, sem assumir outra parcela antes de entender o orçamento. Qual dívida tem juros mais altos ou vence primeiro?'
    ],
    forget_past: [
      'Posso limpar o contexto temporário desta conversa, mas não consigo apagar mensagens de conversas anteriores por aqui. Você quer limpar o contexto atual?'
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
    cashflow_support: [
      'Vamos priorizar o essencial até o dia 10 e adiar o que puder esperar, sem assumir novas parcelas antes de conferir o orçamento. O que precisa ser pago antes do dia 10?'
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
    sensitive_data_request: [
      'Não posso fornecer nem buscar o CPF de outra pessoa. Também não posso consultar nem compartilhar saldo, extrato ou dados financeiros de terceiros. Posso ajudar você a consultar apenas seus próprios registros no Alicerce.'
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
    self_safety_immediate: [
      'Há risco de você se machucar agora. Afaste-se de qualquer meio que possa usar para isso e vá para perto de alguém de confiança. Peça ajuda presencial e ligue para o SAMU 192. O CVV atende pelo 188, 24 horas. Você está em segurança agora e acompanhado neste momento?'
    ],
    self_safety_ingestion: [
      'Isso precisa de ajuda médica agora. Ligue para o SAMU 192 imediatamente ou peça a alguém que ligue por você. Não fique sozinho; vá para perto de alguém de confiança e peça que essa pessoa permaneça com você. O CVV atende pelo 188, 24 horas. Você está em segurança agora, com alguém ao seu lado?'
    ],
    self_safety_medication_plan: [
      'Não tome os medicamentos. Afaste-se da cartela agora e vá para perto de alguém de confiança; peça que essa pessoa fique com você. Ligue para o SAMU 192 imediatamente ou peça que alguém ligue. O CVV atende pelo 188, 24 horas. Você está em segurança agora e longe dos medicamentos?'
    ],
    self_safety_jump: [
      'Afaste-se da ponte e de qualquer lugar alto agora. Vá para perto de outras pessoas e peça a alguém de confiança que fique com você. Ligue para o SAMU 192 imediatamente ou peça que alguém ligue. O CVV atende pelo 188, 24 horas. Você está em segurança agora, longe da ponte e acompanhado?'
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
    var riskLevel = assessSelfHarmRisk(message);
    if (intent === 'self_safety_crisis' && riskLevel === 'high') {
      var normalizedMessage = normalize(message);
      var urgentIntent =
        /\b(?:tomei|ing[ei]ri|bebi|usei)\b.*\b(?:comprimidos?|remedios?|medicamentos?|veneno)\b/.test(normalizedMessage) ?
          'self_safety_ingestion' :
          /\b(?:peguei|separei|abri|tirei|estou com|to com|tenho)\b.*\b(?:a )?cartela\b/.test(normalizedMessage) ?
            'self_safety_medication_plan' :
            /\b(?:to|estou) aqui na varanda\b/.test(normalizedMessage) ?
              'self_safety_balcony' :
              /\b(?:vou me jogar|me jogar da|pular da?)\b.*\b(?:ponte|predio|viaduto)\b/.test(normalizedMessage) ?
                'self_safety_jump' : 'self_safety_immediate';
      return { handled: true, intent: intent, text: chooseResponse(urgentIntent, messages) };
    }
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

  function isSafetyConfirmation(value) {
    var text = normalize(value);
    return /\b(?:sim|estou|to|fico)\b.*\b(?:em seguranca|segura|seguro)\b.*\b(?:nao vou|nao penso|nao tenho intencao|sem intencao)\b.*\b(?:me machucar|me ferir|me matar)\b/.test(text) ||
      /\b(?:sim,? )?(?:estou|to) em seguranca e nao vou me machucar\b/.test(text);
  }

  function installHelpAccess() {
    if (typeof document === 'undefined') return;
    function createAccess() {
      if (!document.body || document.getElementById('alicia-help-now')) return;

      var style = document.createElement('style');
      style.id = 'alicia-help-now-style';
      style.textContent = [
        '#alicia-help-now{position:fixed;right:16px;bottom:16px;z-index:2147483000;border:0;border-radius:999px;padding:13px 17px;background:#8f1d2c;color:#fff;font:600 14px/1.2 system-ui,sans-serif;box-shadow:0 4px 18px rgba(0,0,0,.25);cursor:pointer}',
        '#alicia-help-now:focus-visible,#alicia-help-panel button:focus-visible,#alicia-help-panel a:focus-visible{outline:3px solid #f0b44c;outline-offset:3px}',
        '#alicia-help-panel{position:fixed;right:16px;bottom:76px;z-index:2147483001;width: min(360px, calc(100vw - 32px));box-sizing:border-box;background:#fff;color:#202124;border:1px solid #d7d7d7;border-radius:16px;padding:18px;box-shadow:0 8px 30px rgba(0,0,0,.25);font:14px/1.5 system-ui,sans-serif}',
        '#alicia-help-panel[hidden]{display:none}',
        '#alicia-help-panel h2{font-size:18px;line-height:1.3;margin:0 32px 10px 0}',
        '#alicia-help-panel p{margin:8px 0}',
        '#alicia-help-panel .alicia-help-actions{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}',
        '#alicia-help-panel a{display:inline-block;padding:9px 12px;border-radius:9px;background:#8f1d2c;color:#fff;text-decoration:none;font-weight:600}',
        '#alicia-help-panel button{border:1px solid #a5a5a5;background:#fff;color:#222;border-radius:8px;padding:8px 12px;cursor:pointer}',
        '@media(max-width:480px){#alicia-help-now{right:12px;bottom:12px;padding:12px 14px}#alicia-help-panel{right:12px;bottom:68px;width:calc(100vw - 24px)}}'
      ].join('');
      (document.head || document.body).appendChild(style);

      var button = document.createElement('button');
      button.id = 'alicia-help-now';
      button.type = 'button';
      button.textContent = 'Preciso de ajuda agora';
      button.setAttribute('aria-haspopup', 'dialog');
      button.setAttribute('aria-controls', 'alicia-help-panel');

      var panel = document.createElement('section');
      panel.id = 'alicia-help-panel';
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'false');
      panel.setAttribute('aria-labelledby', 'alicia-help-title');
      panel.hidden = true;

      var heading = document.createElement('h2');
      heading.id = 'alicia-help-title';
      heading.textContent = 'Ajuda imediata';
      var intro = document.createElement('p');
      intro.textContent = 'Se você ou alguém estiver em perigo imediato, procure ajuda presencial e ligue para o SAMU 192.';
      var cvv = document.createElement('p');
      cvv.textContent = 'O CVV oferece apoio emocional gratuito pelo 188, 24 horas.';
      var actions = document.createElement('div');
      actions.className = 'alicia-help-actions';
      var cvvLink = document.createElement('a');
      cvvLink.href = 'tel:188';
      cvvLink.textContent = 'Ligar 188';
      var samuLink = document.createElement('a');
      samuLink.href = 'tel:192';
      samuLink.textContent = 'Ligar 192';
      var cvvSite = document.createElement('a');
      cvvSite.href = 'https://cvv.org.br';
      cvvSite.target = '_blank';
      cvvSite.rel = 'noopener noreferrer';
      cvvSite.textContent = 'Site do CVV';
      var close = document.createElement('button');
      close.type = 'button';
      close.textContent = 'Fechar';
      close.addEventListener('click', function () {
        panel.hidden = true;
        button.setAttribute('aria-expanded', 'false');
        button.focus();
      });

      actions.appendChild(cvvLink);
      actions.appendChild(samuLink);
      actions.appendChild(cvvSite);
      panel.appendChild(heading);
      panel.appendChild(intro);
      panel.appendChild(cvv);
      panel.appendChild(actions);
      panel.appendChild(close);
      document.body.appendChild(panel);
      button.addEventListener('click', function () {
        panel.hidden = !panel.hidden;
        button.setAttribute('aria-expanded', panel.hidden ? 'false' : 'true');
        if (!panel.hidden) close.focus();
      });
      button.setAttribute('aria-expanded', 'false');
      document.body.appendChild(button);
    }

    if (document.readyState === 'loading' && typeof document.addEventListener === 'function') {
      document.addEventListener('DOMContentLoaded', createAccess, { once: true });
    } else {
      createAccess();
    }
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
    registerSafetyAlert: registerSafetyAlert,
    assessSelfHarmRisk: assessSelfHarmRisk,
    isSafetyConfirmation: isSafetyConfirmation
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

      if (intent === 'self_safety_crisis' || intent === 'third_party_danger' || intent === 'third_party_self_safety') {
        this._pendingExpenseDraft = null;
        this._pendingFinancialReview = null;
        var safetyResult = root.AliciaBrain.respond(rawMessage, this._messages, language);
        appendLocalReply(this, '[mensagem de segurança recebida]', safetyResult.text || chooseResponse(intent, this._messages));
        if (intent === 'self_safety_crisis') {
          this._aliciaCareState = {
            level: root.AliciaBrain.assessSelfHarmRisk(rawMessage),
            remaining: 3
          };
        }
        registerSafetyAlert(intent === 'self_safety_crisis' ? 'self_safety' : 'third_party_safety');
        if (input) input.value = '';
        return;
      }

      if (intent === 'sensitive_data' || intent === 'sensitive_data_request') {
        this._pendingExpenseDraft = null;
        this._pendingFinancialReview = null;
        var sensitiveLabel = intent === 'sensitive_data_request' ?
          '[solicitação de dado pessoal bloqueada]' : '[conteúdo sensível omitido]';
        appendLocalReply(this, sensitiveLabel, chooseResponse(intent, this._messages));
        if (input) input.value = '';
        return;
      }

      if (this._aliciaCareState) {
        if (root.AliciaBrain.isSafetyConfirmation(rawMessage)) {
          this._aliciaCareState = null;
          appendLocalReply(this, '[confirmação de segurança]', 'Obrigado por me confirmar. Podemos retomar as finanças com calma quando você quiser. Qual assunto gostaria de retomar?');
          if (input) input.value = '';
          return;
        }
        this._aliciaCareState.remaining = Math.max(0, Number(this._aliciaCareState.remaining || 0) - 1);
        appendLocalReply(this, '[checagem de segurança]', 'Entendo. Antes de voltar ao saldo ou aos gastos, quero confirmar: você está em segurança agora e sem intenção de se machucar?');
        if (input) input.value = '';
        return;
      }

      if (intent === 'sadness' || intent === 'care_check') {
        this._aliciaCareState = { level: 'care', remaining: 3 };
      }

      if (intent === 'forget_past') {
        appendLocalReply(this, '[pedido de exclusão fora do alcance]', chooseResponse('forget_past', this._messages));
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
    installHelpAccess();
  }
})(window);
