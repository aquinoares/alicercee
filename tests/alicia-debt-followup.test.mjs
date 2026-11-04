import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import testCase from 'node:test';

const source = readFileSync(new URL('../assets/alicia-debt-followup.js', import.meta.url), 'utf8');

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
