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

  function greetingForLocalTime() {
    var hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'Bom dia';
    if (hour >= 12 && hour < 18) return 'Boa tarde';
    return 'Boa noite';
  }

  function nextConversationPrompt(assistant) {
    if (assistant._pendingFinancialReview) return 'Quando quiser, me conte para que foi o gasto que estamos revisando.';
    if (assistant._pendingExpenseEdit) return 'Quer continuar a correção daquele gasto?';
    var draft = assistant._pendingExpenseDraft;
    if (draft && draft.awaiting === 'amount') return 'Quanto você pagou nessa compra?';
    if (draft && draft.awaiting === 'item') return 'O que você comprou?';
    if (draft && draft.awaiting === 'local') return 'Onde você fez essa compra?';
    if (draft && draft.awaiting === 'purpose') return 'Para que foi essa compra?';
    return '';
  }

  function conversationalOpening(message) {
    var opening = message.match(/^(?:al[ií]cia[\s,!:.-]+)?(bom dia|boa tarde|boa noite|oi+|ol[aá]|opa|e a[ií])(?=$|[\s,!.?:-])[\s,!.?:-]*(?:al[ií]cia\b[\s,!.?:-]*)?/iu);
    var rest = opening ? message.slice(opening[0].length).trim() : message;
    var smallTalk = normalize(rest).replace(/^(?:alicia )|(?: alicia)$/g, '');
    var courtesy = /^(?:tudo (?:bem|bom|certo)(?: (?:com (?:voce|vc)|por ai))?|como (?:vai|voce (?:esta|ta)|vc (?:esta|ta))|obrigad[oa](?: mesmo)?|valeu)$/;
    if (!opening && !courtesy.test(smallTalk)) return null;
    if (rest && !courtesy.test(smallTalk)) return {remaining: rest};
    if (/^(?:obrigad|valeu)/.test(smallTalk)) return {reply: 'Por nada!', thanks: true};
    var greeting = opening ? normalize(opening[1]) : '';
    var replies = {'bom dia':'Bom dia!', 'boa tarde':'Boa tarde!', 'boa noite':'Boa noite!'};
    return {reply: (replies[greeting] || greetingForLocalTime() + '!') + (smallTalk ? ' Tudo bem por aqui.' : '')};
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

  function billLabel(description) {
    var label = String(description || 'Conta sem descrição');
    if (label.length > 120 || /\b(DANFE|CNPJ|CPF|chave de acesso)\b/i.test(label)) {
      return /energia|kwh|consumo.te/i.test(label) ? 'Conta de energia' : 'Conta importada';
    }
    return label;
  }

  function reviewBill(assistant, n, raw) {
    var state = assistant._billReview;
    var deleting = /^(?:apague|apagar|apaga|exclua|excluir|exclui|remova|remover) (?:essa|esta|a) (?:conta|fatura|divida)$/.test(n);
    var disputed = /^(?:essa|esta|a) (?:conta|fatura|divida) (?:esta|ta|veio) (?:errada|incorreta)$/.test(n);
    if (!state && !deleting && !disputed) return null;
    if (state && state.user !== Store.userId) state = assistant._billReview = null;
    if (!Store.userId || (!state && !deleting && !disputed)) return null;
    if (state && (CANCEL_WORDS.test(n) || n === 'nao')) {
      assistant._billReview = null;
      return 'Revisão cancelada.';
    }
    var rows = getObligations().filter(function (row) { return row.id; });
    var keys = state ? state.keys : rows.map(function (row) { return row.key; });
    if (!keys.length) return 'Não encontrei uma conta para revisar.';
    if (state && state.step === 'choose' && /^\d+$/.test(n) && keys[Number(n) - 1]) {
      keys = [keys[Number(n) - 1]];
      deleting = state.deleting;
      disputed = !deleting;
    }
    if (keys.length > 1) {
      if (!deleting && !disputed) {
        assistant._billReview = null;
        return null;
      }
      assistant._billReview = {user: Store.userId, step: 'choose', keys: keys, deleting: deleting};
      return 'Qual conta? Responda com o número.\n' + keys.map(function (key, i) {
        var row = rows.find(function (item) { return item.key === key; });
        return (i + 1) + '. ' + (row ? billSummary(row) : 'Indisponível');
      }).join('\n');
    }
    var row = rows.find(function (item) { return item.key === keys[0]; });
    assistant._billReview = null;
    if (!row) return 'Essa conta já saiu da lista. Consulte as contas novamente.';
    var record = row.record;
    if (row.source === 'installment' || record.cardId || record.benefitWalletId || record.benefitId || record.benefitCardId || record.loanId) {
      return 'Encontrei ' + billSummary(row) + '. Abra o cadastro de origem para revisar esse lançamento vinculado.';
    }
    var linked = row.source === 'commitment' ? (Store.movements || []).filter(function (m) {
      return m && (!m.userId || m.userId === Store.userId) &&
        (String(m.commitmentId || '') === row.id || (record.expenseMovementId && m.id === record.expenseMovementId));
    }) : [];
    var signature = JSON.stringify([row.key, row.amount, row.dueDate, row.status, row.description, linked.map(function (m) { return [m.id, m.valor]; })]);
    var next = {user: Store.userId, keys: keys, signature: signature};
    if (deleting || disputed) {
      next.step = deleting ? 'delete' : 'review';
      assistant._billReview = next;
      return billSummary(row) + '. ' + (deleting ? 'Confirma excluir essa conta' +
        (linked.length ? ' e o pagamento vinculado' : '') + '? Responda sim ou não.' :
        'Qual é o valor correto? Se preferir excluir, diga “apague essa conta”.');
    }
    if (state.signature !== signature) return 'A conta mudou desde a revisão. Confira os dados novamente.';
    if (state.step === 'review' && /^(?:r\$\s*)?\d+(?:[.]\d{3})*(?:,\d{1,2})?(?: reais)?$/i.test(raw)) {
      var amount = parseMoney('R$ ' + raw.replace(/^r\$\s*/i, ''));
      if (amount) {
        next.step = 'amount';
        next.amount = amount;
        assistant._billReview = next;
        return 'Alterar ' + billSummary(row) + ' para ' + formatMoney(amount) + '? Responda sim ou não.';
      }
    }
    if (n !== 'sim' && n !== 'confirmo') return null;
    if (state.step === 'delete') {
      var field = row.source === 'movement' ? 'movements' : 'commitments';
      Store[field] = Store[field].filter(function (item) { return item !== record; });
      if (linked.length) Store.movements = Store.movements.filter(function (item) { return linked.indexOf(item) < 0; });
      Store.save();
      return 'Excluí ' + billSummary(row) + '.';
    }
    if (state.step === 'amount') {
      record.valor = state.amount;
      linked.forEach(function (item) { item.valor = state.amount; });
      Store.save();
      return 'Valor atualizado para ' + formatMoney(state.amount) + '.';
    }
    return null;
  }

  function billSummary(row) {
    return row.description + ' · ' + formatMoney(row.amount) + ' · vencimento ' + formatDate(row.dueDate);
  }

  function getObligations() {
    var result = [];
    var seen = {};
    var todayValue = today();

    function push(source, record, id, description, amount, dueDate, status) {
      if (!record || (record.userId && record.userId !== Store.userId) || !validIso(String(dueDate || ''))) return;
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
        description: billLabel(description),
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
    var output = {overdue: [], dueToday: [], upcoming: [], paid: [], paidLate: [], all: list};
    list.forEach(function (item) {
      if (item.overdue) output.overdue.push(item);
      if (item.dueToday) output.dueToday.push(item);
      if (item.status === 'pago') output.paid.push(item);
      if (item.paidLate) output.paidLate.push(item);
      if (item.status === 'pendente' && item.dueDate > today() && item.dueDate <= shiftDate(today(), 30)) output.upcoming.push(item);
    });
    output.overdueTotal = output.overdue.reduce(function (sum, item) { return sum + item.amount; }, 0);
    output.dueTodayTotal = output.dueToday.reduce(function (sum, item) { return sum + item.amount; }, 0);
    output.paidTotal = output.paid.reduce(function (sum, item) { return sum + item.amount; }, 0);
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
    if (view.paid.length) {
      lines.push('Quitadas (pagamento confirmado): ' + view.paid.length + ' conta(s), total de ' + formatMoney(view.paidTotal) + '.');
    } else lines.push('Não encontrei contas quitadas no histórico acompanhado.');
    if (view.paidLate.length) {
      lines.push('Pagas após o vencimento: ' + view.paidLate.length + ' conta(s), total de ' + formatMoney(view.paidLateTotal) + '.');
      view.paidLate.slice(0, 5).forEach(function (x) {
        lines.push('- ' + x.description + ': vencimento ' + formatDate(x.dueDate) + ', pagamento ' + formatDate(x.paidDate) + '.');
      });
    } else lines.push('Ainda não há pagamentos em atraso com as duas datas confirmadas.');
    return lines.join('\n');
  }


  // Planejamento: mesmo cadastro de contas, sem registrar dinheiro simulado.
  function monthOffset(key, offset) {
    var p = key.split('-').map(Number), d = new Date(p[0], p[1] - 1 + offset, 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
  function cents(value) {
    var n = Number(value);
    return Number.isFinite(n) && n > 0 && n <= 100000000 ? Math.round(n * 100) : 0;
  }
  function totalRows(rows) {
    return rows.reduce(function (sum, row) { return sum + cents(row.amount); }, 0) / 100;
  }
  function planningRows() {
    var rows=getObligations().filter(function (r) { return cents(r.amount) > 0; });
    (Store.installments||[]).forEach(function (r) {
      if (!r || !r.id || r.tipo!=='cartao' || (r.userId&&r.userId!==Store.userId) || !validIso(r.data) || !cents(r.valor)) return;
      var paid=r.status==='pago'||r.paymentStatus==='pago'||r.status==='recebido';
      rows.push({key:'card:'+r.id,source:'card',id:String(r.id),description:billLabel(obligationDescription(r)),amount:Number(r.valor),dueDate:r.data,status:paid?'pago':'pendente',paidDate:paid?paymentDateFor(r,'installment'):'',record:r});
    });
    return rows;
  }
  function essential(row) {
    return row.record.planningKind === 'essential' ||
      /\b(aluguel|energia|agua|luz|gas|feira|alimentacao|mercado|moradia|remedio|transporte)\b/.test(normalize(row.description));
  }
  function planningSnapshot(asOf) {
    asOf = validIso(asOf) ? asOf : today();
    var key = asOf.slice(0, 7), rows = planningRows();
    var monthly = rows.filter(function (r) { return r.dueDate.slice(0, 7) === key; });
    var pending = rows.filter(function (r) { return r.status !== 'pago' && r.dueDate.slice(0, 7) <= key; });
    pending.sort(function (a, b) {
      return Number(b.dueDate < asOf) - Number(a.dueDate < asOf) ||
        Number(essential(b)) - Number(essential(a)) || a.dueDate.localeCompare(b.dueDate);
    });
    var history = Array.from({length: 12}, function (_, i) {
      var m = key.slice(0,4) + '-' + String(i + 1).padStart(2, '0'), monthRows = rows.filter(function (r) { return r.dueDate.slice(0, 7) === m; });
      var known = monthRows.filter(function (r) { return r.status === 'pago' && validIso(r.paidDate) && r.paidDate <= asOf; });
      var onTime = known.filter(function (r) { return r.paidDate <= r.dueDate; });
      var cutoff = monthOffset(m, 1) + '-01';
      var lateCarry = monthRows.filter(function (r) {
        return r.status !== 'pago' || validIso(r.paidDate) && r.paidDate >= cutoff;
      });
      var missingDate = monthRows.some(function (r) { return r.status === 'pago' && (!validIso(r.paidDate) || r.paidDate > asOf); });
      var complete = monthRows.length > 0 && known.length === monthRows.length;
      var last = complete ? known.map(function (r) { return r.paidDate; }).sort().pop() : '';
      var days = last ? Math.max(0, Math.round((Date.parse(last+'T00:00:00Z') - Date.parse(m+'-01T00:00:00Z'))/86400000)+1) : null;
      var state = m > key ? 'future' : m === key ? 'open' : !monthRows.length ? 'empty' : lateCarry.length ? 'carried' : missingDate ? 'unknown' : 'closed';
      return {month:m, state:state, count:monthRows.length, total:totalRows(monthRows), carried: m < key ? totalRows(lateCarry) : null, days:days, onTime:onTime.length, dated:known.length};
    });
    var future = Array.from({length: 12}, function (_, i) {
      var m = monthOffset(key, i+1), upcoming = rows.filter(function (r) { return r.dueDate.slice(0,7) === m; });
      return {month:m,total:totalRows(upcoming),pending:totalRows(upcoming.filter(function (r) { return r.status !== 'pago'; })),count:upcoming.length};
    });
    return {month:key, total:totalRows(monthly), paid:totalRows(monthly.filter(function (r) { return r.status === 'pago'; })),
      pending:pending, remaining:totalRows(pending), overdue:totalRows(pending.filter(function (r) {return r.dueDate < asOf;})),
      carry:totalRows(pending.filter(function (r) {return r.dueDate.slice(0,7)<key;})),
      history:history,future:future};
  }
  function simulatePlanning(amount, snapshot) {
    var remaining = cents(amount), covered = [], blocked = [];
    (snapshot || planningSnapshot()).pending.forEach(function (r) {
      var cost = cents(r.amount);
      if (cost <= remaining && !blocked.length) { covered.push(r); remaining -= cost; }
      else blocked.push(r);
    });
    return {covered:covered, blocked:blocked, remaining:remaining/100};
  }
  function planningAnswer(message) {
    var n = normalize(stripWakeWord(message)), view, result;
    var hypothetical = /\b(se eu (conseguir|ganhar|receber|tiver)|consegui|recebi|ganhei|tenho (?:r )?\d+)\b/.test(n) &&
      /\b(pagar|quitar|conta|contas|obrigacoes|dividas)\b/.test(n);
    var evolution = /\b(evolucao financeira|meses positivos|melhor mes|quanto tempo|estou melhor|to indo bem|estou indo bem|paguei mais rapido|contas acumuladas)\b/.test(n);
    var future = /\b(proximo mes|proximos meses|mes que vem)\b/.test(n) && /\b(contas|pagar|obrigacoes|dividas|preciso|planejamento)\b/.test(n);
    var monthly = /\b(esse mes|este mes|do mes|neste mes|nesse mes)\b/.test(n) && /\b(pagar|contas|dividas|obrigacoes|preciso|compromissos)\b/.test(n);
    if (/\b(anote|anota|cadastre|cadastra|registre|registra|adicione|adiciona|inclua|crie|marque|quite|paguei)\b/.test(n) && !evolution) return null;
    if (/\b(quanto tempo|melhor mes)\b/.test(n) && !/\b(contas|obrigacoes|pagar|quitar|financeir[oa]|mes)\b/.test(n)) evolution=false;
    if (/\b(todo mes|todos os meses|mensalmente|recorrente|se repetem)\b/.test(n) && /\b(conta|contas|aluguel|obrigacoes|feira|energia|dividas)\b/.test(n))
      return 'Para cadastrar uma obrigação recorrente com valor e vencimento, abra Minha evolução > Meu mês > Adicionar obrigação. Você pode programar até 12 ocorrências sem lançar pagamentos.';
    if (!hypothetical && !evolution && !future && !monthly) return null;
    view = planningSnapshot();
    if (hypothetical) {
      var amount = parseMoney(message);
      if (!amount) {
        var match = String(message).match(/(?:conseguir|ganhar|receber|tiver|consegui|recebi|ganhei|tenho)\s+(\d+(?:[.,]\d{1,2})?)/i);
        if (match) amount = Number(match[1].replace(',','.'));
      }
      if (!cents(amount)) return 'Qual valor você quer simular para pagar suas obrigações?';
      result = simulatePlanning(amount,view);
      return 'Simulação de '+formatMoney(amount)+': '+(result.covered.length ? result.covered.map(function(r){return r.description+' ('+formatMoney(r.amount)+')';}).join('; ') : 'nenhuma obrigação prioritária pode ser quitada integralmente com esse valor')+'. Restante na simulação: '+formatMoney(result.remaining)+'.'+(result.blocked.length?' Próxima prioridade: '+result.blocked[0].description+' ('+formatMoney(result.blocked[0].amount)+').':'')+' Não registrei pagamentos nem entradas.';
    }
    if (evolution) {
      var closed = view.history.filter(function(r){return r.state==='closed';});
      var known = view.history.filter(function(r){return r.month<view.month&&r.days!==null;});
      return 'Neste ano, '+closed.length+' mês(es) encerrados com todas as obrigações cadastradas pagas até o fim do mês. '+(known.length?'Tempo de quitação registrado: '+known.map(function(r){return r.month+': '+r.days+' dias';}).join('; ')+'.':'Ainda não há histórico completo com datas de pagamento para medir a velocidade.')+' Isso mede obrigações registradas, não comprova saldo financeiro positivo.';
    }
    if (future) return 'Próximos meses (somente obrigações cadastradas): '+view.future.slice(0,4).map(function(r){return r.month+': '+formatMoney(r.pending);}).join('; ')+'. Atrasos anteriores ainda pendentes: '+formatMoney(view.carry)+'. Não contei receitas previstas como dinheiro disponível.';
    return 'Neste mês: '+formatMoney(view.total)+' em obrigações cadastradas, '+formatMoney(view.paid)+' já pagas. Falta '+formatMoney(view.remaining)+' incluindo '+formatMoney(view.carry)+' de meses anteriores.'+(view.pending.length?'\nPrioridades:\n'+view.pending.slice(0,8).map(function(r){return '- '+r.description+' — '+formatMoney(r.amount)+' — '+formatDate(r.dueDate);}).join('\n'):'')+' Valores previstos não são pagamentos.';
  }
  function createPlanningObligations(description, amount, firstDue, occurrences, kind) {
    if (!Store.userId || !String(description||'').trim() || String(description).length>100 || !cents(amount) || !validIso(firstDue) || firstDue<today() ||
      !Number.isInteger(occurrences) || occurrences<1 || occurrences>12 || ['essential','fixed','variable','installment'].indexOf(kind)<0) throw new Error('Confira descrição, valor, data e quantidade (1 a 12).');
    var name = String(description).trim(), existing = planningRows(), dates=[];
    var day = Number(firstDue.slice(8));
    for (var i=0;i<occurrences;i++) {
      var m=monthOffset(firstDue.slice(0,7),i), p=m.split('-').map(Number);
      var due=m+'-'+String(Math.min(day,new Date(p[0],p[1],0).getDate())).padStart(2,'0');
      if (!existing.some(function(r){return normalize(r.description)===normalize(name)&&r.dueDate.slice(0,7)===m;})) dates.push(due);
    }
    var count=0;
    dates.forEach(function(due){
      if (!addCommitment({tipo:'compromisso',descricao:name,valor:cents(amount)/100,data:due,dataVencimento:due,status:'pendente',paymentStatus:'pendente',naturezaFinanceira:'divida',origem:'alicia-planejamento',planningKind:kind, dataPagamento:''})) throw new Error('Cadastro interrompido. Confira as obrigações já adicionadas antes de tentar novamente.');
      count++;
    });
    return count;
  }
  var planningTab = 0, planningUser = '', planningValue = '', touchOrigin = null;
  function renderPlanning() {
    if (planningUser !== Store.userId) {planningUser=Store.userId;planningTab=0;planningValue='';}
    var v=planningSnapshot(), tabs=['Meu mês','Evolução','Futuro'];
    var h='<section id="alicerce-planning" class="card mt-3" aria-label="Minha evolução financeira" style="border-radius:22px;overflow:hidden;touch-action:pan-y;padding:16px">';
    h+='<div style="font-size:11px;letter-spacing:.12em;opacity:.7">ALICERCE · PLANEJAMENTO</div><h2 style="margin:8px 0 14px;font-size:23px">Minha evolução</h2>';
    h+='<div role="group" aria-label="Visões do planejamento" style="display:flex;gap:5px;margin-bottom:16px">'+tabs.map(function(t,i){return '<button type="button" aria-pressed="'+(i===planningTab)+'" class="btn '+(i===planningTab?'btn-primary':'btn-secondary')+'" style="flex:1;padding:8px 4px;font-size:12px" onclick="AliciaDebtFollowup.planningSwitch('+i+')">'+t+'</button>';}).join('')+'</div>';
    var row=function(label,value,sub){return '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid var(--line)"><div style="min-width:0;overflow-wrap:anywhere">'+escaped(label)+(sub?'<div class="text-muted text-sm">'+escaped(sub)+'</div>':'')+'</div><strong style="white-space:nowrap">'+escaped(value)+'</strong></div>';};
    var hero=function(label,value){return '<div style="border:1px solid var(--line);border-radius:18px;padding:16px;margin-bottom:12px;background:rgba(81,139,240,.09)"><div class="text-muted text-sm">'+escaped(label)+'</div><strong style="font-size:28px;display:block;margin-top:6px">'+escaped(value)+'</strong></div>';};
    if(planningTab===0){
      h+=hero('Falta pagar · inclui atrasos',formatMoney(v.remaining))+row('Obrigações do mês',formatMoney(v.total))+row('Já pago neste mês de vencimento',formatMoney(v.paid))+row('Em atraso',formatMoney(v.overdue));
      h+='<h3 style="margin:20px 0 5px;font-size:16px">Próximas obrigações</h3>';
      h+=v.pending.length?v.pending.map(function(r){return row(r.description,formatMoney(r.amount),formatDate(r.dueDate)+(essential(r)?' · Essencial':''));}).join(''):'<p class="text-muted text-sm">Nenhuma obrigação pendente cadastrada para este mês.</p>';
      h+='<button type="button" class="btn btn-secondary btn-block" style="margin-top:12px" onclick="AliciaDebtFollowup.planningAdd()">Adicionar obrigação</button>';
      h+='<div style="border:1px solid var(--line);border-radius:16px;padding:14px;margin-top:18px"><strong>Se eu conseguir...</strong><label for="alicerce-planning-value" class="text-muted text-sm" style="display:block;margin:8px 0">Valor a simular (R$)</label><input id="alicerce-planning-value" type="number" min="0" max="100000000" step="0.01" inputmode="decimal" value="'+escaped(planningValue)+'" style="width:100%;padding:10px;border-radius:10px;background:transparent;color:inherit;border:1px solid var(--line)" oninput="AliciaDebtFollowup.planningSim(this.value)"><div id="alicerce-planning-result" aria-live="polite">'+planningSimHTML(planningValue,v)+'</div></div>';
    }else if(planningTab===1){
      var closed=v.history.filter(function(r){return r.state==='closed';}).length;
      h+=hero('Meses com obrigações quitadas até o fim do mês',closed+' de '+v.history.filter(function(r){return r.month<v.month;}).length);
      h+='<div style="display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:5px;margin:14px 0">'+v.history.map(function(r){var colors={closed:'#20866b',carried:'#a95454',open:'#466ba0',unknown:'#877448',empty:'#697382',future:'#697382'};var labels={closed:'Quitado',carried:'Pendência',open:'Em curso',unknown:'Sem data',empty:'Sem dados',future:'Futuro'};return '<div title="'+labels[r.state]+'" style="min-width:0;text-align:center;background:'+colors[r.state]+';color:white;border-radius:9px;padding:8px 1px;font-size:10px">'+['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][Number(r.month.slice(5))-1]+'<div style="font-size:9px;overflow-wrap:anywhere">'+labels[r.state]+'</div></div>';}).join('')+'</div>';
      h+='<p class="text-muted text-sm">Quitação de obrigações não é o mesmo que saldo financeiro positivo.</p><h3 style="font-size:16px">Histórico de quitação</h3>';
      h+=v.history.filter(function(r){return r.month<=v.month&&r.count;}).map(function(r){return row(r.month,r.days===null?'Sem quitação medida':r.days+' dias',(r.dated?r.onTime+' de '+r.dated+' pagamentos datados no prazo':'Sem datas de pagamento')+(r.carried?' · Passou ao mês seguinte: '+formatMoney(r.carried):''));}).join('');
    }else{
      h+=hero('Próximo mês · pendências cadastradas',formatMoney(v.future[0].pending))+row('Atrasos de meses anteriores',formatMoney(v.carry));
      h+='<h3 style="font-size:16px">Projeção dos próximos 12 meses</h3>';
      h+=v.future.map(function(r){return row(r.month,r.count?formatMoney(r.pending):'Sem registros',r.count?r.count+' obrigação(ões) cadastrada(s)':'');}).join('');
      h+='<p class="text-muted text-sm">Valores variáveis são estimativas cadastradas. Não há promessa de receita nem reserva automática.</p>';
    }
    h+='<div style="border-top:1px solid var(--line);margin-top:18px;padding-top:14px"><strong>Visão da Alicia</strong><p class="text-muted text-sm">'+(planningTab===0?'Organize as prioridades e simule novos ganhos antes de gastar.':planningTab===1?'Compare a quitação e os atrasos com base nas datas confirmadas.':'Prepare as contas futuras com valores e datas cadastrados.')+'</p><button type="button" class="btn btn-secondary btn-block" onclick="AliciaDebtFollowup.planningAsk()">Conversar com Alicia</button></div><p class="text-muted text-sm" style="text-align:center;margin:12px 0 0">Deslize para navegar entre as visões</p></section>';
    return h;
  }
  function planningSimHTML(value,view){
    if(!cents(value))return '<p class="text-muted text-sm">Informe um valor para simular. Nenhum lançamento será criado.</p>';
    var result=simulatePlanning(Number(value),view);
    return '<p><strong>'+result.covered.length+' obrigação(ões) cobertas</strong></p>'+result.covered.map(function(r){return '<div class="text-sm">'+escaped(r.description)+' · '+escaped(formatMoney(r.amount))+'</div>';}).join('')+'<p class="text-sm">Restante: '+escaped(formatMoney(result.remaining))+'</p>'+(result.blocked.length?'<p class="text-sm">Próxima prioridade: '+escaped(result.blocked[0].description)+' · '+escaped(formatMoney(result.blocked[0].amount))+'</p>':'')+'<p class="text-muted text-sm">Simulação, não pagamento.</p>';
  }
  function planningSwitch(i){
    planningTab=Math.max(0,Math.min(2,i));
    var node=document.getElementById('alicerce-planning');
    if(node)node.outerHTML=renderPlanning();
  }
  function planningSim(value){
    planningValue=String(value||'');
    var node=document.getElementById('alicerce-planning-result');
    if(node)node.innerHTML=planningSimHTML(planningValue,planningSnapshot());
  }
  function planningAdd(){
    if(!Store.userId||typeof dialog!=='function')return;
    dialog('Adicionar obrigação','<form id="alicerce-planning-form" onsubmit="event.preventDefault();AliciaDebtFollowup.planningSave(this)"><label>Descrição<input name="description" required maxlength="100" placeholder="Ex.: Feira da família"></label><label>Valor previsto (R$)<input name="amount" type="number" required min="0.01" max="100000000" step="0.01" inputmode="decimal"></label><label>Primeiro vencimento<input name="due" type="date" required min="'+today()+'" value="'+today()+'"></label><label>Tipo<select name="kind"><option value="essential">Essencial / família</option><option value="fixed">Conta fixa</option><option value="variable">Conta variável (estimativa)</option><option value="installment">Parcela</option></select></label><label>Ocorrências mensais<select name="occurrences">'+Array.from({length:12},function(_,i){return '<option value="'+(i+1)+'">'+(i+1)+' mês(es)</option>';}).join('')+'</select></label><p class="text-muted text-sm">O cadastro cria apenas compromissos pendentes. Ocorrências com a mesma descrição no mesmo mês são ignoradas.</p><button class="btn btn-primary btn-block" type="submit">Confirmar cadastro</button><p id="alicerce-planning-feedback" role="status"></p></form>');
  }
  function planningSave(form){
    var feedback=document.getElementById('alicerce-planning-feedback'), fields=form.elements;
    try{
      var count=createPlanningObligations(fields.description.value,Number(fields.amount.value),fields.due.value,Number(fields.occurrences.value),fields.kind.value);
      if(feedback)feedback.textContent=count+' obrigação(ões) cadastrada(s). Nenhum pagamento realizado.';
      var node=document.getElementById('alicerce-planning');if(node)node.outerHTML=renderPlanning();
    }catch(e){if(feedback)feedback.textContent=e.message;}
  }
  function planningAsk(){
    var q=['Quais contas tenho que pagar este mês?','Como está minha evolução financeira?','Quais contas preciso pagar no próximo mês?'][planningTab];
    if(typeof AlicerceIA.experimentar==='function')AlicerceIA.experimentar(q);
    else if(typeof go==='function')go('assistente');
  }
  function installPlanningGestures(){
    if(typeof document==='undefined'||!document.addEventListener||root._alicercePlanningGestures)return;
    root._alicercePlanningGestures=true;
    document.addEventListener('touchstart',function(e){touchOrigin=null;if(e.touches.length!==1||!e.target.closest||!e.target.closest('#alicerce-planning')||e.target.closest('input,select,button,textarea'))return;touchOrigin={x:e.touches[0].clientX,y:e.touches[0].clientY};},{passive:true});
    document.addEventListener('touchcancel',function(){touchOrigin=null;},{passive:true});
    document.addEventListener('touchend',function(e){if(!touchOrigin||!e.changedTouches.length)return;var dx=e.changedTouches[0].clientX-touchOrigin.x,dy=e.changedTouches[0].clientY-touchOrigin.y;touchOrigin=null;if(Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)*1.5)planningSwitch(planningTab+(dx<0?1:-1));},{passive:true});
  }

  function handleMessage(assistant, message) {
    var raw = String(message || '').trim();
    if (!raw) return null;
    var n = normalize(stripWakeWord(raw));

    var review = reviewBill(assistant, n, raw);
    if (review !== null) return review;

    if (assistant._pendingPaymentCheck) return replyToPaymentCheck(assistant, raw);

    if (assistant._pendingAppointmentDraft) {
      if (CANCEL_WORDS.test(n)) return cancelDraft(assistant);
      return handleAppointment(assistant, raw);
    }
    if (assistant._pendingDebtDraft) {
      if (CANCEL_WORDS.test(n)) return cancelDraft(assistant);
      return handleDebt(assistant, raw);
    }

    var planning = planningAnswer(raw);
    if (planning !== null) return planning;

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
    html += '<div class="list-item"><div class="li-info"><div class="li-name">Quitadas</div><div class="li-sub">' + view.paid.length + ' conta(s)</div></div><div class="li-amount">' + formatMoney(view.paidTotal) + '</div></div>';
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
      if (Store.userId) cards.unshift({pr:-1,type:'alicia-planning',title:'Minha evolução financeira',text:'Organize suas obrigações, simule ganhos e acompanhe os próximos 12 meses.',go:"go('visao')",lbl:'Abrir planejamento'});
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
          this._billReview = null;
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
        if (question === undefined && this._photoTextPending) return originalSend.apply(this, arguments);
        var opening = conversationalOpening(message);
        if (opening && opening.reply) {
          var invitation = nextConversationPrompt(this);
          if (!invitation && !opening.thanks) invitation = 'O que você quer ver hoje?';
          return respond(this, message, opening.reply + (invitation ? ' ' + invitation : ''));
        }
        if (opening) message = opening.remaining;
        if (message) {
          var handled = handleMessage(this, message);
          if (handled !== null && handled !== undefined) return respond(this, message, handled);
        }
        return opening ? originalSend.call(this, message) : originalSend.apply(this, arguments);
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
        if (lang === 'en') return 'Hi' + (name ? ', ' + name : '') + '! How are you? I am here to help you understand your money. What should we look at today?';
        if (lang === 'es') return '¡Hola' + (name ? ', ' + name : '') + '! ¿Cómo estás? Estoy aquí para ayudarte a entender tu dinero. ¿Qué miramos hoy?';
        return greetingForLocalTime() + (name ? ', ' + name : '') + '! ' + (nextConversationPrompt(this) || 'O que vamos olhar hoje?');
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
    installPlanningGestures();

    if (typeof renderVisao === 'function' && !renderVisao._aliciaDebtWrapped) {
      var originalVision = renderVisao;
      var visionWrapped = function () {
        var html = originalVision.apply(this, arguments);
        var marker = '<button class="btn btn-secondary btn-block visao-pdf"';
        var summary = renderPlanning() + renderFinancialSummary();
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
    paymentQuestion: paymentQuestion,
    planningSnapshot: planningSnapshot,
    simulatePlanning: simulatePlanning,
    planningAnswer: planningAnswer,
    createPlanningObligations: createPlanningObligations,
    planningSwitch: planningSwitch,
    planningSim: planningSim,
    planningAdd: planningAdd,
    planningSave: planningSave,
    planningAsk: planningAsk
  };

  root.AliciaDebtFollowup = api;
  try { install(); } catch (error) {
    if (root.console && typeof root.console.warn === 'function') root.console.warn('[Alicia] follow-up module not installed:', error);
  }
})(typeof window !== 'undefined' ? window : this);
