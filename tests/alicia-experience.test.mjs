import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../assets/alicia-chat-experience.js', import.meta.url), 'utf8');

function normalize(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function makeStore(cards) {
  return {
    testOnly: true,
    cards: cards || [],
    installments: [],
    movements: [],
    saved: 0,
    addMovement(row) {
      const movement = Object.assign({ id: 'mv-' + (this.movements.length + 1) }, row);
      this.movements.push(movement);
      return movement;
    },
    updateMovement(id, patch) {
      const movement = this.movements.find(function (item) { return item.id === id; });
      if (!movement) return false;
      Object.assign(movement, patch);
      return true;
    },
    removeMovement(id) {
      const before = this.movements.length;
      this.movements = this.movements.filter(function (item) { return item.id !== id; });
      return before !== this.movements.length;
    },
    addInstallmentsBatch(rows) {
      const before = this.installments.length;
      try {
        rows.forEach((row) => {
          this.installments.push(Object.assign({ id: 'inst-' + (this.installments.length + 1) }, row));
        });
      } catch (error) {
        this.installments.length = before;
        return [];
      }
      return this.installments.length - before === rows.length ? rows : [];
    },
    replaceInstallments(purchaseId, rows) {
      const before = this.installments.slice();
      this.installments = this.installments.filter(function (item) {
        return String(item.compraId) !== String(purchaseId);
      });
      const added = this.addInstallmentsBatch(rows);
      if (added.length !== rows.length) {
        this.installments = before;
        return false;
      }
      return true;
    },
    save() {
      this.saved += 1;
    }
  };
}

function makeHarness(options) {
  options = options || {};
  const store = options.store || { lang: 'pt' };
  const timers = [];
  const localStorage = {
    values: Object.create(null),
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(this.values, key) ? this.values[key] : null;
    },
    setItem(key, value) {
      this.values[key] = String(value);
    }
  };

  const brain = {
    classify(message) {
      const value = normalize(message);
      if (/pensando em me matar|quero me matar|quero morrer|acabar com a minha vida|nao aguento mais/.test(value)) {
        return 'self_safety_crisis';
      }
      if (/quanto|saldo|gastei|parcelas|cartao|fatura|mercado/.test(value)) return 'financial';
      if (/desanimad|cansad|triste|sem animo/.test(value)) return 'sadness';
      return 'unknown';
    },
    respond(message) {
      const value = normalize(message);
      if (/pensando em me matar|quero me matar|quero morrer|acabar com a minha vida|nao aguento mais/.test(value)) {
        return {
          intent: 'self_safety_crisis',
          handled: true,
          text: 'Resposta original de crise. SAMU 192 e CVV 188. Você está em segurança agora?'
        };
      }
      if (/desanimad|cansad|triste|sem animo/.test(value)) {
        return { intent: 'care_check', handled: true, text: 'Acolhimento original.' };
      }
      if (/quanto|saldo|gastei|parcelas|cartao|fatura/.test(value)) {
        return { intent: 'financial', handled: true, text: 'Resposta financeira do motor.' };
      }
      return { intent: 'unknown', handled: false, text: 'Não entendi.' };
    },
    assessSelfHarmRisk(message) {
      const value = normalize(message);
      return /pensando em me matar|quero me matar|quero morrer|acabar com a minha vida/.test(value) ? 'high' : 'medium';
    }
  };

  const calls = [];
  const ai = {
    _messages: [],
    _answer: '',
    calls: calls,
    async enviarMensagem(message) {
      calls.push(message);
      this._messages.push({ role: 'user', text: message });
      const result = brain.respond(message, this._messages, 'pt');
      this._answer = result.text;
      this._messages.push({ role: 'assistant', text: result.text });
      if (result.intent === 'self_safety_crisis') {
        this._aliciaCareState = { level: 'medium', remaining: 3 };
      } else if (result.intent === 'care_check') {
        this._aliciaCareState = { level: 'low' };
      }
      return result.text;
    }
  };

  const root = {
    AliciaBrain: brain,
    localStorage: localStorage,
    setTimeout(callback, delay) {
      timers.push({ callback: callback, delay: delay });
      return timers.length;
    },
    clearTimeout() {}
  };

  const document = {
    getElementById() {
      return null;
    }
  };
  if (typeof options.renderer === 'function') root.renderAssistente = options.renderer;

  const context = vm.createContext({
    window: root,
    AlicerceIA: ai,
    Store: store,
    Clock: { today() { return '2026-11-03'; } },
    document: document,
    render() {}
  });
  new vm.Script(source, { filename: 'alicia-chat-experience.js' }).runInContext(context);

  if (options.testStore) {
    assert.equal(root.AliciaExpense.bindTestStore(options.testStore), true);
  }
  return {
    root: root,
    ai: ai,
    brain: brain,
    store: store,
    calls: calls,
    timers: timers,
    localStorage: localStorage,
    context: context
  };
}

