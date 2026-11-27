import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import testCase from 'node:test';

const source = readFileSync(new URL('../assets/alicia-debt-followup.js', import.meta.url), 'utf8');

const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

testCase('o script principal do Alicerce continua sintaticamente válido após a integração da Alicia', () => {
  const marker = "var confidenceLabel=String(interpretation.confidence||'').toLowerCase();";
  const markerIndex = indexHtml.indexOf(marker);
  assert.notEqual(markerIndex, -1, 'trecho de classificação financeira não encontrado');
  assert.equal(indexHtml.includes(marker + '\\n        var confidenceScore'), false, 'quebra de linha foi gravada como texto literal');
  const scriptStart = indexHtml.lastIndexOf('<script', markerIndex);
  const tagEnd = indexHtml.indexOf('>', scriptStart);
  const scriptEnd = indexHtml.indexOf('</script>', markerIndex);
  assert.ok(scriptStart >= 0 && tagEnd > scriptStart && scriptEnd > markerIndex, 'bloco principal não encontrado');
  assert.doesNotThrow(() => new vm.Script(indexHtml.slice(tagEnd + 1, scriptEnd), { filename: 'index.html inline script' }));
});

function createContext(overrides) {
  let nextId = 1;
  const store = {
    userId: 'user-test',
    lang: 'pt',
    settings: {},
    installments: [],
    commitments: [],
    movements: [],
    loans: [],
    saveCalls: 0,
    save() { this.saveCalls++; },
    _uid() { return 'id-' + nextId++; },
    addCommitment(item) {
      item.id = item.id || this._uid();
      item.userId = this.userId;
      this.commitments.push(item);
      this.save();
      return item;
    },
    addMovement(item) {
      item.id = item.id || this._uid();
      item.userId = this.userId;
      this.movements.push(item);
      this.save();
      return item;
    },
    processInstallmentPayment(id) {
      const item = this.installments.find(x => x.id === id);
      assert.ok(item);
      item.status = 'pago';
      const movement = this.addMovement({
        tipo: 'transferencia',
        direction: 'saida',
        descricao: item.descricao,
        valor: item.valor,
        data: '2026-11-04',
        status: 'pago',
        installmentId: item.id
      });
      item.cashMovementId = movement.id;
      this.save();
    },
    getSmartCards() { return []; }
  };
  const assistant = {
    _userId: 'user-test',
    _messages: [],
    _pendingPaymentCheck: null,
    _pendingDebtDraft: null,
    _pendingAppointmentDraft: null,
    _resetUser() {},
    _parseExpenseCommand(value) { return { received: value }; },
    _label(key) { return 'original:' + key; },
    mensagemAbertura() { return 'original'; },
    _voiceEnabled() { return false; }
  };
  const sandbox = {
    Store: store,
    Clock: { today: () => '2026-11-04' },
    AlicerceIA: assistant,
    window: {},
    render() {},
    setTimeout() {},
    console,
    fmtMoney(value) { return 'R$ ' + Number(value || 0).toFixed(2).replace('.', ','); },
    fmtDate(value) { return value; },
    esc(value) { return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
  };
  sandbox.window = sandbox;
  if (overrides) Object.assign(store, overrides.store || {});
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'assets/alicia-debt-followup.js' });
  return { sandbox, Store: store, AlicerceIA: assistant, api: sandbox.AliciaDebtFollowup };
}

testCase('interpreta uma conta antiga com vencimento no passado sem mudar a data original', () => {
  const { Store, AlicerceIA, api } = createContext();
  const answer = api.handleMessage(AlicerceIA, 'Alicia, tenho uma conta antiga de energia de R$ 150,00 que venceu em 20/10');
  assert.match(answer, /Cadastrei/);
  assert.equal(Store.commitments.length, 1);
  assert.equal(Store.commitments[0].descricao, 'energia');
  assert.equal(Store.commitments[0].valor, 150);
  assert.equal(Store.commitments[0].data, '2026-10-20');
  assert.equal(Store.commitments[0].status, 'pendente');
  assert.equal(api.getOverview().overdue.length, 1);
  assert.equal(Store.movements.length, 0);
});

