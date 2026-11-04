import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const start = html.indexOf('AlicerceIA._buildFinanceContext=function(question,localAnswer){');
const end = html.indexOf('AlicerceIA._handleCommitmentQuery=async function(message){', start);
assert.ok(start >= 0 && end > start, 'Alicia finance context builder must exist');

const A = {
  _norm: function(value) {
    return String(value || '').toLowerCase().normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  }
};
const context = {
  AlicerceIA: A,
  today: function() { return '2026-11-03'; },
  Store: {
    cards: [{
      id: 'card-1',
      nome: 'Cartão principal',
      numero: '4111111111111111',
      limite: 5000,
      fechamento: 10,
      vencimento: 17
    }],
    installments: [{
      id: 'inst-1', tipo: 'cartao', descricao: 'Geladeira', parcelaAtual: 2,
      totalParcelas: 10, valor: 250, data: '2026-11-17', status: 'pendente'
    }],
    movements: [{
      id: 'move-1', tipo: 'despesa', descricao: 'Mercado', categoria: 'comida',
      subcategoria: 'mercado', valor: 340, data: '2026-11-02', status: 'pago'
    }],
    getBalances: function() {
      return {
        disponivel: 2200, aReceber: 300, aPagar: 500, comprometido: 700,
        disponivelApos: 1500, saldoProprio: 1700, patrimonio: 2000
      };
    },
    getCardCurrentInvoice: function() { return { total: 750, count: 3 }; },
    getCardAvailableLimit: function() { return 3500; },
    getCardUsedLimit: function() { return 1500; },
    calcLoanPending: function() { return { aReceber: 300, aPagar: 500 }; }
  }
};
vm.createContext(context);
vm.runInContext(html.slice(start, end), context, { filename: 'index.html:Alicia-finance-context' });

const raw = A._buildFinanceContext('Quanto tenho de saldo, cartões, parcelas e gastos?', 'Resumo local');
const data = JSON.parse(raw);
assert.equal(data.saldos.disponivel, 2200);
assert.equal(data.cartoes[0].fatura_atual, 750);
assert.equal(data.cartoes[0].limite_disponivel, 3500);
assert.equal(data.parcelas_pendentes[0].descricao, 'Geladeira');
assert.equal(data.movimentacoes_recentes[0].descricao, 'Mercado');
assert.equal(data.resumo_do_interpretador, 'Resumo local');
assert.equal(raw.includes('4111111111111111'), false, 'full card number must never enter model context');
assert.equal(raw.includes('card-1'), false, 'internal card identifiers must never enter model context');
assert.ok(raw.length < 5000, 'finance context must fit the Edge Function input bound');

console.log('Alicia financial context tests passed.');