test('picolé: extrai item limpo, valor por extenso, dinheiro e categoria', function () {
  const env = makeHarness();
  const result = env.root.AliciaExpense.parse(
    'Acabei de comprar um picolé de cinco reais no dinheiro',
    '2026-11-03'
  );
  assert.equal(result.amount, 5);
  assert.equal(result.item, 'picolé');
  assert.equal(result.paymentMethod, 'dinheiro');
  assert.equal(result.category, 'comida');
  assert.equal(result.subcategory, 'doces');
});

test('frase informal sobre vontade não vira nome do item nem é ecoada', function () {
  const env = makeHarness();
  const result = env.root.AliciaExpense.parse(
    'Alicia eu tava com vontade resolvi comprar um picolé',
    '2026-11-03'
  );
  assert.equal(result.item, 'picolé');
  assert.equal(result.amount, null);
  assert.doesNotMatch(result.item, /alicia|vontade|resolvi/i);
});

test('gastei 32 no mercado reconhece valor e pergunta somente forma de pagamento', function () {
  const env = makeHarness();
  const result = env.root.AliciaExpense.parse('gastei 32 no mercado', '2026-11-03');
  assert.equal(result.amount, 32);
  assert.equal(result.item, 'mercado');
  assert.equal(result.category, 'comida');
  assert.equal(result.subcategory, 'mercado');
  assert.equal(result.needsClarification, 'payment');
});

test('Uber de 50 ontem no Pix reconhece valor, item, pagamento e data', function () {
  const env = makeHarness();
  const result = env.root.AliciaExpense.parse('paguei 50 de uber ontem no pix', '2026-11-03');
  assert.equal(result.amount, 50);
  assert.equal(result.item, 'uber');
  assert.equal(result.paymentMethod, 'pix');
  assert.equal(result.date, '2026-11-02');
  assert.equal(result.category, 'transporte');
});

test('comprei um negócio sem valor pede primeiro somente o valor', function () {
  const env = makeHarness();
  const result = env.root.AliciaExpense.parse('comprei um negócio', '2026-11-03');
  assert.equal(result.amount, null);
  assert.equal(result.item, 'Compra');
  assert.equal(result.needsClarification, 'amount');
});

test('açaí sem acento e valor no débito são reconhecidos como cartão de débito', function () {
  const env = makeHarness();
  const result = env.root.AliciaExpense.parse('tomei um acai de 18 no debito', '2026-11-03');
  assert.equal(result.amount, 18);
  assert.equal(result.item, 'açaí');
  assert.equal(result.paymentMethod, 'cartao');
  assert.equal(result.cardType, 'debito');
  assert.equal(result.category, 'comida');
});

test('tênis de 300 em 3x reconhece cartão de crédito e vestuário', function () {
  const env = makeHarness();
  const result = env.root.AliciaExpense.parse('comprei um tênis de 300 em 3x no cartão', '2026-11-03');
  assert.equal(result.amount, 300);
  assert.equal(result.item, 'tênis');
  assert.equal(result.installments, 3);
  assert.equal(result.paymentMethod, 'cartao');
  assert.equal(result.cardType, 'credito');
  assert.equal(result.category, 'vestuario');
  assert.equal(result.isCardPurchase, true);
});

test('pedido aberto de compra no cartão pergunta somente valor e assume à vista', function () {
  const env = makeHarness();
  const result = env.root.AliciaExpense.parse('me adiciona uma compra no cartão', '2026-11-03');
  assert.equal(result.addCard, true);
  assert.equal(result.amount, null);
  assert.equal(result.paymentMethod, 'cartao');
  assert.equal(result.cardType, 'credito');
  assert.equal(result.installments, 1);
  assert.equal(result.needsClarification, 'amount');
});