testCase('não inventa dados ausentes ao cadastrar dívida antiga', () => {
  const { Store, AlicerceIA, api } = createContext();
  const answer = api.handleMessage(AlicerceIA, 'Alicia, anota uma conta antiga');
  assert.match(answer, /De qual conta antiga/);
  assert.equal(Store.commitments.length, 0);
  assert.equal(AlicerceIA._pendingDebtDraft.amount, null);
});

testCase('cria compromisso e pede os campos que faltam, um por vez', () => {
  const { Store, AlicerceIA, api } = createContext();
  let answer = api.handleMessage(AlicerceIA, 'Alicia, marcar um compromisso para mim');
  assert.match(answer, /Qual compromisso/);
  assert.equal(Store.commitments.length, 0);
  answer = api.handleMessage(AlicerceIA, 'dentista amanhã às 9');
  assert.match(answer, /Marquei/);
  assert.equal(Store.commitments.length, 1);
  assert.equal(Store.commitments[0].descricao, 'dentista');
  assert.equal(Store.commitments[0].data, '2026-11-05');
  assert.equal(Store.commitments[0].hora, '09:00');
  assert.equal(Store.commitments[0].tipo, 'compromisso');
});

testCase('lista separadamente dívidas vencidas, vencimentos de hoje e pagamentos tardios', () => {
  const { Store, api } = createContext();
  Store.commitments.push(
    { id: 'old', tipo: 'compromisso', naturezaFinanceira: 'divida', descricao: 'Energia antiga', valor: 150, data: '2026-10-20', status: 'pendente' },
    { id: 'late-paid', tipo: 'compromisso', naturezaFinanceira: 'divida', descricao: 'Internet', valor: 100, data: '2026-10-25', dataPagamento: '2026-10-29', paymentStatus: 'pago', status: 'concluido' }
  );
  Store.installments.push(
    { id: 'today', tipo: 'pagar', descricao: 'Parcela da casa', valor: 500, data: '2026-11-04', status: 'pendente' }
  );
  const view = api.getOverview();
  assert.equal(view.overdue.length, 1);
  assert.equal(view.overdueTotal, 150);
  assert.equal(view.dueToday.length, 1);
  assert.equal(view.dueTodayTotal, 500);
  assert.equal(view.paid.length, 1);
  assert.equal(view.paidTotal, 100);
  assert.equal(view.paidLate.length, 1);
  assert.equal(view.paidLateTotal, 100);
});

testCase('não supõe pagamento tardio quando o registro antigo não tem data de pagamento', () => {
  const { Store, api } = createContext();
  Store.commitments.push({
    id: 'legacy-paid',
    tipo: 'compromisso',
    naturezaFinanceira: 'divida',
    descricao: 'Conta antiga',
    valor: 80,
    data: '2026-10-20',
    status: 'concluido',
    paymentStatus: 'pago'
  });
  assert.equal(api.getOverview().paid.length, 1);
  assert.equal(api.getOverview().paidLate.length, 0);
});

testCase('resposta negativa mantém a dívida pendente e não cria saída de dinheiro', () => {
  const { Store, AlicerceIA, api } = createContext();
  Store.installments.push({ id: 'i1', tipo: 'pagar', descricao: 'Parcela da casa', valor: 500, data: '2026-11-04', status: 'pendente' });
  AlicerceIA._pendingPaymentCheck = { key: 'installment:i1' };
  const answer = api.handleMessage(AlicerceIA, 'Não consegui pagar');
  assert.match(answer, /mantive/i);
  assert.equal(Store.installments[0].status, 'pendente');
  assert.equal(Store.movements.length, 0);
});

testCase('resposta positiva registra pagamento com a data informada e classifica atraso', () => {
  const { Store, AlicerceIA, api } = createContext();
  Store.installments.push({ id: 'i2', tipo: 'pagar', descricao: 'Parcela antiga', valor: 500, data: '2026-10-30', status: 'pendente' });
  AlicerceIA._pendingPaymentCheck = { key: 'installment:i2' };
  const answer = api.handleMessage(AlicerceIA, 'Paguei ontem');
  assert.match(answer, /Dívidas pagas em atraso/);
  assert.equal(Store.installments[0].status, 'pago');
  assert.equal(Store.installments[0].dataPagamento, '2026-11-03');
  assert.equal(Store.movements[0].data, '2026-11-03');
  assert.equal(api.getOverview().paidLate.length, 1);
});

