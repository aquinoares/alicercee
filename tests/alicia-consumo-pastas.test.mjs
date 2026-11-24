import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

function moduleWithReceipts(receipts = []) {
  const scope = { Store: { userId: 'conta', settings: { consumptionReceiptsV1: receipts } } };
  scope.window = scope;
  const source = readFileSync(new URL('../assets/alicia-consumo-pastas.js', import.meta.url), 'utf8');
  vm.runInNewContext(source, scope);
  return scope.AlicerceConsumo;
}

test('preserva produtos idênticos em linhas diferentes da mesma nota', () => {
  const product = 'FAROFA PRONTA YOKI 400G\nQtde.:1 UN:1 Vl. Unit.: 7,99 Vl. Total\n7,99';
  const parser = moduleWithReceipts();
  const items = parser.parse('VAREJO LTDA\n' + product + '\n' + product);
  assert.equal(items.length, 2);
  assert.equal(items[0].total + items[1].total, 15.98);
});

test('compara as duas últimas compras em meses diferentes sem acessar outra conta', () => {
  const note = (id, date, total, ownerId = 'conta') => ({
    id, date, ownerId, items: [{ name: 'Farofa Yoki 400G', total, quantity: 1, folder: 'alimentacao' }]
  });
  const receipts = [note('a', '30/10/2026', 6), note('c', '23/11/2026', 8), note('b', '02/11/2026', 7), note('d', '24/11/2026', 500, 'outra')];
  const answer = moduleWithReceipts(receipts).summary('Compare o preço da farofa Yoki 400g nas minhas pastas');
  assert.match(answer, /R\$\s*7,00 e R\$\s*8,00/);
  assert.doesNotMatch(answer, /500/);
});
