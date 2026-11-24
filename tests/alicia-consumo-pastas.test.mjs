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

test('detecta aumentos comparáveis antes da data final e agrupa compras no mesmo dia', () => {
  const note = (id, date, name, total, quantity = 1) => ({
    id, date, ownerId: 'conta', items: [{ name, total, quantity }]
  });
  const receipts = [
    note('a', '30/10/2026', 'Farofa Yoki 400G', 6),
    note('b', '12/11/2026', 'Farofa Yoki 400G', 14, 2),
    note('c', '12/11/2026', 'Farofa Yoki 400G', 8),
    note('d', '25/11/2026', 'Farofa Yoki 400G', 500),
    note('e', '13/11/2026', 'Farofa Yoki 800G', 16)
  ];
  const response = moduleWithReceipts(receipts).increases('2026-11-01', '2026-11-23');
  assert.equal(response.comparable, 1);
  assert.equal(response.items[0].name, 'Farofa Yoki 400G');
  assert.equal(response.items[0].previous, 6);
  assert.equal(response.items[0].delta, 1.33);
});

test('separa campos em linhas, produtos por peso e totais do cupom', () => {
  const items = moduleWithReceipts().parse([
    'FAROFA PRONTA YOKI 400G (Código: 75512)', 'Qtde.:1', 'UN: UN0001',
    'Vl. Unit.: 7,99', 'Vl. Total', '7,99',
    '10472 BISC TUCS PIZZA 100G 2 UN 2,19 4,38',
    '123 BANANA 0,500 KG x 8,00 4,00', 'TOTAL 16,37',
    '234 PRODUTO ILEGÍVEL 2 UN 8,00 1,00'
  ].join('\n'));
  assert.deepEqual(Array.from(items, i => [i.name,i.quantity,i.total]), [
    ['FAROFA PRONTA YOKI 400G',1,7.99],['BISC TUCS PIZZA 100G',2,4.38],['BANANA',0.5,4]
  ]);
});