testCase('confirma pagamento de conta antiga e cria uma saída financeira sem duplicar a conta', () => {
  const { Store, AlicerceIA, api } = createContext();
  Store.commitments.push({
    id: 'debt-1',
    tipo: 'compromisso',
    naturezaFinanceira: 'divida',
    descricao: 'Conta de água',
    valor: 90,
    data: '2026-10-20',
    status: 'pendente',
    paymentStatus: 'pendente'
  });
  AlicerceIA._pendingPaymentCheck = { key: 'commitment:debt-1' };
  const answer = api.handleMessage(AlicerceIA, 'Sim, paguei ontem');
  assert.match(answer, /paga em 2026-11-03/);
  assert.equal(Store.commitments[0].status, 'concluido');
  assert.equal(Store.commitments[0].paymentStatus, 'pago');
  assert.equal(Store.movements.length, 1);
  assert.equal(Store.movements[0].commitmentId, 'debt-1');
  assert.equal(api.getOverview().paidLate.length, 1);
});

testCase('normaliza nome de chamada e verbo compre antes de interpretar a compra', () => {
  const { AlicerceIA } = createContext();
  const parsed = AlicerceIA._parseExpenseCommand('Alicia, compre uma torta');
  assert.equal(parsed.received, 'comprar uma torta');
});

testCase('cancela o cadastro pendente sem salvar nada', () => {
  const { Store, AlicerceIA, api } = createContext();
  api.handleMessage(AlicerceIA, 'Alicia, tenho uma conta antiga');
  const answer = api.handleMessage(AlicerceIA, 'cancela');
  assert.match(answer, /Cancelei/);
  assert.equal(Store.commitments.length, 0);
});


testCase('conta antiga explicitamente paga usa a data do pagamento, não o vencimento original', () => {
  const { Store, AlicerceIA, api } = createContext();
  const answer = api.handleMessage(AlicerceIA, 'Alicia, tenho uma conta antiga de energia de R$ 150,00 que venceu em 20/10 e já paguei ontem');
  assert.match(answer, /paga em 2026-11-03/);
  assert.equal(Store.commitments[0].descricao, 'energia');
  assert.equal(Store.commitments[0].data, '2026-10-20');
  assert.equal(Store.commitments[0].dataPagamento, '2026-11-03');
  assert.equal(Store.movements[0].data, '2026-11-03');
  assert.equal(api.getOverview().paidLate.length, 1);
});

testCase('pergunta todos os vencimentos do dia na Home, sem misturar com lembretes pessoais', () => {
  const { Store } = createContext();
  Store.installments.push(
    { id: 'home-1', tipo: 'pagar', descricao: 'Parcela da casa', valor: 500, data: '2026-11-04', status: 'pendente' },
    { id: 'home-2', tipo: 'financiamento', descricao: 'Financiamento', valor: 800, data: '2026-11-04', status: 'pendente' }
  );
  Store.commitments.push(
    { id: 'reminder', tipo: 'lembrete', descricao: 'Comprar leite', valor: null, data: '2026-11-04', status: 'pendente' }
  );
  const cards = Store.getSmartCards();
  const paymentCards = cards.filter(item => item.type === 'alicia-payment-check');
  assert.equal(paymentCards.length, 2);
  assert.ok(paymentCards.every(item => /A casa conseguiu pagar/.test(item.text)));
  assert.ok(paymentCards.every(item => item.go.indexOf('openPaymentCheck') >= 0));
});