test('valores informais em conto e uns trinta são entendidos', function () {
  const env = makeHarness();
  assert.equal(env.root.AliciaExpense.parseAmount('foi 50 conto').value, 50);
  assert.equal(env.root.AliciaExpense.parseAmount('uns 30 reais').value, 30);
});

test('dicionário reconhece itens e regionalismos do Nordeste', function () {
  const env = makeHarness();
  ['cuscuz', 'macaxeira', 'tapioca', 'quentinha', 'bolo de rolo'].forEach(function (item) {
    assert.equal(env.root.AliciaExpense.resolveCategory(item).category, 'comida');
  });
});

test('pergunta pendente de pagamento é feita uma vez e grava o gasto de teste sem ecoar a frase', async function () {
  const store = makeStore();
  const env = makeHarness({ testStore: store });
  const first = await env.ai.enviarMensagem('gastei 32 no mercado');
  assert.match(first, /Como você pagou/);
  const second = await env.ai.enviarMensagem('foi no pix');
  assert.match(second, /Anotei: mercado, R\$\s*32,00/);
  assert.equal(store.movements.length, 1);
  assert.equal(store.movements[0].forma, 'pix');
  assert.equal(store.movements[0].valor, 32);
  assert.doesNotMatch(second, /gastei 32 no mercado/i);
});

test('sem adaptador testOnly não consulta nem altera Store real', async function () {
  let reads = 0;
  const realShapedStore = {
    lang: 'pt',
    get cards() { reads += 1; throw new Error('Store real não pode ser consultado'); },
    get installments() { reads += 1; throw new Error('Store real não pode ser consultado'); }
  };
  const env = makeHarness({ store: realShapedStore });
  const response = await env.ai.enviarMensagem('Acabei de comprar um picolé de cinco reais no dinheiro');
  assert.match(response, /não registrei/i);
  assert.equal(reads, 0);
  assert.equal(env.root.AliciaExpense.isTestStoreBound(), false);
});

test('adaptador rejeita Store sem marcador testOnly e sem gravação em lote', function () {
  const env = makeHarness();
  assert.equal(env.root.AliciaExpense.bindTestStore({
    cards: [], installments: [],
    addMovement() {},
    addInstallmentsBatch() {}
  }), false);
  assert.equal(env.root.AliciaExpense.bindTestStore(makeStore()), true);
});

test('parcelas do mês usam vencimento e incluem compra realizada em mês antigo', function () {
  const env = makeHarness();
  const rows = env.root.AliciaExpense.listInstallments(
    [{ id: 'nub', nome: 'Nubank' }],
    [
      {
        id: 'old-april',
        tipo: 'cartao',
        cardId: 'nub',
        descricao: 'Geladeira',
        parcelaAtual: 2,
        parcelas: 10,
        valor: 100,
        data: '2026-11-10',
        dataCompra: '2026-01-10',
        status: 'pendente'
      },
      {
        id: 'previous-month',
        tipo: 'cartao',
        cardId: 'nub',
        descricao: 'Geladeira',
        parcelaAtual: 1,
        parcelas: 10,
        valor: 100,
        data: '2026-10-10',
        dataCompra: '2026-01-10',
        status: 'pago'
      },
      {
        id: 'future',
        tipo: 'cartao',
        cardId: 'nub',
        descricao: 'TV',
        parcelaAtual: 1,
        parcelas: 2,
        valor: 80,
        data: '2026-12-10',
        dataCompra: '2026-11-10',
        status: 'pendente'
      },
      {
        id: 'orphan',
        tipo: 'cartao',
        cardId: 'unknown-card',
        descricao: 'Sem cartão',
        parcelaAtual: 1,
        parcelas: 3,
        valor: 20,
        data: '2026-11-15',
        status: 'pendente'
      }
    ],
    '2026-11'
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].description, 'Geladeira');
  assert.equal(rows[0].part, 2);
  assert.equal(rows[0].parts, 10);
  assert.equal(rows[0].amount, 100);
  assert.equal(rows[0].cardName, 'Nubank');
  assert.equal(rows[0].purchaseDate, '2026-01-10');
});

