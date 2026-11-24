import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const scope = {};
scope.window = scope;
vm.runInNewContext(readFileSync(new URL('../assets/alicia-conversa.js', import.meta.url), 'utf8'), scope);
const chat = scope.AlicerceConversa;

function advance(question, state) {
  return chat.remember(state, chat.turn(question, state).query);
}

test('retém o mercado em várias perguntas e compara dois períodos da mesma consulta', () => {
  let state = advance('Alícia, me fala quanto gastei no mercado este mês?');
  state = advance('E no mês passado?', state);
  assert.equal(state.current.subject, 'market');
  assert.equal(state.current.period, 'mes passado');
  assert.equal(chat.turn('Compara os dois', state).compare[0].period, 'este mes');
  state = advance('E na semana passada?', state);
  assert.equal(state.current.subject, 'market');
  assert.equal(state.current.period, 'semana passada');
  state = advance('E só no Sodexo?', state);
  assert.equal(state.current.subject, 'pluxee');
  assert.equal(state.current.marketOnly, true);
  assert.equal(state.current.period, 'semana passada');
});

test('pede contexto após limpar a conversa e mantém comandos fora da consulta', () => {
  assert.match(chat.turn('E com meu filho?', null).prompt, /Qual gasto/);
  assert.equal(chat.turn('compara os dois', null).compare, undefined);
  const state = advance('Quanto gastei com alimentação?');
  assert.equal(chat.turn('Paguei R$ 50 em dinheiro', state), null);
  assert.equal(chat.turn('Quero cancelar a correção', state), null);
  assert.equal(chat.turn('Quanto paguei de aluguel?', state), null);
  assert.equal(advance('E com minha esposa?', state).current.subject, 'partner');
});

test('o filtro do vale respeita o período e a categoria do mercado', () => {
  let state = advance('Quanto gastei no mercado no mês passado?');
  state = advance('E só no Sodexo?', state);
  const wallets = [
    {provider:'pluxee',entries:[
      {kind:'debit',amount:50,date:'2026-10-15',subcategory:'mercado'},
      {kind:'debit',amount:20,date:'2026-10-15',subcategory:'restaurante'},
      {kind:'credit',amount:300,date:'2026-10-01'},
      {kind:'debit',amount:40,date:'2026-11-15',subcategory:'mercado'}]},
    {provider:'solides',entries:[{kind:'debit',amount:30,date:'2026-10-25',subcategory:'mercado'}]}
  ];
  const outcome = chat.spending(state.current,{start:'2026-10-01',end:'2026-10-31'},[],wallets);
  assert.equal(outcome.total,50);
  assert.equal(outcome.count,1);
  assert.match(outcome.label,/Mercado com Sodexo/);
});

test('mantém a consulta composta e troca só o período', () => {
  const query = chat.marketQuery('Quanto gastei no mercado neste mês, o que encareceu e quanto saiu do Sodexo?');
  assert.equal(query.period,'este mes');
  assert.match(query.question,/encareceu/);
  const next = chat.turn('E anteontem?',chat.remember(null,query)).query;
  assert.equal(next.kind,'market');
  assert.equal(next.period,'anteontem');
  assert.equal(next.question,query.question);
});