testCase('confirma pagamento de compromisso atualizando movimentação já vinculada sem duplicar saída', () => {
  const { Store, AlicerceIA, api } = createContext();
  Store.movements.push({
    id: 'already-linked',
    tipo: 'despesa',
    descricao: 'Internet',
    valor: 100,
    data: '2026-11-04',
    status: 'pendente',
    commitmentId: 'debt-existing'
  });
  Store.commitments.push({
    id: 'debt-existing',
    tipo: 'compromisso',
    naturezaFinanceira: 'divida',
    descricao: 'Internet',
    valor: 100,
    data: '2026-11-03',
    status: 'pendente',
    paymentStatus: 'pendente',
    expenseMovementId: 'already-linked'
  });
  AlicerceIA._pendingPaymentCheck = { key: 'commitment:debt-existing' };
  api.handleMessage(AlicerceIA, 'Sim, paguei hoje');
  assert.equal(Store.movements.length, 1);
  assert.equal(Store.movements[0].status, 'pago');
  assert.equal(Store.movements[0].data, '2026-11-04');
  assert.equal(Store.commitments[0].status, 'concluido');
  assert.equal(api.getOverview().paidLate.length, 1);
});


testCase('a confirmação negativa some pelo restante do dia e volta a ser perguntada no dia seguinte', () => {
  const { Store, AlicerceIA, api, sandbox } = createContext();
  Store.installments.push({ id: 'daily-check', tipo: 'pagar', descricao: 'Conta de energia', valor: 150, data: '2026-11-04', status: 'pendente' });
  const paymentCards = () => Store.getSmartCards().filter(item => item.type === 'alicia-payment-check');

  assert.equal(paymentCards().length, 1);
  api.openPaymentCheck(encodeURIComponent('installment:daily-check'));
  api.handleMessage(AlicerceIA, 'Não consegui pagar');
  assert.equal(paymentCards().length, 0);

  sandbox.Clock.today = () => '2026-11-05';
  assert.equal(paymentCards().length, 1);
  api.openPaymentCheck(encodeURIComponent('installment:daily-check'));
  api.handleMessage(AlicerceIA, 'Ainda não paguei');
  assert.equal(paymentCards().length, 0);
});

testCase('não trata parcelas de cartão vinculadas a empréstimo como contas a pagar da casa', () => {
  const { Store, api } = createContext();
  Store.loans.push({ id: 'loan-card', tipo: 'emprestei', fromCard: true });
  Store.installments.push({
    id: 'card-receivable',
    tipo: 'cartao',
    loanId: 'loan-card',
    descricao: 'Cartão emprestado',
    valor: 300,
    data: '2026-11-04',
    status: 'pendente'
  });
  assert.equal(api.getOverview().dueToday.length, 0);
});

testCase('reutiliza uma saída financeira vinculada pelo commitmentId mesmo sem expenseMovementId', () => {
  const { Store, AlicerceIA, api } = createContext();
  Store.movements.push({
    id: 'movement-by-commitment',
    tipo: 'despesa',
    descricao: 'Internet',
    valor: 100,
    data: '2026-11-04',
    status: 'pendente',
    commitmentId: 'debt-by-link'
  });
  Store.commitments.push({
    id: 'debt-by-link',
    tipo: 'compromisso',
    naturezaFinanceira: 'divida',
    descricao: 'Internet',
    valor: 100,
    data: '2026-11-03',
    status: 'pendente',
    paymentStatus: 'pendente'
  });
  AlicerceIA._pendingPaymentCheck = { key: 'commitment:debt-by-link' };
  api.handleMessage(AlicerceIA, 'Sim, paguei hoje');
  assert.equal(Store.movements.length, 1);
  assert.equal(Store.movements[0].id, 'movement-by-commitment');
  assert.equal(Store.movements[0].status, 'pago');
  assert.equal(Store.commitments[0].status, 'concluido');
});

testCase('não marca conta antiga como paga quando o lançamento da saída falha', () => {
  const { Store, AlicerceIA, api } = createContext();
  Store.addMovement = () => null;
  const answer = api.handleMessage(
    AlicerceIA,
    'Alicia, tenho uma conta antiga de energia de R$ 150,00 que venceu em 20/10 e já paguei ontem'
  );
  assert.match(answer, /Mantive a conta como pendente/i);
  assert.equal(Store.commitments.length, 1);
  assert.equal(Store.commitments[0].status, 'pendente');
  assert.equal(Store.commitments[0].paymentStatus, 'pendente');
  assert.equal(Store.movements.length, 0);
});