test('saldo do cartão exclui apenas parcelas pagas e considera parcelas ainda abertas', function () {
  const env = makeHarness();
  const result = env.root.AliciaExpense.cardBalance(
    [{ id: 'nub', nome: 'Nubank', fechamento: 20, vencimento: 27 }],
    [
      { tipo: 'cartao', cardId: 'nub', descricao: 'Compra antiga', data: '2026-11-27', valor: 100, status: 'pendente', recebido: false },
      { tipo: 'cartao', cardId: 'nub', descricao: 'Compra paga', data: '2026-11-27', valor: 50, status: 'pago', recebido: true },
      { tipo: 'cartao', cardId: 'nub', descricao: 'Compra de terceiro', data: '2026-11-27', valor: 25, status: 'pendente', recebido: true },
      { tipo: 'cartao', cardId: 'nub', descricao: 'Mês futuro', data: '2026-12-27', valor: 40, status: 'pendente' }
    ],
    '2026-11-03'
  );
  assert.equal(result.invoices[0].month, '2026-11');
  assert.equal(result.total, 125);
});

test('compra parcelada divide centavos e calcula primeira parcela por fechamento e vencimento', function () {
  const env = makeHarness();
  const rows = env.root.AliciaExpense.buildCardRows(
    { id: 'nub', fechamento: 20, vencimento: 27 },
    {
      amount: 100,
      installments: 3,
      item: 'tênis',
      category: 'vestuario',
      subcategory: 'calcados',
      date: '2026-11-21'
    },
    '2026-11-03'
  );
  assert.equal(rows.length, 3);
  assert.equal(rows.reduce((sum, row) => sum + Math.round(row.valor * 100), 0), 10000);
  assert.equal(new Set(rows.map(row => row.compraId)).size, 1);
  assert.equal(rows[0].data, '2026-12-27');
  assert.equal(rows[0].dataCompra, '2026-11-21');
});

test('compra parcelada pede confirmação antes de criar parcelas', async function () {
  const store = makeStore([{ id: 'nub', nome: 'Nubank', fechamento: 20, vencimento: 27 }]);
  const env = makeHarness({ testStore: store });
  const preview = await env.ai.enviarMensagem('comprei um tênis de 300 em 3x no cartão');
  assert.match(preview, /Vou criar 3 parcelas/);
  assert.equal(store.installments.length, 0);
  env.ai.confirmarCompraCartao();
  assert.equal(store.installments.length, 3);
  assert.equal(store.saved, 1);
  assert.equal(store.installments.reduce((sum, row) => sum + Math.round(row.valor * 100), 0), 30000);
});

test('compra no cartão à vista usa o único cartão e não pergunta quantidade de parcelas', async function () {
  const store = makeStore([{ id: 'nub', nome: 'Nubank', fechamento: 20, vencimento: 27 }]);
  const env = makeHarness({ testStore: store });
  await env.ai.enviarMensagem('me adiciona uma compra no cartão');
  const answer = await env.ai.enviarMensagem('180');
  assert.match(answer, /à vista/);
  assert.equal(store.installments.length, 1);
});

test('com mais de um cartão a Alicia pergunta qual foi usado', async function () {
  const store = makeStore([{ id: 'nub', nome: 'Nubank' }, { id: 'inter', nome: 'Inter' }]);
  const env = makeHarness({ testStore: store });
  await env.ai.enviarMensagem('comprei tênis de 300 em 3x no cartão');
  const answer = await env.ai.enviarMensagem('Nubank');
  assert.match(answer, /Antes de salvar/);
  assert.equal(env.ai._aliciaCardPurchasePreview.card.id, 'nub');
});

test('cartão de débito registra gasto pago e não cria parcelas de fatura', async function () {
  const store = makeStore([{ id: 'nub', nome: 'Nubank' }]);
  const env = makeHarness({ testStore: store });
  const answer = await env.ai.enviarMensagem('comprei um açaí de 18 no débito');
  assert.match(answer, /cartão de débito/);
  assert.equal(store.movements.length, 1);
  assert.equal(store.movements[0].cardType, 'debito');
  assert.equal(store.movements[0].forma, 'cartao');
  assert.equal(store.installments.length, 0);
});

