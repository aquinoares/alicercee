import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const start = html.indexOf('AlicerceIA._parseReminderDateTime=function(raw){');
const end = html.indexOf('AlicerceIA.enviarMensagem=async function(question){', start);
assert.ok(start >= 0 && end > start, 'Alicia reminder action block must exist');

const source = html.slice(start, end);
const commitments = [];
const A = {
  _pendingReminderDraft: null,
  _pendingReminderDelete: null,
  _norm: function(value) {
    return String(value || '').toLowerCase().normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  }
};
const context = {
  AlicerceIA: A,
  Store: {
    userId: 'user-a',
    commitments: commitments,
    _uid: function() { return 'fallback-id'; }
  },
  Repository: { _key: function() { return 'test-key'; } },
  fmtDate: function(value) { return value; },
  fmtMoney: function(value) { return 'R$ ' + Number(value).toFixed(2); },
  window: {
    crypto: { randomUUID: function() { return 'idempotency-test-0001'; } },
    localStorage: { setItem: function() {} }
  },
  today: function() { return '2026-11-03'; },
  dateShift: function(iso, offset) {
    const p = iso.split('-').map(Number);
    const d = new Date(p[0], p[1] - 1, p[2] + offset);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  },
  reminderDone: function(item, date) { return (item.feitos || []).indexOf(date) >= 0; },
  occursOn: function(item, date) {
    if (!item || !item.data || date < item.data) return false;
    if (!item.repeticao || item.repeticao === 'nenhuma') return date === item.data;
    const p = item.data.split('-').map(Number);
    const q = date.split('-').map(Number);
    if (item.repeticao === 'diaria') return true;
    if (item.repeticao === 'semanal') return new Date(p[0], p[1]-1, p[2]).getDay() === new Date(q[0], q[1]-1, q[2]).getDay();
    return false;
  }
};
vm.createContext(context);
const commitmentStart = html.indexOf('AlicerceIA._handleCommitmentQuery=async function(message){');
const commitmentEnd = html.indexOf('AlicerceIA._parseReminderDateTime=function(raw){', commitmentStart);
assert.ok(commitmentStart >= 0 && commitmentEnd > commitmentStart, 'Alicia commitment query handler must exist');
vm.runInContext(html.slice(commitmentStart, commitmentEnd), context, { filename: 'index.html:Alicia-commitment-query' });
vm.runInContext(source, context, { filename: 'index.html:Alicia-reminder-actions' });

let commitmentQuery = null;
context.window.alicerceSupabase = {
  functions: {
    invoke: async function(name, options) {
      commitmentQuery = { name: name, body: options.body };
      return { data: { ok: true, commitments: [
        { id: 'c-rent', tipo: 'compromisso', descricao: 'aluguel', data: '2026-11-05', valor: 1200, status: 'pendente' }
      ] } };
    }
  }
};
const commitmentAnswer = await A._handleCommitmentQuery('Quais meus compromissos?');
assert.match(commitmentAnswer, /aluguel/);
assert.match(commitmentAnswer, /2026-11-05/);
assert.equal(commitmentQuery.name, 'alicia-actions');
assert.equal(commitmentQuery.body.action, 'commitment.list');
assert.equal(Object.prototype.hasOwnProperty.call(commitmentQuery.body, 'user_id'), false);

const parsed = A._parseReminderDateTime('Me lembra de pagar a conta de luz amanhã às 9');
assert.equal(parsed.description, 'pagar a conta de luz');
assert.equal(parsed.date, '2026-11-04');
assert.equal(parsed.time, '09:00');

const explicit = A._parseReminderDateTime('Crie um lembrete comprar leite 12/11 às 18h30 toda semana');
assert.equal(explicit.description, 'comprar leite');
assert.equal(explicit.date, '2026-11-12');
assert.equal(explicit.time, '18:30');
assert.equal(explicit.repetition, 'semanal');