testCase('cumprimentos no chat mantêm a revisão aberta até chegar uma finalidade', async () => {
  const { Store, AlicerceIA, api } = createContext();
  const review = {current:{id:'pix', source:'movement'}, handled:[]};
  const pix = {id:'pix', valor:5.30};
  Store.movements.push(pix);
  AlicerceIA._pendingFinancialReview = review;
  const routed = [];
  AlicerceIA.enviarMensagem = function(message){routed.push(message);};
  api.install();
  for (const message of ['Bom dia alicia','Oi, Alícia! Tudo bem?', 'Boa noite!', 'Obrigada']) {
    await AlicerceIA.enviarMensagem(message);
    assert.match(AlicerceIA._answer,/gasto que estamos revisando/);
    assert.equal(AlicerceIA._pendingFinancialReview,review);
    assert.equal(Store.saveCalls,0);
  }
  assert.equal(routed.length,0);
  await AlicerceIA.enviarMensagem('Bom dia, Alícia! Foi para comprar pão');
  assert.deepEqual(routed,['Foi para comprar pão']);
  await AlicerceIA.enviarMensagem('mercado Bom Dia');
  assert.equal(routed[1],'mercado Bom Dia');
});

testCase('usa a hora local na abertura e no oi, respeita o cumprimento explícito e retoma a compra', async () => {
  const {sandbox, AlicerceIA, api} = createContext({store:{settings:{displayName:'Ana Silva'}}});
  AlicerceIA.enviarMensagem = () => {};
  api.install();
  for (const [hour, greeting] of [[0,'Boa noite'],[4,'Boa noite'],[5,'Bom dia'],[11,'Bom dia'],[12,'Boa tarde'],[17,'Boa tarde'],[18,'Boa noite'],[23,'Boa noite']]) {
    sandbox.Date = class extends Date { getHours() { return hour; } };
    assert.ok(AlicerceIA.mensagemAbertura().startsWith(greeting + ', Ana!'));
    await AlicerceIA.enviarMensagem('Oi, Alícia!');
    assert.ok(AlicerceIA._answer.startsWith(greeting + '!'));
  }
  await AlicerceIA.enviarMensagem('valeu');
  assert.equal(AlicerceIA._answer,'Por nada!');
  AlicerceIA._pendingExpenseDraft = {awaiting:'amount'};
  await AlicerceIA.enviarMensagem('bom dia');
  assert.equal(AlicerceIA._answer,'Bom dia! Quanto você pagou nessa compra?');
});

testCase('revisa conta importada e exige confirmação para excluir o pagamento vinculado', () => {
  const { Store, AlicerceIA, api } = createContext();
  const say = message => api.handleMessage(AlicerceIA, message);
  const bill = { id: 'energia', tipo: 'conta', descricao: 'DANFE energia CNPJ exemplo', valor: 0.25, data: '2026-10-14', status: 'concluido', dataPagamento: '2026-11-12' };
  Store.commitments.push(bill);
  Store.movements.push({ id: 'pagamento', commitmentId: bill.id, valor: 0.25 }, { id: 'outro' });
  assert.doesNotMatch(say('Quais minhas contas?'), /CNPJ/);
  assert.match(say('Essa conta está errada'), /Conta de energia.*0,25/);
  assert.match(say('280,25'), /Alterar/);
  assert.equal(bill.valor, 0.25);
  assert.match(say('sim'), /280,25/);
  assert.equal(Store.movements[0].valor, 280.25);
  assert.match(say('Apague essa conta'), /Confirma excluir.*pagamento vinculado/);
  assert.match(say('não'), /cancelada/);
  assert.equal(Store.commitments.length, 1);
  say('Apague essa conta');
  assert.match(say('sim'), /Excluí/);
  assert.equal(Store.commitments.length, 0);
  assert.deepEqual(Store.movements.map(row => row.id), ['outro']);
});

testCase('escolhe pelo número e revalida a conta antes da confirmação', () => {
  const { Store, AlicerceIA, api } = createContext();
  const say = message => api.handleMessage(AlicerceIA, message);
  for (const id of ['Água', 'Luz']) {
    Store.commitments.push({ id, tipo: 'conta', descricao: id, valor: 75, data: '2026-10-14' });
  }
  assert.match(say('Apague essa conta'), /1\. Água[\s\S]*2\. Luz/);
  assert.match(say('2'), /Luz.*Confirma/);
  Store.commitments[1].valor = 80;
  assert.match(say('sim'), /mudou/);
  assert.equal(Store.commitments.length, 2);
});