test('débito informado em 3x exige confirmação para registrar à vista', async function () {
  const store = makeStore([{ id: 'nub', nome: 'Nubank' }]);
  const env = makeHarness({ testStore: store });
  const answer = await env.ai.enviarMensagem('comprei um tênis de 300 em 3x no débito');
  assert.match(answer, /débito não permite parcelamento/);
  assert.equal(store.movements.length, 0);
  const confirmed = await env.ai.enviarMensagem('sim, pode registrar à vista');
  assert.match(confirmed, /cartão de débito/);
  assert.equal(store.movements.length, 1);
  assert.equal(store.installments.length, 0);
});

test('primeiro retorno às finanças após crise pergunta uma vez e depois atende', async function () {
  const env = makeHarness();
  await env.ai.enviarMensagem('não aguento mais');
  const first = await env.ai.enviarMensagem('quanto gastei este mês?');
  assert.match(first, /como você está/i);
  const second = await env.ai.enviarMensagem('me mostra o saldo');
  assert.equal(second, 'Resposta financeira do motor.');
  assert.equal(env.ai._aliciaCareState, null);
  assert.equal(env.calls.filter(x => /saldo|gastei/i.test(x)).length, 2);
});

test('confirmação positiva retoma a pergunta financeira que estava pendente', async function () {
  const env = makeHarness();
  await env.ai.enviarMensagem('não aguento mais');
  await env.ai.enviarMensagem('quanto gastei este mês?');
  const answer = await env.ai.enviarMensagem('sim, pode continuar');
  assert.equal(answer, 'Resposta financeira do motor.');
  assert.equal(env.calls[1], 'quanto gastei este mês?');
});

test('estado de cuidado expira automaticamente depois de 30 minutos', async function () {
  const env = makeHarness();
  await env.ai.enviarMensagem('não aguento mais');
  assert.equal(env.timers.length, 1);
  assert.equal(env.timers[0].delay, 30 * 60 * 1000);
  env.timers[0].callback();
  assert.equal(env.ai._aliciaCareState, null);
});

test('mensagem de crise durante pergunta pendente preempta o estado financeiro', async function () {
  const store = makeStore();
  const env = makeHarness({ testStore: store });
  await env.ai.enviarMensagem('gastei 32 no mercado');
  const answer = await env.ai.enviarMensagem('estou pensando em me matar');
  assert.match(answer, /SAMU 192/);
  assert.match(answer, /CVV 188/);
  assert.equal(env.ai._aliciaExpensePending, null);
  assert.equal(store.movements.length, 0);
});

test('frase ambígua sobre filha que vai embora pede contexto sem presumir crise', async function () {
  const env = makeHarness();
  const answer = await env.ai.enviarMensagem('minha filha mandou áudio dizendo que vai embora');
  assert.match(answer, /sair de casa/i);
  assert.doesNotMatch(answer, /SAMU|CVV|Você está em segurança/i);
});

test('acolhimento de baixo risco oferece cinco respostas diferentes sem repetição imediata', function () {
  const env = makeHarness();
  let history = [];
  const answers = [];
  for (let i = 0; i < 5; i += 1) {
    const result = env.brain.respond('estou desanimado', history, 'pt');
    answers.push(result.text);
    history.push({ role: 'assistant', text: result.text });
  }
  assert.equal(new Set(answers).size, 5);
  for (let i = 1; i < answers.length; i += 1) assert.notEqual(answers[i], answers[i - 1]);
});

test('acolhimento de risco médio oferece cinco respostas com SAMU 192 e CVV 188', function () {
  const env = makeHarness();
  let history = [];
  const answers = [];
  for (let i = 0; i < 5; i += 1) {
    const result = env.brain.respond('não aguento mais, queria sumir', history, 'pt');
    answers.push(result.text);
    history.push({ role: 'assistant', text: result.text });
    assert.match(result.text, /SAMU 192/);
    assert.match(result.text, /CVV 188/);
  }
  assert.equal(new Set(answers).size, 5);
});

test('mensagem desconhecida só é registrada depois do consentimento', async function () {
  const env = makeHarness();
  await env.ai.enviarMensagem('essa frase inventada nao foi entendida');
  assert.equal(env.localStorage.getItem('alicia_unknown_feedback_v1'), null);
  assert.equal(env.ai._aliciaUnknownConsentPending, true);
  env.ai.registrarNaoEntendida(false);
  assert.equal(env.localStorage.getItem('alicia_unknown_feedback_v1'), null);
});

