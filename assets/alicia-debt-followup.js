/*
 * Alicia — acompanhamento de contas, compromissos e vencimentos
 * Usa exclusivamente os stores existentes do Alicerce.
 * Não marca pagamentos sem uma resposta explícita da pessoa.
 */
(function (root) {
  'use strict';

  if (root.AliciaDebtFollowup) return;

  var PAYMENT_KEY_PREFIX = 'payment:';
  var DEBT_KEYWORDS = /\b(conta|boleto|fatura|divida|debito|aluguel|energia|agua|luz|internet|telefone|mensalidade|imposto|iptu|ipva|seguro|condominio|financiamento|consorcio|parcela)\b/;
  var APPOINTMENT_WORDS = /\b(compromisso|consulta|reuniao|encontro|visita|dentista|medico|medica)\b/;
  var CANCEL_WORDS = /^(cancelar|cancela|deixa|deixa pra la|nao quero|esquece|voltar)$/;

  function normalize(value) {
    return String(value || '').toLowerCase().normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }

  function today() {
    try {
      if (typeof Clock !== 'undefined' && Clock && typeof Clock.today === 'function') {
        return String(Clock.today());
      }
    } catch (ignore) {}
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function validIso(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
    var p = value.split('-').map(Number);
    var d = new Date(p[0], p[1] - 1, p[2]);
    return d.getFullYear() === p[0] && d.getMonth() === p[1] - 1 && d.getDate() === p[2];
  }

  function shiftDate(base, delta) {
    var p = String(base).split('-').map(Number);
    var d = new Date(p[0], p[1] - 1, p[2] + delta);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function parseDate(value) {
    var raw = String(value || '');
    var n = normalize(raw);
    var base = today();
    var match = raw.match(/\b([0-3]?\d)[\/.-]([01]?\d)(?:[\/.-](\d{2,4}))?\b/);
    if (match) {
      var day = Number(match[1]);
      var month = Number(match[2]);
      var year = match[3] ? Number(match[3]) : Number(base.slice(0, 4));
      if (year < 100) year += 2000;
      var iso = String(year) + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
      if (validIso(iso)) return iso;
    }

    var monthNames = {
      janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6,
      julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12
    };
    match = n.match(/\b(\d{1,2})\s+de\s+([a-z]+)(?:\s+de\s+(\d{4}))?\b/);
    if (match && monthNames[match[2]]) {
      var y = Number(match[3] || base.slice(0, 4));
      var mo = monthNames[match[2]];
      var date = String(y) + '-' + String(mo).padStart(2, '0') + '-' + String(Number(match[1])).padStart(2, '0');
      if (validIso(date)) return date;
    }

    if (/\banteontem\b/.test(n)) return shiftDate(base, -2);
    if (/\bontem\b/.test(n)) return shiftDate(base, -1);
    if (/\bhoje\b/.test(n)) return base;
    if (/\bdepois de amanha\b/.test(n)) return shiftDate(base, 2);
    if (/\bamanha\b/.test(n)) return shiftDate(base, 1);

    match = n.match(/\bha\s+(\d{1,3})\s+dias?\b/);
    if (match && Number(match[1]) <= 3650) return shiftDate(base, -Number(match[1]));
    match = n.match(/\bem\s+(\d{1,3})\s+dias?\b/);
    if (match && Number(match[1]) <= 365) return shiftDate(base, Number(match[1]));
    if (/\bsemana passada\b/.test(n)) return shiftDate(base, -7);

    var weekdays = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
    for (var i = 0; i < weekdays.length; i++) {
      if (n.indexOf(weekdays[i]) >= 0) {
        var p = base.split('-').map(Number);
        var currentDay = new Date(p[0], p[1] - 1, p[2]).getDay();
        var delta = (i - currentDay + 7) % 7;
        if (delta === 0) delta = 7;
        return shiftDate(base, delta);
      }
    }
    return '';
  }

  function parseTime(value) {
    var raw = String(value || '');
    var match = raw.match(/(?:às|\bas)\s*(\d{1,2})(?::([0-5]\d)|h([0-5]\d)?)?/i);
    if (!match) match = raw.match(/\b(\d{1,2})h([0-5]\d)?\b/i);
    if (!match) return '';
    var hour = Number(match[1]);
    var minute = Number(match[2] || match[3] || 0);
    var n = normalize(raw);
    if (/\bda noite\b/.test(n) && hour >= 1 && hour <= 11) hour += 12;
    else if (/\bda tarde\b/.test(n) && hour >= 1 && hour <= 5) hour += 12;
    if (hour > 23 || minute > 59) return '';
    return String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0');
  }

  function parseMoney(value) {
    var raw = String(value || '');
    var match = raw.match(/R\$\s*([\d.]+(?:,[0-9]{1,2})?)/i);
    if (!match) match = raw.match(/\b([\d.]+(?:,[0-9]{1,2})?)\s*reais?\b/i);
    if (!match) match = raw.match(/\bvalor(?:\s+de)?\s*([\d.]+(?:,[0-9]{1,2})?)/i);
    if (!match) return null;
    var amount = String(match[1]).replace(/\.$/, '');
    if (amount.indexOf(',') >= 0) amount = amount.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(?:\.\d{3})+$/.test(amount)) amount = amount.replace(/\./g, '');
    var result = Number(amount);
    return isFinite(result) && result > 0 && result <= 10000000 ? result : null;
  }

  function stripWakeWord(value) {
    return String(value || '').replace(/^\s*(?:(?:oi|ola|bom dia|boa tarde|boa noite)\s*[,!.-]?\s*)?(?:alicia|alícia)\s*[,!:.;-]?\s*/i, '').trim();
  }

  function formatMoney(value) {
    try {
      if (typeof fmtMoney === 'function') return fmtMoney(Number(value) || 0);
    } catch (ignore) {}
    return 'R$ ' + (Number(value) || 0).toFixed(2).replace('.', ',');
  }

  function formatDate(value) {
    try {
      if (typeof fmtDate === 'function') return fmtDate(value);
    } catch (ignore) {}
    return String(value || '');
  }

  function escaped(value) {
    try {
      if (typeof esc === 'function') return esc(String(value || ''));
    } catch (ignore) {}
    return String(value || '').replace(/[&<>"']/g, function (ch) {
      return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch];
    });
  }

  function addCommitment(record) {
    if (!record || !Store || !Store.userId) return null;
    if (typeof Store.addCommitment === 'function') return Store.addCommitment(record);
    Store.commitments = Array.isArray(Store.commitments) ? Store.commitments : [];
    record.id = record.id || (typeof Store._uid === 'function' ? Store._uid() : String(Date.now()));
    record.userId = Store.userId;
    Store.commitments.push(record);
    if (typeof Store.save === 'function') Store.save();
    return record;
  }

  function obligationDescription(value) {
    return String(value && (value.descricao || value.description || value.local || value.pessoa) || '').trim();
  }

  function paymentDateFor(record, source) {
    if (!record) return '';
    var direct = record.dataPagamento || record.paidAt || record.paid_at || '';
    if (validIso(direct)) return direct;
    var movementId = record.cashMovementId || record.expenseMovementId || record.paymentMovementId || '';
    if (movementId && Array.isArray(Store.movements)) {
      var linked = Store.movements.find(function (item) { return item && String(item.id) === String(movementId); });
      if (linked && validIso(linked.dataPagamento || linked.data)) return linked.dataPagamento || linked.data;
    }
    if (source === 'installment' && Array.isArray(Store.movements)) {
      var related = Store.movements.find(function (item) {
        return item && String(item.installmentId || '') === String(record.id) &&
          item.tipo === 'transferencia' && item.direction === 'saida' &&
          (item.status === 'pago' || item.status === 'recebido') && validIso(item.data);
      });
      if (related) return related.data;
    }
    return '';
  }

  function getObligations() {
    var result = [];
    var seen = {};
    var todayValue = today();

    function push(source, record, id, description, amount, dueDate, status) {
      if (!record || !validIso(String(dueDate || ''))) return;
      var key = source + ':' + String(id || record.id || '');
      if (seen[key]) return;
      seen[key] = true;
      var paymentStatus = normalize(record.paymentStatus || '');
      var isPaid = paymentStatus === 'pago' || status === 'pago' || status === 'recebido' ||
        (status === 'concluido' && paymentStatus !== 'pendente');
      var paidDate = isPaid ? paymentDateFor(record, source) : '';
      var due = String(dueDate);
      result.push({
        key: key,
        source: source,
        id: String(id || record.id || ''),
        description: String(description || 'Conta sem descrição'),
        amount: Number(amount) || 0,
        dueDate: due,
        status: isPaid ? 'pago' : 'pendente',
        paidDate: paidDate,
        paidLate: !!(isPaid && paidDate && paidDate > due),
        overdue: !isPaid && due < todayValue,
        dueToday: !isPaid && due === todayValue,
        record: record
      });
    }

    (Array.isArray(Store.installments) ? Store.installments : []).forEach(function (item) {
      if (!item || ['receber', 'cartao'].indexOf(String(item.tipo || '')) >= 0) return;
      if (['pagar', 'financiamento', 'consorcio'].indexOf(String(item.tipo || '')) < 0) return;
      push('installment', item, item.id, obligationDescription(item), item.valor, item.data, item.status);
    });

    (Array.isArray(Store.movements) ? Store.movements : []).forEach(function (item) {
      if (!item || item.tipo !== 'despesa' || item.installmentId || item.commitmentId) return;
      var label = obligationDescription(item) || item.estabelecimento;
      var financial = item.naturezaFinanceira === 'divida' || item.paymentStatus === 'pendente' ||
        (item.status !== 'pago' && item.status !== 'recebido' && DEBT_KEYWORDS.test(normalize(label)));
      if (!financial) return;
      var due = item.dataVencimento || item.vencimentoOriginal || item.data;
      push('movement', item, item.id, label, item.valor, due, item.status);
    });

    (Array.isArray(Store.commitments) ? Store.commitments : []).forEach(function (item) {
      if (!item || item.tipo === 'lembrete' || item.personId) return;
      var label = obligationDescription(item);
      var financial = item.naturezaFinanceira === 'divida' || item.tipo === 'conta' ||
        (Number(item.valor) > 0 && DEBT_KEYWORDS.test(normalize(label)));
      if (!financial) return;
      push('commitment', item, item.id, label, item.valor, item.dataVencimento || item.data, item.status);
    });

    result.sort(function (a, b) {
      if (a.status !== b.status) return a.status === 'pendente' ? -1 : 1;
      return String(a.dueDate).localeCompare(String(b.dueDate));
    });
    return result;
  }

  function getOverview() {
    var list = getObligations();
    var output = {overdue: [], dueToday: [], upcoming: [], paidLate: [], all: list};
    list.forEach(function (item) {
      if (item.overdue) output.overdue.push(item);
      if (item.dueToday) output.dueToday.push(item);
      if (item.paidLate) output.paidLate.push(item);
      if (item.status === 'pendente' && item.dueDate > today() && item.dueDate <= shiftDate(today(), 30)) output.upcoming.push(item);
    });
    output.overdueTotal = output.overdue.reduce(function (sum, item) { return sum + item.amount; }, 0);
    output.dueTodayTotal = output.dueToday.reduce(function (sum, item) { return sum + item.amount; }, 0);
    output.paidLateTotal = output.paidLate.reduce(function (sum, item) { return sum + item.amount; }, 0);
    return output;
  }

  function paymentQuestion(item) {
    if (item.dueToday) {
      return 'Hoje era o dia do pagamento de "' + item.description + '" (' + formatMoney(item.amount) + '). A casa conseguiu pagar?';
    }
    return 'A conta "' + item.description + '" venceu em ' + formatDate(item.dueDate) + ' e continua pendente. A casa conseguiu pagar ou ainda está em atraso?';
  }

  function findObligation(key) {
    var list = getObligations();
    for (var i = 0; i < list.length; i++) if (list[i].key === key) return list[i];
    return null;
  }

  function recordPaymentCheck(item, answer) {
    var record = item && item.record;
    if (!record) return;
    record.paymentCheck = {
      askedAt: today(),
      answeredAt: today(),
      answer: answer
    };
    if (typeof Store.save === 'function') Store.save();
  }

  function markPaid(item, paidDate) {
    if (!item || !item.record) throw new Error('Não encontrei a conta que precisa ser atualizada.');
    if (!validIso(paidDate)) paidDate = today();
    var record = item.record;

    if (item.status === 'pago') return item;

    if (item.source === 'installment') {
      if (typeof Store.processInstallmentPayment !== 'function') {
        throw new Error('O fluxo de pagamento desta parcela não está disponível.');
      }
      Store.processInstallmentPayment(record.id);
      record.dataPagamento = paidDate;
      var linked = (Store.movements || []).find(function (movement) {
        return movement && String(movement.id) === String(record.cashMovementId || '') ||
          (movement && String(movement.installmentId || '') === String(record.id) &&
            movement.tipo === 'transferencia' && movement.direction === 'saida');
      });
      if (linked) {
        linked.data = paidDate;
        linked.dataPagamento = paidDate;
      }
      Store.save();
      return item;
    }

    if (item.source === 'movement') {
      record.dataVencimento = record.dataVencimento || record.vencimentoOriginal || record.data;
      record.vencimentoOriginal = record.vencimentoOriginal || record.dataVencimento;
      record.dataPagamento = paidDate;
      record.data = paidDate;
      record.status = 'pago';
      Store.save();
      return item;
    }

    if (item.source === 'commitment') {
      var existingMovement = (Store.movements || []).find(function (movement) {
        return movement && (
          String(movement.id || '') === String(record.expenseMovementId || '') ||
          String(movement.commitmentId || '') === String(record.id || '')
        );
      }) || null;
      if (!existingMovement) {
        var movement = Store.addMovement({
          tipo: 'despesa',
          descricao: item.description,
          estabelecimento: item.description,
          valor: item.amount,
          data: paidDate,
          status: 'pago',
          categoria: record.categoria || 'outros',
          subcategoria: record.subcategoria || 'outros',
          naturezaFinanceira: 'divida',
          commitmentId: record.id,
          source: 'alicia-debt-payment'
        });
        if (!movement || !movement.id) throw new Error('O Alicerce não confirmou o registro do pagamento.');
        record.expenseMovementId = movement.id;
      } else {
        existingMovement.tipo = 'despesa';
        existingMovement.descricao = item.description;
        existingMovement.estabelecimento = existingMovement.estabelecimento || item.description;
        existingMovement.valor = item.amount;
        existingMovement.data = paidDate;
        existingMovement.dataPagamento = paidDate;
        existingMovement.status = 'pago';
        existingMovement.naturezaFinanceira = 'divida';
      }
      record.status = 'concluido';
      record.paymentStatus = 'pago';
      record.dataPagamento = paidDate;
      Store.save();
      return item;
    }
    throw new Error('Este tipo de conta não pode ser atualizado por este fluxo.');
  }

  function createDebt(draft) {
    var isPaid = draft.paymentStatus === 'pago';
    var item = addCommitment({
      tipo: 'compromisso',
      descricao: draft.description,
      valor: draft.amount,
      data: draft.dueDate,
      dataVencimento: draft.dueDate,
      status: 'pendente',
      paymentStatus: 'pendente',
      naturezaFinanceira: 'divida',
      origem: 'alicia',
      dataPagamento: ''
    });
    if (!item) throw new Error('O Alicerce não confirmou o cadastro dessa conta.');
    if (isPaid) {
      var movement = null;
      try {
        movement = Store.addMovement({
          tipo: 'despesa',
          descricao: draft.description,
          estabelecimento: draft.description,
          valor: draft.amount,
          data: draft.paidDate || today(),
          status: 'pago',
          categoria: 'outros',
          subcategoria: 'outros',
          naturezaFinanceira: 'divida',
          commitmentId: item.id,
          source: 'alicia-debt-payment'
        });
      } catch (ignore) {}
      if (!movement || !movement.id) {
        return {paymentNotRegistered: true, descricao: item.descricao};
      }
      item.expenseMovementId = movement.id;
      item.status = 'concluido';
      item.paymentStatus = 'pago';
      item.dataPagamento = draft.paidDate || today();
      Store.save();
    }
    return item;
  }

  function startDebtDraft(message) {
    var raw = stripWakeWord(message);
    var dueDate = parseDate(raw);
    var amount = parseMoney(raw);
    var paid = /\b(ja paguei|paguei|foi paga|foi pago|quitada|quitado)\b/i.test(normalize(raw));
    var description = raw;
    description = description.replace(/^\s*(?:(?:por favor)\s*)?(?:tenho|tem|existe|anota|anote|registre|registra|cadastre|cadastra|inclua|inclui|adicione|adiciona|guarda|guarde|paguei|pagamos|quitei|quitamos)\s+/i, '');
    description = description.replace(/^\s*(?:uma|um|a|essa|esta|antiga|velha)\s+/i, '');
    description = description.replace(/\b(?:conta|divida|dividas|boleto|fatura|debito|antiga|velha|atrasada|vencida|pendente)\b/gi, ' ');
    description = description.replace(/\bR\$\s*[\d.]+(?:,[0-9]{1,2})?|\b[\d.]+(?:,[0-9]{1,2})?\s*reais?\b/gi, ' ');
    description = description.replace(/\b(?:que\s+)?(?:venceu|vencia|vencimento|vencida|atrasou|atrasada|com vencimento)\s*(?:no dia|dia|em|para)?\s*\d{1,2}(?:[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?| de [a-z]+(?: de \d{4})?)?/gi, ' ');
    description = description.replace(/\b(?:e\s+)?(?:j[aá] paguei|paguei|pagamos|j[aá] quitei|quitei|quitamos|foi paga|foi pago|quitada|quitado|n[aã]o paguei|ainda n[aã]o paguei)\b.*$/i, ' ');
    description = description.replace(/\b(?:no dia\s+)?\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?\b/g, ' ');
    description = description.replace(/\b(?:hoje|ontem|anteontem|amanha|depois de amanha|semana passada)\b/gi, ' ');
    description = description.replace(/\s+/g, ' ').replace(/^[,.:;\/\s-]+|[,.:;\/\s-]+$/g, '').trim();
    description = description.replace(/^(?:de|do|da|dos|das|para|pra)\s+/i, '').replace(/\s+(?:de|do|da|dos|das|para|pra)$/i, '').trim();
    if (/^(?:de|do|da|dos|das|para|pra)$/i.test(description)) description = '';
    var paymentMatch = normalize(raw).match(/\b(paguei|pagamos|ja paguei|foi paga|foi pago|quitei|quitamos|quitada|quitado)\b/);
    var paidDate = today();
    if (paid && paymentMatch) {
      var paymentTail = normalize(raw).slice(paymentMatch.index + paymentMatch[0].length);
      paidDate = parseDate(paymentTail) || today();
    }
    return {description: description, amount: amount, dueDate: dueDate, paymentStatus: paid ? 'pago' : 'pendente', paidDate: paid ? paidDate : ''};
  }

  function debtFollowupQuestion(draft) {
    if (!draft.description) return 'De qual conta antiga estamos falando? Pode ser luz, água, internet, aluguel ou outra.';
    if (draft.amount === null) return 'Qual é o valor dessa conta?';
    if (!draft.dueDate) return 'Qual era a data original do vencimento? Pode ser uma data passada, mesmo que a conta seja antiga.';
    return '';
  }

  function startAppointmentDraft(message) {
    var raw = stripWakeWord(message);
    var date = parseDate(raw);
    var time = parseTime(raw);
    var description = raw;
    description = description.replace(/^\s*(?:por favor\s*)?(?:marcar|marque?|marca|agende?|agenda|crie?|criar|anote?|anotar|registre?|registrar|adicione|adiciona|programe|programar)\s+/i, '');
    description = description.replace(/^\s*(?:um|uma|novo|nova)\s+/i, '');
    description = description.replace(/^\s*(?:compromisso|consulta|reuniao|encontro|visita)\s*(?:\b(?:com|de|para|sobre)\b)?\s*/i, '');
    description = description.replace(/\b(?:compromisso|consulta|reuniao|encontro|visita)\b/gi, ' ');
    description = description.replace(/\b(?:para mim|pra mim|por favor|hoje|ontem|segunda(?:\s+feira)?|terca(?:\s+feira)?|quarta(?:\s+feira)?|quinta(?:\s+feira)?|sexta(?:\s+feira)?|sabado|domingo)\b/gi, ' ');
    description = description.replace(/depois de amanh[aã]|amanh[aã]/gi, ' ');
    description = description.replace(/(?:às|\bas)\s*\d{1,2}(?::\d{2}|h\d{0,2})?/gi, ' ');
    description = description.replace(/\b\d{1,2}h\d{0,2}\b/gi, ' ');
    description = description.replace(/\b\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?\b/g, ' ');
    description = description.replace(/\b(?:mim|para mim|pra mim)\b/gi, ' ');
    description = description.replace(/\s+/g, ' ').replace(/^[,.:;\/\s-]+|[,.:;\/\s-]+$/g, '').trim();
    description = description.replace(/^(?:com|de|do|da|para|pra)\s+/i, '').trim();
    return {description: description, date: date, time: time};
  }

  function appointmentQuestion(draft) {
    if (!draft.description) return 'Qual compromisso você quer marcar?';
    if (!draft.date) return 'Para qual dia devo marcar "' + draft.description + '"? Pode dizer amanhã, sexta-feira ou uma data.';
    if (!draft.time && !draft.noTime) return 'Qual horário devo colocar? Se ainda não souber, diga "sem horário".';
    return '';
  }

  function createAppointment(draft) {
    var item = addCommitment({
      tipo: 'compromisso',
      descricao: draft.description,
      valor: null,
      data: draft.date,
      hora: draft.time || '',
      detalhes: '',
      status: 'pendente',
      origem: 'alicia'
    });
    if (!item) throw new Error('O Alicerce não confirmou a criação do compromisso.');
    return item;
  }

  function respond(assistant, userMessage, answer) {
    assistant._messages = Array.isArray(assistant._messages) ? assistant._messages : [];
    assistant._messages.push({role: 'user', text: userMessage});
    assistant._messages.push({role: 'assistant', text: answer});
    while (assistant._messages.length > 8) assistant._messages.splice(0, 2);
    assistant._question = userMessage;
    assistant._answer = answer;
    if (typeof render === 'function') render();
    if (typeof assistant._voiceEnabled === 'function' && assistant._voiceEnabled() &&
        typeof assistant.ouvirMensagem === 'function') {
      setTimeout(function () { assistant.ouvirMensagem(assistant._messages.length - 1, null); }, 0);
    }
    return answer;
  }

  function cancelDraft(assistant) {
    assistant._pendingDebtDraft = null;
    assistant._pendingAppointmentDraft = null;
    return 'Tudo bem. Cancelei essa etapa. Nenhum dado foi alterado.';
  }

  function handleAppointment(assistant, message) {
    var draft = assistant._pendingAppointmentDraft;
    if (!draft) draft = startAppointmentDraft(message);
    else {
      var raw = stripWakeWord(message);
      if (!draft.description) {
        var newDraft = startAppointmentDraft('marcar compromisso ' + raw);
        if (newDraft.description) draft.description = newDraft.description;
      }
      if (!draft.date) draft.date = parseDate(raw);
      if (!draft.time) draft.time = parseTime(raw);
      if (/^(sem horario|nao sei o horario|ainda nao sei)$/i.test(normalize(raw))) draft.noTime = true;
    }
    assistant._pendingAppointmentDraft = draft;
    var question = appointmentQuestion(draft);
    if (question) return question;
    if (!Store.userId) return 'Entre na sua conta para eu salvar esse compromisso no seu calendário.';
    var created = createAppointment(draft);
    assistant._pendingAppointmentDraft = null;
    return 'Pronto. Marquei "' + created.descricao + '" para ' + formatDate(created.data) +
      (created.hora ? ' às ' + created.hora : '') + '. Ele já está no seu calendário.';
  }

  function handleDebt(assistant, message) {
    var draft = assistant._pendingDebtDraft;
    if (!draft) draft = startDebtDraft(message);
    else {
      var raw = stripWakeWord(message);
      if (!draft.description) {
        var candidate = raw.replace(/^\s*(?:e|é|a conta e|a conta é|chama-se)\s+/i, '').trim();
        if (candidate && !parseMoney(candidate) && !parseDate(candidate)) draft.description = candidate;
      }
      if (draft.amount === null) draft.amount = parseMoney(raw);
      if (!draft.dueDate) draft.dueDate = parseDate(raw);
      if (/\b(ja paguei|paguei|foi paga|foi pago|quitada|quitado)\b/i.test(normalize(raw))) {
        draft.paymentStatus = 'pago';
        draft.paidDate = parseDate(raw) || today();
      }
    }
    assistant._pendingDebtDraft = draft;
    var question = debtFollowupQuestion(draft);
    if (question) return question;
    if (!Store.userId) return 'Entre na sua conta para eu guardar essa conta antiga no seu histórico financeiro.';
    var created = createDebt(draft);
    assistant._pendingDebtDraft = null;
    if (created.paymentNotRegistered) {
      return 'Cadastrei "' + created.descricao + '", mas não consegui registrar a saída do pagamento. Mantive a conta como pendente para não alterar seu saldo nem marcá-la como quitada sem confirmação do lançamento. Confira a Visão Financeira antes de tentar novamente.';
    }
    if (created.paymentStatus === 'pago') {
      return 'Registrei "' + created.descricao + '" como paga em ' + formatDate(created.dataPagamento) +
        (created.dataPagamento > created.data ? ', depois do vencimento. Vou mostrá-la entre as dívidas pagas em atraso.' : '.');
    }
    return 'Cadastrei "' + created.descricao + '" no valor de ' + formatMoney(created.valor) +
      ', com vencimento original em ' + formatDate(created.data) +
      (created.data < today() ? '. Ela já aparece como dívida em atraso; nada foi marcado como pago.' : '. Vou acompanhar esse vencimento.');
  }

  function replyToPaymentCheck(assistant, message) {
    var pending = assistant._pendingPaymentCheck;
    var item = pending && findObligation(pending.key);
    if (!item) {
      assistant._pendingPaymentCheck = null;
      return 'Não consegui localizar essa conta na sua agenda financeira. Nenhuma alteração foi feita.';
    }
    var n = normalize(message);
    var partial = /\b(parcial|uma parte|metade|sinal)\b/.test(n);
    var no = /^(nao|nao consegui|ainda nao|nao paguei|continua pendente|vou pagar|vou tentar|nao foi possivel|nao deu)$/.test(n) ||
      /\b(ainda nao paguei|nao consegui pagar|nao foi paga|nao foi pago)\b/.test(n);
    var yes = /^(sim|sim paguei|paguei|pagamos|pagou|conseguimos|consegui|foi pago|foi paga|ja paguei|quitado|quitada|pago|paga)$/.test(n) ||
      /\b(paguei|pagamos|a casa pagou|conseguimos pagar|consegui pagar|foi pago|foi paga|ja quitamos|ja quitei)\b/.test(n);
    if (partial) {
      recordPaymentCheck(item, 'parcial');
      assistant._pendingPaymentCheck = null;
      return 'Entendi. Como o Alicerce ainda não controla pagamento parcial dessa conta, mantive o valor total como pendente. Atualize o valor restante no lançamento para não alterar seu saldo incorretamente.';
    }
    if (no) {
      recordPaymentCheck(item, 'nao_pago');
      assistant._pendingPaymentCheck = null;
      return item.dueDate < today()
        ? 'Tudo bem. Mantive "' + item.description + '" como pendente e em atraso na Visão Financeira. Não registrei saída de dinheiro.'
        : 'Tudo bem. Mantive "' + item.description + '" como pendente. Não registrei saída de dinheiro.';
    }
    if (yes) {
      var paidDate = parseDate(message) || today();
      try {
        markPaid(item, paidDate);
      } catch (error) {
        return 'Não consegui confirmar o lançamento do pagamento de "' + item.description + '". Mantive a confirmação pendente e não vou considerar a conta quitada até o registro financeiro ser concluído.';
      }
      assistant._pendingPaymentCheck = null;
      var late = paidDate > item.dueDate;
      return 'Registrei "' + item.description + '" como paga em ' + formatDate(paidDate) +
        (late ? '. Como o pagamento ocorreu depois do vencimento, ela aparece em "Dívidas pagas em atraso" na Visão Financeira.' : '. Ela foi paga dentro do prazo.');
    }
    return 'Só para confirmar: a casa conseguiu pagar "' + item.description + '" ou ela continua pendente?';
  }

  function financialAnswer(message) {
    var n = normalize(message);
    if (!/\b(divida|dividas|conta|contas|boleto|boletos|fatura|faturas|atraso|atrasada|atrasadas|vencida|vencidas|pagas|pagamentos)\b/.test(n)) return null;
    if (!/\b(quais|minhas|meus|quantas|quanto|como|mostra|mostre|listar|liste|ver|tem|tenho|estao|esta|foram|pagas|pagos|paguei|atrasad|vencid|vencem|historico|situacao)\b/.test(n)) return null;
    var view = getOverview();
    var lines = [];
    if (view.overdue.length) {
      lines.push('Em atraso: ' + view.overdue.length + ' conta(s), total de ' + formatMoney(view.overdueTotal) + '.');
      view.overdue.slice(0, 5).forEach(function (x) {
        lines.push('- ' + x.description + ': ' + formatMoney(x.amount) + ', venceu em ' + formatDate(x.dueDate) + '.');
      });
    } else lines.push('Não encontrei dívidas vencidas em aberto nas contas acompanhadas.');
    if (view.dueToday.length) {
      lines.push('Vencem hoje: ' + view.dueToday.length + ' conta(s), total de ' + formatMoney(view.dueTodayTotal) + '.');
    }
    if (view.paidLate.length) {
      lines.push('Pagas após o vencimento: ' + view.paidLate.length + ' conta(s), total de ' + formatMoney(view.paidLateTotal) + '.');
      view.paidLate.slice(0, 5).forEach(function (x) {
        lines.push('- ' + x.description + ': vencimento ' + formatDate(x.dueDate) + ', pagamento ' + formatDate(x.paidDate) + '.');
      });
    } else lines.push('Ainda não há pagamentos em atraso com as duas datas confirmadas.');
    return lines.join('\n');
  }

  function handleMessage(assistant, message) {
    var raw = String(message || '').trim();
    if (!raw) return null;
    var n = normalize(stripWakeWord(raw));

    if (assistant._pendingPaymentCheck) return replyToPaymentCheck(assistant, raw);

    if (assistant._pendingAppointmentDraft) {
      if (CANCEL_WORDS.test(n)) return cancelDraft(assistant);
      return handleAppointment(assistant, raw);
    }
    if (assistant._pendingDebtDraft) {
      if (CANCEL_WORDS.test(n)) return cancelDraft(assistant);
      return handleDebt(assistant, raw);
    }

    var appointmentIntent = /\b(marcar|marca|marque|agendar|agenda|agende|criar|crie|anotar|anote|registrar|registre)\b/.test(n) &&
      APPOINTMENT_WORDS.test(n);
    if (appointmentIntent) return handleAppointment(assistant, raw);

    var debtIntent = DEBT_KEYWORDS.test(n) &&
      /\b(tenho|tem|anota|anote|registre|registra|cadastre|cadastra|inclua|inclui|adicione|adiciona|guarda|guarde|venceu|vencia|vencida|atrasada|atraso|nao paguei|ficou|pendente|antiga|antigo|de antes|ja paguei|paguei)\b/.test(n);
    if (debtIntent) return handleDebt(assistant, raw);

    return financialAnswer(raw);
  }

  function renderFinancialSummary() {
    var view = getOverview();
    var html = '<section class="card mt-3" aria-label="Contas e dívidas acompanhadas pela Alicia">';
    html += '<div style="font-weight:750;margin-bottom:10px">Contas e dívidas acompanhadas pela Alicia</div>';
    html += '<div class="list-item"><div class="li-info"><div class="li-name">Em atraso</div><div class="li-sub">' + view.overdue.length + ' conta(s)</div></div><div class="li-amount text-red">' + formatMoney(view.overdueTotal) + '</div></div>';
    html += '<div class="list-item"><div class="li-info"><div class="li-name">Vencem hoje</div><div class="li-sub">' + view.dueToday.length + ' conta(s)</div></div><div class="li-amount">' + formatMoney(view.dueTodayTotal) + '</div></div>';
    html += '<div class="list-item"><div class="li-info"><div class="li-name">Pagas após o vencimento</div><div class="li-sub">' + view.paidLate.length + ' conta(s)</div></div><div class="li-amount">' + formatMoney(view.paidLateTotal) + '</div></div>';
    if (view.overdue.length) {
      html += '<div class="text-sm mt-2">';
      view.overdue.slice(0, 4).forEach(function (item) {
        html += '<div style="padding:7px 0;border-top:1px solid var(--line)">' + escaped(item.description) + ' · ' + formatMoney(item.amount) + ' · venceu ' + escaped(formatDate(item.dueDate)) + '</div>';
      });
      html += '</div>';
    }
    if (view.paidLate.length) {
      html += '<div class="text-sm mt-2">';
      view.paidLate.slice(0, 4).forEach(function (item) {
        html += '<div style="padding:7px 0;border-top:1px solid var(--line)">' + escaped(item.description) + ' · paga em ' + escaped(formatDate(item.paidDate)) + ' (vencimento ' + escaped(formatDate(item.dueDate)) + ')</div>';
      });
      html += '</div>';
    }
    html += '</section>';
    return html;
  }

  function addHomeCard() {
    var original = Store.getSmartCards;
    if (typeof original !== 'function' || original._aliciaPaymentWrapped) return;
    var wrapped = function () {
      var cards = original.apply(this, arguments) || [];
      var view = getOverview();
      var candidates = view.dueToday.concat(view.overdue).filter(function (item) {
        return !item.record.paymentCheck || item.record.paymentCheck.askedAt !== today();
      }).slice(0, 3);
      if (candidates.length) {
        candidates.forEach(function (candidate, index) {
          var label = candidate.dueToday
            ? 'Hoje é o dia do pagamento'
            : 'Conta em atraso desde ' + formatDate(candidate.dueDate);
          cards.push({
            pr: index,
            type: 'alicia-payment-check',
            title: 'Alicia quer confirmar',
            text: label + ': ' + candidate.description + ' · ' + formatMoney(candidate.amount) + '. A casa conseguiu pagar?',
            go: "AliciaDebtFollowup.openPaymentCheck('" + encodeURIComponent(candidate.key) + "')",
            lbl: 'Responder à Alicia'
          });
        });
      } else if (view.paidLate.length) {
        cards.push({
          pr: 5,
          type: 'alicia-paid-late',
          title: 'Pagamentos feitos após o vencimento',
          text: view.paidLate.length + ' conta(s) · ' + formatMoney(view.paidLateTotal),
          go: "go('visao')",
          lbl: 'Ver na Visão Financeira'
        });
      }
      cards.sort(function (a, b) { return (Number(a.pr) || 0) - (Number(b.pr) || 0); });
      return cards.slice(0, 5);
    };
    wrapped._aliciaPaymentWrapped = true;
    Store.getSmartCards = wrapped;
  }

  function openPaymentCheck(encodedKey) {
    var key = '';
    try { key = decodeURIComponent(String(encodedKey || '')); } catch (ignore) {}
    var item = findObligation(key);
    if (!item) {
      if (typeof showToast === 'function') showToast('Não encontrei essa conta. Atualize a Visão Financeira.');
      return false;
    }
    if (typeof go === 'function') go('assistente');
    else {
      Store.screen = 'assistente';
      if (typeof render === 'function') render();
    }
    var assistant = AlicerceIA;
    assistant._pendingPaymentCheck = {key: key};
    assistant._messages = Array.isArray(assistant._messages) ? assistant._messages : [];
    var prompt = paymentQuestion(item);
    assistant._messages.push({role: 'assistant', text: prompt});
    while (assistant._messages.length > 8) assistant._messages.splice(0, 2);
    assistant._question = '';
    assistant._answer = prompt;
    if (typeof render === 'function') render();
    return true;
  }

  function install() {
    if (typeof Store === 'undefined' || typeof AlicerceIA === 'undefined') return false;
    Store.getDebtStatusOverview = getOverview;

    var originalReset = AlicerceIA._resetUser;
    if (typeof originalReset === 'function' && !originalReset._aliciaFollowupWrapped) {
      var resetWrapped = function () {
        var previous = String(this._userId || '');
        var result = originalReset.apply(this, arguments);
        if (previous !== String(this._userId || '')) {
          this._pendingPaymentCheck = null;
          this._pendingDebtDraft = null;
          this._pendingAppointmentDraft = null;
        }
        return result;
      };
      resetWrapped._aliciaFollowupWrapped = true;
      AlicerceIA._resetUser = resetWrapped;
    }

    var originalSend = AlicerceIA.enviarMensagem;
    if (typeof originalSend === 'function' && !originalSend._aliciaFollowupWrapped) {
      var sendWrapped = async function (question) {
        this._resetUser();
        var input = typeof document !== 'undefined' ? document.getElementById('alicerce-assistant-input') : null;
        var message = String(question !== undefined ? question : (input ? input.value : '') || '').trim();
        if (message) {
          var handled = handleMessage(this, message);
          if (handled !== null && handled !== undefined) return respond(this, message, handled);
        }
        return originalSend.apply(this, arguments);
      };
      sendWrapped._aliciaFollowupWrapped = true;
      AlicerceIA.enviarMensagem = sendWrapped;
    }

    var originalParser = AlicerceIA._parseExpenseCommand;
    if (typeof originalParser === 'function' && !originalParser._aliciaWakeWordWrapped) {
      var parserWrapped = function (value) {
        var raw = stripWakeWord(value);
        raw = raw.replace(/\bcompre\b/gi, 'comprar');
        return originalParser.call(this, raw);
      };
      parserWrapped._aliciaWakeWordWrapped = true;
      AlicerceIA._parseExpenseCommand = parserWrapped;
    }

    var originalOpening = AlicerceIA.mensagemAbertura;
    if (typeof originalOpening === 'function' && !originalOpening._aliciaIntroWrapped) {
      var openingWrapped = function () {
        var lang = Store.lang || 'pt';
        var name = '';
        try { name = String(Store.settings && Store.settings.displayName || '').trim().split(/\s+/)[0]; } catch (ignore) {}
        if (lang === 'en') return 'Hi' + (name ? ', ' + name : '') + '! I am Alicia, your financial assistant. Ask about your spending, bills, due dates or reminders, or tell me what you need to organize.';
        if (lang === 'es') return '¡Hola' + (name ? ', ' + name : '') + '! Soy Alicia, tu asistente financiera. Pregúntame por tus gastos, cuentas, vencimientos o recordatorios, o dime qué necesitas organizar.';
        return 'Oi' + (name ? ', ' + name : '') + '! Eu sou a Alicia, sua assistente financeira. Pode falar comigo normalmente: pergunte sobre gastos, contas, vencimentos e compromissos, ou diga o que precisa organizar.';
      };
      openingWrapped._aliciaIntroWrapped = true;
      AlicerceIA.mensagemAbertura = openingWrapped;
    }

    var originalLabel = AlicerceIA._label;
    if (typeof originalLabel === 'function' && !originalLabel._aliciaHelpWrapped) {
      var labelWrapped = function (key) {
        if (key === 'help') {
          if (Store.lang === 'en') return 'I can help you understand spending, check balances, follow bills and overdue payments, organize purchases, and keep track of appointments. Tell me what happened in your own words.';
          if (Store.lang === 'es') return 'Puedo ayudarte a entender tus gastos, consultar saldos, seguir cuentas y pagos atrasados, organizar compras y acompañar tus compromisos. Cuéntame con tus propias palabras qué necesitas.';
          return 'Posso ajudar a entender seus gastos, consultar saldos, acompanhar contas e pagamentos atrasados, organizar compras e marcar compromissos. Conte com suas palavras o que você precisa.';
        }
        return originalLabel.apply(this, arguments);
      };
      labelWrapped._aliciaHelpWrapped = true;
      AlicerceIA._label = labelWrapped;
    }

    addHomeCard();

    if (typeof renderVisao === 'function' && !renderVisao._aliciaDebtWrapped) {
      var originalVision = renderVisao;
      var visionWrapped = function () {
        var html = originalVision.apply(this, arguments);
        var marker = '<button class="btn btn-secondary btn-block visao-pdf"';
        var summary = renderFinancialSummary();
        if (html.indexOf(marker) >= 0) return html.replace(marker, summary + marker);
        return html.replace(/<\/div>\s*$/, summary + '</div>');
      };
      visionWrapped._aliciaDebtWrapped = true;
      renderVisao = visionWrapped;
      root.renderVisao = visionWrapped;
    }
    return true;
  }

  var api = {
    version: '1.0.0',
    install: install,
    today: today,
    parseDate: parseDate,
    parseMoney: parseMoney,
    parseTime: parseTime,
    getObligations: getObligations,
    getOverview: getOverview,
    startDebtDraft: startDebtDraft,
    startAppointmentDraft: startAppointmentDraft,
    handleMessage: handleMessage,
    markPaid: markPaid,
    renderFinancialSummary: renderFinancialSummary,
    openPaymentCheck: openPaymentCheck,
    paymentQuestion: paymentQuestion
  };

  root.AliciaDebtFollowup = api;
  try { install(); } catch (error) {
    if (root.console && typeof root.console.warn === 'function') root.console.warn('[Alicia] follow-up module not installed:', error);
  }
})(typeof window !== 'undefined' ? window : this);
