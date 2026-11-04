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
vm.runInContext(source, context, { filename: 'index.html:Alicia-reminder-actions' });

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
  return { reminder: payload.reminder ? { id: 'r-new', descricao: payload.reminder.descricao, data: payload.reminder.data, hora: payload.reminder.hora } : null };
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

console.log('Alicia reminder parsing and action-routing tests passed.');