test('mensagem desconhecida consentida fica somente no aparelho e sem vínculo de usuário', async function () {
  const env = makeHarness();
  await env.ai.enviarMensagem('essa outra frase inventada nao foi entendida');
  assert.equal(env.ai.registrarNaoEntendida(true), true);
  const saved = JSON.parse(env.localStorage.getItem('alicia_unknown_feedback_v1'));
  assert.equal(saved.length, 1);
  assert.equal(saved[0].text, 'essa outra frase inventada nao foi entendida');
  assert.doesNotMatch(JSON.stringify(saved), /userId|usuario_id|cpf|saldo|senha/i);
});

test('filtro de feedback local recusa número, dado financeiro e contexto familiar', async function () {
  const numeric = makeHarness();
  await numeric.ai.enviarMensagem('frase livre 123');
  assert.equal(numeric.ai.registrarNaoEntendida(true), false);
  assert.equal(numeric.localStorage.getItem('alicia_unknown_feedback_v1'), null);

  const family = makeHarness();
  await family.ai.enviarMensagem('minha filha maria está passando por isso');
  assert.equal(family.ai.registrarNaoEntendida(true), false);
  assert.equal(family.localStorage.getItem('alicia_unknown_feedback_v1'), null);
});

test('áudio, reconhecimento e TTS ficam desativados em runtime', function () {
  const env = makeHarness();
  assert.equal(env.root.ALICIA_CHAT_CONFIG.audioEnabled, false);
  assert.equal(env.root.ALICIA_CHAT_CONFIG.recognitionEnabled, false);
  assert.equal(env.ai._audioEnabled, false);
  assert.equal(env.ai._recognitionEnabled, false);
  assert.equal(env.ai.pedirAudio(), false);
  assert.equal(env.ai.toggleMicrofone(), false);
});

test('interface remove microfone e Ouvir resposta, preserva câmera e mostra aviso', function () {
  const env = makeHarness({
    renderer() {
      return '<style id="alicerce-assistant-screen-styles"></style><section class="alicerce-assistant-heading"></section><section class="alicerce-assistant-chat-panel"><button class="alicerce-assistant-speak">Ouvir resposta</button><form><button id="alicerce-assistant-camera" class="alicerce-assistant-camera">Câmera</button><button id="alicerce-assistant-mic" class="alicerce-assistant-mic">Microfone</button><input placeholder="Digite sua mensagem..."></form></section>';
    }
  });
  const html = env.root.renderAssistente();
  assert.doesNotMatch(html, /alicerce-assistant-mic|alicerce-assistant-speak/);
  assert.match(html, /alicerce-assistant-camera/);
  assert.match(html, /placeholder="Digite sua mensagem"/);
  assert.match(html, /Dica: toque no microfone do teclado para ditar/);
  assert.match(html, /Alicia é uma assistente digital/);
  assert.match(html, /CVV 188/);
  assert.match(html, /SAMU 192/);
});

test('correção de categoria atualiza um movimento existente e não cria duplicata', async function () {
  const store = makeStore();
  const env = makeHarness({ testStore: store });
  await env.ai.enviarMensagem('Acabei de comprar um picolé de cinco reais no dinheiro');
  assert.equal(store.movements.length, 1);
  assert.equal(env.ai.mudarCategoriaGasto(), true);
  assert.match(env.ai._answer, /nova categoria/i);
  const updated = env.ai.selecionarCategoriaCorrecao('transporte');
  assert.match(updated, /Atualizei o lançamento/);
  assert.equal(store.movements.length, 1);
  assert.equal(store.movements[0].categoria, 'transporte');
});

test('opções de correção e desfazer dependem de métodos presentes no adaptador', async function () {
  const env = makeHarness();
  env.ai._aliciaLastExpenseAction = { kind: 'movement', id: 'fake', draft: { amount: 10 } };
  assert.equal(env.ai.podeCorrigirUltimoGasto(), false);
  assert.equal(env.ai.podeDesfazerUltimoGasto(), false);
});