testCase('planejamento separa mês atual, atrasos, pagamentos e projeções sem duplicar movimentações', () => {
  const {Store, api} = createContext();
  Store.commitments.push(
    {id:'old',tipo:'conta',descricao:'Energia',valor:150,data:'2026-10-20',status:'pendente'},
    {id:'rent',tipo:'conta',descricao:'Aluguel',valor:600,data:'2026-11-30',status:'pendente'},
    {id:'net',tipo:'conta',descricao:'Internet',valor:100,data:'2026-11-02',status:'concluido',paymentStatus:'pago',dataPagamento:'2026-11-01'},
    {id:'future',tipo:'conta',descricao:'Feira',valor:400,data:'2026-12-10',status:'pendente'},
    {id:'other-user',userId:'different',tipo:'conta',descricao:'Privado',valor:900,data:'2026-11-10',status:'pendente'}
  );
  Store.movements.push({id:'linked',tipo:'despesa',commitmentId:'net',valor:100,data:'2026-11-01',status:'pago'});
  const view=api.planningSnapshot('2026-11-04');
  assert.equal(view.total,700);
  assert.equal(view.paid,100);
  assert.equal(view.remaining,750);
  assert.equal(view.carry,150);
  assert.equal(view.future[0].pending,400);
  assert.equal(view.history[9].state,'carried');
  assert.equal(view.history[11].state,'future');
  const result=api.simulatePlanning(300,view);
  assert.equal(result.covered.length,1);
  assert.equal(result.covered[0].id,'old');
  assert.equal(result.remaining,150);
  assert.equal(Store.saveCalls,0);
  assert.equal(Store.movements.length,1);
});

testCase('recorrência explícita respeita fim do mês e não recria contas nem pagamentos', () => {
  const {Store,api}=createContext();
  assert.equal(api.createPlanningObligations('Feira',400,'2026-11-30',4,'essential'),4);
  assert.equal(Store.commitments.map(x=>x.data).join(','),'2026-11-30,2026-12-30,2027-01-30,2027-02-28');
  assert.equal(api.createPlanningObligations('Feira',400,'2026-11-30',4,'essential'),0);
  assert.equal(Store.movements.length,0);
  assert.ok(Store.commitments.every(x=>x.status==='pendente'));
});

testCase('histórico distingue pagamento em outro mês e data desconhecida de quitação mensal', () => {
  const {Store,api}=createContext();
  Store.commitments.push(
    {id:'early',tipo:'conta',descricao:'Água',valor:80,data:'2026-08-15',status:'concluido',paymentStatus:'pago',dataPagamento:'2026-08-08'},
    {id:'late',tipo:'conta',descricao:'Energia',valor:150,data:'2026-09-28',status:'concluido',paymentStatus:'pago',dataPagamento:'2026-10-03'},
    {id:'legacy',tipo:'conta',descricao:'Internet',valor:100,data:'2026-10-10',status:'concluido',paymentStatus:'pago'}
  );
  const v=api.planningSnapshot('2026-11-04');
  assert.equal(v.history[7].state,'closed');
  assert.equal(v.history[7].days,8);
  assert.equal(v.history[8].state,'carried');
  assert.equal(v.history[8].carried,150);
  assert.equal(v.history[9].state,'unknown');
  assert.equal(v.history[9].days,null);
  assert.equal(v.history[0].state,'empty');
});

testCase('Alicia responde simulação sem cadastrar dívida, receita ou pagamento', () => {
  const {Store,AlicerceIA,api}=createContext();
  Store.commitments.push({id:'energy',tipo:'conta',descricao:'Energia',valor:150,data:'2026-11-10',status:'pendente'});
  const reply=api.handleMessage(AlicerceIA,'Alicia, se eu conseguir 300 reais o que consigo pagar?');
  assert.match(reply,/Simulação/);
  assert.match(reply,/Energia/);
  assert.equal(Store.saveCalls,0);
  assert.equal(Store.commitments.length,1);
  assert.equal(Store.movements.length,0);
});


