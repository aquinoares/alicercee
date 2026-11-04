import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const start = html.indexOf('AlicerceIA._handleCommitmentAlertFollowUp=async function(message){');
const end = html.indexOf('AlicerceIA.enviarMensagem=async function(question){', start);
assert.ok(start >= 0 && end > start, 'commitment follow-up handler must exist');

const A = {
  _messages: [
    { role: 'assistant', text: 'Pronto. Marquei ‘vou no dentista oras me lembra’ para 05 de nov. de 2026 às 14:00. Ele já está no seu calendário.' },
    { role: 'user', text: 'me avisa 30 minutos antes' }
  ],
  _norm: function(value) {
    return String(value || '').toLowerCase().normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  }
};
const Store = {
  userId: 'user-a',
  commitments: [{
    id: 'commitment-dentista',
    tipo: 'compromisso',
    descricao: 'vou no dentista oras me lembra',
    data: '2026-11-05',
    hora: '14:00',
    avisos: [0],
    status: 'pendente'
  }]
};
let writes = 0;
const Repository = {
  set: function(userId, storeName, value) {
    assert.equal(userId, 'user-a');
    assert.equal(storeName, 'commitments');
    assert.equal(value[0].avisos[0], 30);
    writes += 1;
  }
};
const context = { AlicerceIA: A, Store, Repository };
vm.createContext(context);
vm.runInContext(html.slice(start, end), context, { filename: 'index.html:Alicia-commitment-follow-up' });

const answer = await A._handleCommitmentAlertFollowUp('me avisa 30 minutos antes');
assert.match(answer, /30 minutos antes/);
assert.deepEqual(Array.from(Store.commitments[0].avisos), [30]);
assert.equal(Store.commitments[0].data, '2026-11-05');
assert.equal(Store.commitments[0].hora, '14:00');
assert.equal(writes, 1);

A._messages = [
  { role: 'assistant', text: 'Pronto. Marquei ‘consulta’ para 05 de nov. de 2026 às 14:00.' },
  { role: 'user', text: 'me avisa 30 minutos antes' }
];
const missing = await A._handleCommitmentAlertFollowUp('me avisa 30 minutos antes');
assert.match(missing, /não está carregado na agenda/);
assert.deepEqual(Array.from(Store.commitments[0].avisos), [30]);
assert.equal(writes, 1);

A._messages = [
  { role: 'assistant', text: 'Pronto. Marquei ‘vou no dentista oras me lembra’ para 05 de nov. de 2026 às 14:00.' },
  { role: 'user', text: 'me avisa meia hora antes' }
];
const halfHour = await A._handleCommitmentAlertFollowUp('me avisa meia hora antes');
assert.match(halfHour, /30 minutos antes/);
assert.equal(writes, 2);

console.log('Alicia commitment follow-up tests passed.');
