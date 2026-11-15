const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const C = require('../core.js');
const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../months/month-01.js'), 'utf8'), ctx);
const plan = JSON.parse(JSON.stringify(ctx.window.MANDALA_BUILTIN));
const fresh = () => JSON.parse(JSON.stringify(plan));

test('встроенный план проходит проверку', () => {
  assert.doesNotThrow(() => C.validatePlan(fresh()));
  assert.equal(plan.days.length, 30);
  for (const d of plan.days) for (const t of d.tasks) assert.ok(t.min >= 5 && t.steps.length);
});
test('плохие планы отклоняются', () => {
  const cases = [p => p.days.pop(), p => p.version = 1, p => p.id = 'm2', p => p.days[0].tasks[0].cat = 'x',
    p => p.days[3].tasks[0].id = p.days[0].tasks[0].id, p => p.days[0].tasks[0].min = 0, p => p.target = 0, p => delete p.days[5].focus];
  for (const bad of cases) { const p = fresh(); bad(p); assert.throws(() => C.validatePlan(p)); }
});
test('расчёт месяца: задания, оплаты, воронка', () => {
  const s = C.emptyState(), t0 = plan.days[0].tasks[0], t1 = plan.days[1].tasks[0];
  s.months[plan.id] = { start: '2026-11-16', tasks: { [t0.id]: { done: true, at: '2026-11-16', note: 'ответ' }, [t1.id]: { done: true } }, notes: { worked: 'чаты' } };
  s.payments.push({ id: 'a', date: '2026-11-17', product: plan.products[0].name, source: plan.sources[0], amount: 1499, note: '' },
    { id: 'b', date: '2026-11-20', product: plan.products[1].name, source: plan.sources[1], amount: 4990, note: '' },
    { id: 'c', date: '2026-11-21', product: plan.products[0].name, source: plan.sources[0], amount: -1499, note: '' },
    { id: 'd', date: '2027-01-05', product: plan.products[0].name, source: plan.sources[0], amount: 999, note: '' });
  s.funnel.push({ date: '2026-11-16', source: plan.sources[0], contacts: 10, answers: 3, trials: 1 });
  C.validateState(s);
  const st = C.monthStats(plan, s);
  assert.equal(st.net, 4990); assert.equal(st.received, 6489); assert.equal(st.refunds, 1499);
  assert.equal(st.done, 2); assert.equal(st.end, '2026-12-15');
  assert.equal(st.days[4].balance, 6489); assert.equal(st.days[29].balance, 4990);
  assert.deepEqual(st.funnel, { contacts: 10, answers: 3, trials: 1, payments: 2 });
  assert.equal(st.minDone, t0.min + t1.min);
  const r = C.buildReport(plan, s, [plan], '2026-12-15');
  assert.equal(r.type, 'mandala-month-report'); assert.equal(r.days[0].tasks[0].answer, 'ответ');
  assert.equal(r.payments.length, 3); assert.ok(r.nextPlanFormat.includes('mandala-month-plan'));
  assert.equal(r.notes[C.NOTE_FIELDS[0][1]], 'чаты');
});
test('журнал упражнений', () => {
  const s = C.emptyState(); const d1 = plan.days[0].tasks.find(t => t.ex), d5 = plan.days[4].tasks.find(t => t.ex);
  s.months[plan.id] = { start: '2026-11-16', tasks: { [d1.id]: { sets: [['8', '12']] }, [d5.id]: { sets: [['', ''], ['10', '10']] } }, notes: {} };
  const log = C.exerciseLog([plan], s);
  assert.deepEqual(log['Жим гантелей лёжа на полу'], [{ date: '2026-11-16', kg: 8, reps: 12 }, { date: '2026-11-20', kg: 10, reps: 10 }]);
});
test('плохая резервная копия отклоняется', () => {
  assert.throws(() => C.validateState({ version: 1 }));
  const s = C.emptyState(); s.payments.push({ id: 'x', date: 'bad', product: 'a', source: 'b', amount: 1 });
  assert.throws(() => C.validateState(s));
});