testCase('negação não confirma pagamento nem cria saída de caixa', () => {
  const { Store, AlicerceIA, api } = createContext();
  const reply = api.handleMessage(AlicerceIA, 'Ainda não paguei a conta de energia de R$ 150,00 que venceu em 20/10');
  assert.match(reply, /Cadastrei/);
  assert.equal(Store.commitments.length, 1);
  assert.equal(Store.commitments[0].paymentStatus, 'pendente');
  assert.equal(Store.movements.length, 0);
  assert.equal(api.getOverview().overdueTotal, 150);
});

testCase('vou pagar no dia 30 é obrigação futura, não gasto realizado', () => {
  const { Store, AlicerceIA, api } = createContext();
  api.handleMessage(AlicerceIA, 'Vou pagar aluguel de R$ 700 dia 30');
  assert.equal(Store.commitments.length, 1);
  assert.equal(Store.commitments[0].data, '2026-11-30');
  assert.equal(Store.commitments[0].paymentStatus, 'pendente');
  assert.equal(Store.movements.length, 0);
});

testCase('negação em complemento de cadastro permanece pendente', () => {
  const { Store, AlicerceIA, api } = createContext();
  api.handleMessage(AlicerceIA, 'Tenho uma conta antiga de internet de R$ 100');
  api.handleMessage(AlicerceIA, 'Venceu em 20/10 e não paguei');
  assert.equal(Store.commitments.length, 1);
  assert.equal(Store.commitments[0].paymentStatus, 'pendente');
  assert.equal(Store.movements.length, 0);
});

testCase('intenção de pagar amanhã não quita conta acompanhada', () => {
  const { Store, AlicerceIA, api } = createContext();
  Store.installments.push({ id: 'future', tipo: 'pagar', descricao: 'Parcela', valor: 500, data: '2026-11-04', status: 'pendente' });
  AlicerceIA._pendingPaymentCheck = { key: 'installment:future' };
  api.handleMessage(AlicerceIA, 'Vou pagar amanhã');
  assert.equal(Store.installments[0].status, 'pendente');
  assert.equal(Store.movements.length, 0);
});

testCase('pergunta sobre contas pagas não inicia um novo cadastro', () => {
  const { Store, AlicerceIA, api } = createContext();
  api.handleMessage(AlicerceIA, 'Quais contas eu já paguei?');
  assert.equal(AlicerceIA._pendingDebtDraft, null);
  assert.equal(Store.commitments.length, 0);
  assert.equal(Store.movements.length, 0);
});

testCase('pagamento parcial não quita a dívida integral', () => {
  const { Store, AlicerceIA, api } = createContext();
  api.handleMessage(AlicerceIA, 'Paguei metade da conta de energia de R$ 150');
  assert.equal(Store.commitments.length, 0);
  assert.equal(Store.movements.length, 0);
});

testCase('pagamento explícito preserva data real e não fica pendente', () => {
  const { Store, AlicerceIA, api } = createContext();
  api.handleMessage(AlicerceIA, 'Paguei ontem aluguel de R$ 700');
  assert.equal(Store.commitments.length, 1);
  assert.equal(Store.commitments[0].paymentStatus, 'pago');
  assert.equal(Store.movements.length, 1);
  assert.equal(Store.movements[0].data, '2026-11-03');
});


testCase('filtros separam dívidas vencidas, de hoje, futuras e pagas', () => {
  const { Store, api } = createContext();
  Store.commitments.push(
    {id:'old',tipo:'conta',descricao:'Energia',valor:150,data:'2026-10-30',status:'pendente'},
    {id:'today',tipo:'conta',descricao:'Internet',valor:100,data:'2026-11-04',status:'pendente'},
    {id:'future',tipo:'conta',descricao:'Aluguel',valor:700,data:'2026-11-30',status:'pendente'},
    {id:'paid',tipo:'conta',descricao:'Água',valor:90,data:'2026-11-01',status:'pago',dataPagamento:'2026-11-01'}
  );
  assert.equal(api.filterPayments('pendentes').length,3);
  assert.equal(api.filterPayments('vencidas')[0].id,'old');
  assert.equal(api.filterPayments('hoje')[0].id,'today');
  assert.equal(api.filterPayments('futuras')[0].id,'future');
  assert.equal(api.filterPayments('pagas')[0].id,'paid');
  assert.match(api.renderFinancialSummary(),/Conferir pagamentos/);
});