let call = null;
A._invokeReminderAction = async function(payload) {
  call = payload;
  if (payload.action === 'reminder.list') return { reminders: context.Store.commitments.map(function(item) { return Object.assign({}, item); }) };
  const target = context.Store.commitments.find(function(item) { return item.id === payload.reminder_id; });
  if (payload.action === 'reminder.update' && target) Object.assign(target, payload.reminder);
  if (payload.action === 'reminder.complete' && target) target.feitos = (target.feitos || []).concat([payload.occurrence_date]);
  if (payload.action === 'reminder.delete' && target) context.Store.commitments = context.Store.commitments.filter(function(item) { return item.id !== payload.reminder_id; });
  return { reminder: payload.reminder ? { id: payload.reminder_id || 'r-new', descricao: payload.reminder.descricao, data: payload.reminder.data, hora: payload.reminder.hora } : null };
};
const createdReply = await A._handleReminderAction('Me lembra de pagar a conta de luz amanhã às 9');
assert.match(createdReply, /Criei/);
assert.equal(call.action, 'reminder.create');
assert.equal(call.reminder.descricao, 'pagar a conta de luz');
assert.equal(call.reminder.data, '2026-11-04');

A._pendingReminderDraft = null;
call = null;
const promptReply = await A._handleReminderAction('Me lembra de comprar leite');
assert.match(promptReply, /Para qual dia/);
assert.equal(A._pendingReminderDraft.description, 'comprar leite');
const followUpReply = await A._handleReminderAction('amanhã às 8');
assert.match(followUpReply, /Criei/);
assert.equal(call.reminder.data, '2026-11-04');
assert.equal(call.reminder.hora, '08:00');

context.Store.commitments.push({ id: 'r-luz', tipo: 'lembrete', descricao: 'pagar luz', data: '2026-11-04', repeticao: 'nenhuma', feitos: [] });
call = null;
const movedReply = await A._handleReminderAction('Reagende o lembrete de pagar luz para 06/11 às 10');
assert.match(movedReply, /Reagendei/);
assert.equal(call.action, 'reminder.update');
assert.equal(call.reminder_id, 'r-luz');
assert.equal(call.reminder.data, '2026-11-06');
assert.equal(call.reminder.hora, '10:00');

call = null;
const completedReply = await A._handleReminderAction('Marque o lembrete de pagar luz como concluído');
assert.match(completedReply, /concluído/);
assert.equal(call.action, 'reminder.complete');
assert.equal(call.reminder_id, 'r-luz');
assert.equal(call.occurrence_date, '2026-11-06');

A._pendingReminderDelete = null;
call = null;
const deletePrompt = await A._handleReminderAction('Apague o lembrete de pagar luz');
assert.match(deletePrompt, /Responda sim/);
const deleteReply = await A._handleReminderAction('sim');
assert.match(deleteReply, /Excluí/);
assert.equal(call.action, 'reminder.delete');
assert.equal(call.reminder_id, 'r-luz');
assert.equal(call.confirmed, true);



let commitmentSaveCount = 0;
context.Store.save = function() { commitmentSaveCount += 1; };
context.Store.commitments.push({
  id: 'c-dentista',
  tipo: 'compromisso',
  descricao: 'vou no dentista oras me lembra',
  data: '2026-11-05',
  hora: '14:00',
  avisos: [0],
  status: 'pendente'
});
A._messages = [
  { role: 'assistant', text: 'Pronto. Marquei ‘vou no dentista oras me lembra’ para 05 de nov. de 2026 às 14:00. Ele já está no seu calendário.' },
  { role: 'user', text: 'me avisa 30 minutos antes' }
];
const alertReply = await A._handleCommitmentAlertFollowUp('me avisa 30 minutos antes');
assert.match(alertReply, /aviso ficou programado para 30 minutos antes/);
assert.deepEqual(context.Store.commitments[0].avisos, [30]);
assert.equal(context.Store.commitments[0].data, '2026-11-05');
assert.equal(context.Store.commitments[0].hora, '14:00');
assert.equal(commitmentSaveCount, 1);

A._messages = [
  { role: 'assistant', text: 'Pronto. Marquei ‘consulta’ para 05 de nov. de 2026 às 14:00.' },
  { role: 'user', text: 'me avisa 30 minutos antes' }
];
const missingCommitmentReply = await A._handleCommitmentAlertFollowUp('me avisa 30 minutos antes');
assert.match(missingCommitmentReply, /não está carregado na agenda/);
assert.deepEqual(context.Store.commitments[0].avisos, [30]);

console.log('Alicia commitment alert follow-up tests passed.');

