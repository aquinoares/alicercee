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