testCase('conferência exige data real antes de baixar uma dívida', () => {
  const { Store, AlicerceIA, api } = createContext();
  Store.commitments.push({id:'bill',tipo:'conta',descricao:'Energia',valor:150,data:'2026-10-30',status:'pendente'});
  const question = api.handleMessage(AlicerceIA,'Conferir pagamentos');
  assert.match(question,/Essa dívida já foi paga/);
  assert.match(question,/Energia/);
  assert.match(api.handleMessage(AlicerceIA,'Sim'),/Em que dia/);
  assert.equal(Store.movements.length,0);
  api.handleMessage(AlicerceIA,'Ontem');
  assert.equal(Store.movements.length,1);
  assert.equal(Store.commitments[0].paymentStatus,'pago');
  assert.equal(Store.commitments[0].dataPagamento,'2026-11-03');
  assert.equal(api.filterPayments('pendentes').length,0);
  assert.equal(api.openPaymentCheck(encodeURIComponent('commitment:bill')),false);
  assert.equal(Store.movements.length,1);
});

testCase('escolher conta específica no filtro e adiar não altera valores', () => {
  const { Store, AlicerceIA, api } = createContext();
  Store.commitments.push(
    {id:'a',tipo:'conta',descricao:'Energia',valor:150,data:'2026-11-04',status:'pendente'},
    {id:'b',tipo:'conta',descricao:'Aluguel',valor:700,data:'2026-11-30',status:'pendente'}
  );
  assert.match(api.handleMessage(AlicerceIA,'Verificar pagamentos'),/Responda com o número/);
  assert.match(api.handleMessage(AlicerceIA,'2'),/Aluguel/);
  assert.match(api.handleMessage(AlicerceIA,'Depois'),/sem registrar pagamento/);
  assert.equal(Store.movements.length,0);
  assert.equal(api.filterPayments('pendentes').length,2);
});

testCase('pergunta sobre outra conta não quita a dívida selecionada', () => {
  const { Store, AlicerceIA, api } = createContext();
  Store.commitments.push({id:'bill',tipo:'conta',descricao:'Energia',valor:150,data:'2026-10-30',status:'pendente'});
  api.handleMessage(AlicerceIA,'Conferir pagamentos');
  api.handleMessage(AlicerceIA,'Paguei aluguel ontem');
  assert.equal(Store.movements.length,0);
  assert.equal(Store.commitments[0].status,'pendente');
});


testCase('consulta do mês inclui compromissos manuais com valor e exclui lembretes', () => {
  const { Store, AlicerceIA, api } = createContext();
  Store.commitments.push(
    {id:'manual',tipo:'compromisso',descricao:'Assinatura ChatGPT',valor:100,data:'2026-11-30',status:'pendente'},
    {id:'reminder',tipo:'lembrete',descricao:'Lembrete',valor:80,data:'2026-11-15',status:'pendente'},
    {id:'appointment',tipo:'compromisso',descricao:'Reunião',valor:null,data:'2026-11-20',status:'pendente'}
  );
  assert.equal(api.planningSnapshot().remaining,100);
  assert.equal(api.filterPayments('pendentes').length,1);
  const reply=api.handleMessage(AlicerceIA,'Alicia dívidas para eu pagar ? Esse mês');
  assert.match(reply,/Assinatura ChatGPT/);
  assert.match(reply,/100,00/);
  assert.equal(Store.movements.length,0);
});

testCase('consulta mensal vazia explica o limite dos registros cadastrados', () => {
  const { AlicerceIA, api } = createContext();
  const reply=api.handleMessage(AlicerceIA,'Dívidas para eu pagar esse mês');
  assert.match(reply,/Não encontrei obrigações financeiras cadastradas/);
  assert.match(reply,/sincronizada/);
});
