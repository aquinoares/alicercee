import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const scope = {};
scope.window = scope;
vm.runInNewContext(readFileSync(new URL('../assets/alicia-edicao-chat.js', import.meta.url), 'utf8'), scope);
const editor = scope.AlicerceEdicaoChat;
const original = { id: 'gasto', userId: 'a', tipo: 'despesa', status: 'pago', valor: 50, forma: 'pix', data: '2026-11-23', categoria: 'familia' };

test('interpreta o pagamento correto, o valor e a data sem editar o original', () => {
  const patch = editor.changes('Foi ontem, em dinheiro, valor R$ 42,50, mas lancei no Pix', () => '2026-11-22');
  const before = editor.snapshot(original);
  const updated = editor.updated(original, before, { ...before, ...patch }, 'a').record;
  assert.equal(updated.id, original.id);
  assert.equal(updated.categoria, original.categoria);
  assert.equal(updated.valor, 42.50);
  assert.equal(updated.data, '2026-11-22');
  assert.equal(updated.forma, 'dinheiro');
  assert.equal(original.valor, 50);
});

test('rejeita mudança de conta, correção desatualizada e registros vinculados', () => {
  const before = editor.snapshot(original);
  const next = { ...before, method: 'dinheiro' };
  assert.ok(editor.updated(original, before, next, 'b').error);
  assert.ok(editor.updated({ ...original, valor: 60 }, before, next, 'a').error);
  assert.ok(editor.updated({ ...original, commitmentId: 'conta' }, before, next, 'a').error);
  assert.ok(editor.updated(original, before, { ...next, date: '2026-02-30' }, 'a').error);
  assert.ok(editor.changes('Foi no cartão, mas lancei no Pix', () => '').error);
});

test('corrige o Pix da conversa só após escolher o cartão, o tipo e confirmar', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url),'utf8');
  for (const type of ['credito','debito']) {
    const row = {...original, descricao:'Assinatura GPT'};
    const store = {userId:'a', movements:[row], installments:[], cards:[{id:'n',nome:'Banco A'},{id:'b',nome:'Banco B',fechamento:20,vencimento:10}],
      _uid:()=>'token', addInstallment(i){this.installments.push(i);return i;},
      removeMovement(id){this.movements=this.movements.filter(m=>m.id!==id);},save(){}};
    const assistant = {_resetUser(){},_norm:s=>s.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(),_responderNoChat(){}};
    const ctx={AlicerceIA:assistant,window:scope,Store:store,fmtMoney:String,formatDateBR:String};
    vm.runInNewContext(html.slice(html.indexOf('AlicerceIA._tratarEdicao='),html.indexOf('AlicerceIA.cancelarEdicao=')),ctx);
    vm.runInNewContext(html.slice(html.indexOf('function vencimentoCompraCartao'),html.indexOf('function salvarGastoCreditoCartao')),ctx);
    assert.ok(assistant._tratarEdicao('opa, foi no cartao',row));
    assistant._tratarEdicao('2');
    assistant._tratarEdicao(type);
    assert.equal(store.movements[0].forma,'pix');
    assistant.confirmarEdicao('token');
    assistant.confirmarEdicao('token');
    assert.equal(store.movements.length + store.installments.length,1);
    const corrected=(type==='credito'?store.installments:store.movements)[0];
    assert.equal(corrected.cardId,'b');
    assert.equal(corrected.valor,50);
    assert.equal(corrected.dataCompra||corrected.data,row.data);
    if(type==='credito')assert.equal(corrected.data,'2027-01-10');
  }
});
