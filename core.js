/* Логика без интерфейса: проверка планов, расчёты, отчёт. Работает и в браузере, и в Node (для тестов). */
(function (root) {
  'use strict';
  const DAY = 86400000;
  const CATS = {
    sales: ['Продажи', '#e8618c'], content: ['Ролики и тексты', '#f08a4b'], product: ['Сервис', '#6c63e6'],
    radar: ['Радар', '#2f9bd6'], ai: ['Нейронки', '#9a5fd8'], sport: ['Спорт', '#23a884'],
    english: ['Английский', '#d9a21b'], review: ['Итоги', '#6b7391'],
  };
  const STAGES = [['contacts', 'Касания'], ['answers', 'Ответы'], ['trials', 'Пробные поставки']];
  const NOTE_FIELDS = [['worked', 'Что сработало и принесло оплаты'], ['blocked', 'Что мешало, почему отказывали'],
    ['ideas', 'Идеи: сервисы, функции, каналы'], ['capacity', 'Сколько времени в день реально было. Пожелания на следующий месяц']];

  const str = (v, n) => typeof v === 'string' && v.length <= n;
  const full = (v, n) => str(v, n) && v.trim() !== '';
  const addDays = (date, n) => new Date(Date.parse(date + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);
  const offset = (date, start) => Math.round((Date.parse(date + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z')) / DAY);
  const validDate = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d + 'T00:00:00Z')) && addDays(d, 0) === d;

  function validatePlan(p) {
    const fail = why => { throw Error('Файл плана не подходит: ' + why); };
    if (!p || p.type !== 'mandala-month-plan') fail('это не план «Мандалы» (нет type = mandala-month-plan).');
    if (p.version !== 2) fail('нужна версия 2.');
    if (!/^month-\d{2}$/.test(p.id || '')) fail('id должен быть вида month-02.');
    if (!Number.isInteger(p.number) || p.number !== Number(p.id.slice(6)) || p.number < 1) fail('number должен совпадать с номером в id.');
    if (!full(p.title, 120)) fail('нет названия.');
    if (!Number.isInteger(p.target) || p.target <= 0) fail('target — цель в рублях, целое число.');
    if (!str(p.context ?? '', 3000)) fail('context слишком длинный.');
    if (!Array.isArray(p.products) || !p.products.length || p.products.length > 12 ||
        !p.products.every(x => x && full(x.name, 60) && Number.isInteger(x.price) && x.price >= 0)) fail('products — список {name, price}.');
    if (!Array.isArray(p.sources) || !p.sources.length || p.sources.length > 16 || !p.sources.every(s => full(s, 40))) fail('sources — список названий каналов.');
    if (p.sportGuide !== undefined && (!Array.isArray(p.sportGuide) || !p.sportGuide.every(s => full(s, 500)))) fail('sportGuide — список строк.');
    if (!Array.isArray(p.days) || p.days.length !== 30) fail('нужно ровно 30 дней.');
    const ids = new Set();
    p.days.forEach((d, i) => {
      const where = 'день ' + (i + 1) + ': ';
      if (!d || !full(d.focus, 120)) fail(where + 'нет темы дня (focus).');
      if (!Array.isArray(d.tasks) || d.tasks.length < 1 || d.tasks.length > 12) fail(where + 'от 1 до 12 заданий.');
      d.tasks.forEach(t => {
        if (!t || !full(t.id, 40) || ids.has(t.id)) fail(where + 'у задания нет уникального id.');
        ids.add(t.id);
        if (!CATS[t.cat]) fail(where + 'неизвестная категория «' + t.cat + '».');
        if (!full(t.title, 160)) fail(where + 'нет названия задания.');
        if (!Number.isInteger(t.min) || t.min < 5 || t.min > 240) fail(where + 'min — минуты от 5 до 240.');
        if (!Array.isArray(t.steps) || !t.steps.length || t.steps.length > 8 || !t.steps.every(s => full(s, 700))) fail(where + 'steps — от 1 до 8 шагов.');
        if (!full(t.done, 400)) fail(where + 'нет критерия готовности (done).');
        if (t.input !== undefined && !full(t.input, 160)) fail(where + 'input — подпись поля ответа.');
        if (t.prompt !== undefined && !full(t.prompt, 2500)) fail(where + 'prompt — текст запроса.');
        if (t.ex !== undefined && (!Array.isArray(t.ex) || !t.ex.length || t.ex.length > 12 ||
            !t.ex.every(e => e && full(e.name, 80) && full(e.sets, 60) && str(e.hint ?? '', 120)))) fail(where + 'ex — список упражнений {name, sets, hint}.');
      });
    });
    return p;
  }

  function emptyState() {
    return { version: 2, months: {}, payments: [], funnel: [], body: {}, plans: [] };
  }
  const monthState = (state, id) => state.months[id] ?? { start: '', tasks: {}, notes: {} };

  function validateState(s) {
    const bad = () => { throw Error('Это не резервная копия «Мандалы» версии 2.'); };
    if (!s || s.version !== 2 || typeof s.months !== 'object' || !Array.isArray(s.payments) ||
        !Array.isArray(s.funnel) || typeof s.body !== 'object' || !Array.isArray(s.plans)) bad();
    for (const m of Object.values(s.months)) {
      if (!m || (m.start !== '' && !validDate(m.start)) || typeof m.tasks !== 'object' || typeof m.notes !== 'object') bad();
    }
    if (!s.payments.every(p => p && full(p.id, 60) && validDate(p.date) && full(p.product, 60) && full(p.source, 40) &&
        Number.isInteger(p.amount) && p.amount !== 0 && str(p.note ?? '', 200))) bad();
    if (!s.funnel.every(f => f && validDate(f.date) && full(f.source, 40) &&
        STAGES.every(([k]) => Number.isInteger(f[k]) && f[k] >= 0 && f[k] <= 10000))) bad();
    s.plans.forEach(validatePlan);
    return s;
  }

  /* Все цифры одного месяца. through — дата, по которую считаем (включительно). */
  function monthStats(plan, state) {
    const m = monthState(state, plan.id);
    const start = m.start;
    const end = start ? addDays(start, 29) : '';
    const inMonth = d => start && d >= start && d <= end;
    const byCat = Object.fromEntries(Object.keys(CATS).map(c => [c, { done: 0, total: 0, min: 0, minDone: 0 }]));
    const days = plan.days.map((d, i) => {
      let done = 0, min = 0, minDone = 0;
      for (const t of d.tasks) {
        const ok = !!m.tasks[t.id]?.done;
        byCat[t.cat].total++; byCat[t.cat].min += t.min; min += t.min;
        if (ok) { byCat[t.cat].done++; byCat[t.cat].minDone += t.min; done++; minDone += t.min; }
      }
      return { day: i + 1, date: start ? addDays(start, i) : '', total: d.tasks.length, done, min, minDone, net: 0, balance: 0 };
    });
    const bySource = Object.fromEntries(plan.sources.map(s => [s, { contacts: 0, answers: 0, trials: 0, payments: 0, net: 0 }]));
    const byProduct = Object.fromEntries(plan.products.map(p => [p.name, { payments: 0, net: 0 }]));
    const slot = (map, key, blank) => map[key] ?? (map[key] = blank);
    let received = 0, refunds = 0, payments = 0;
    for (const p of state.payments) {
      if (!inMonth(p.date)) continue;
      const src = slot(bySource, p.source, { contacts: 0, answers: 0, trials: 0, payments: 0, net: 0 });
      const prod = slot(byProduct, p.product, { payments: 0, net: 0 });
      if (p.amount > 0) { received += p.amount; payments++; src.payments++; prod.payments++; } else refunds -= p.amount;
      src.net += p.amount; prod.net += p.amount;
      days[offset(p.date, start)].net += p.amount;
    }
    const funnel = { contacts: 0, answers: 0, trials: 0, payments };
    for (const f of state.funnel) {
      if (!inMonth(f.date)) continue;
      const src = slot(bySource, f.source, { contacts: 0, answers: 0, trials: 0, payments: 0, net: 0 });
      for (const [k] of STAGES) { src[k] += f[k]; funnel[k] += f[k]; }
    }
    let balance = 0;
    for (const d of days) { balance += d.net; d.balance = balance; }
    const sum = k => days.reduce((a, d) => a + d[k], 0);
    return { id: plan.id, number: plan.number, title: plan.title, target: plan.target, start, end,
      net: received - refunds, received, refunds, funnel, bySource, byProduct, byCat, days,
      done: sum('done'), total: sum('total'), min: sum('min'), minDone: sum('minDone') };
  }

  /* Записи тренировок: по каждому упражнению — список {date, kg, reps}. */
  function exerciseLog(plans, state) {
    const log = {};
    for (const plan of plans) {
      const m = monthState(state, plan.id);
      plan.days.forEach((d, i) => d.tasks.forEach(t => {
        const sets = m.tasks[t.id]?.sets;
        if (!t.ex || !sets) return;
        t.ex.forEach((e, k) => {
          const kg = Number(sets[k]?.[0]), reps = Number(sets[k]?.[1]);
          if (!(kg > 0) && !(reps > 0)) return;
          (log[e.name] ??= []).push({ date: m.start ? addDays(m.start, i) : '', kg: kg || 0, reps: reps || 0 });
        });
      }));
    }
    for (const list of Object.values(log)) list.sort((a, b) => a.date < b.date ? -1 : 1);
    return log;
  }

  const NEXT_PLAN_FORMAT = [
    'Следующий месяц — один JSON-файл с именем month-NN.json (NN — номер месяца, например month-02.json).',
    'Корень: {"type":"mandala-month-plan","version":2,"id":"month-NN","number":N,"title":"…","target":целые рубли,',
    '"context":"общий контекст, который сайт подставляет перед каждым запросом для Claude",',
    '"products":[{"name":"…","price":целые рубли}], "sources":["канал продаж", …], "sportGuide":["правило", …],',
    '"days":[ровно 30 объектов {"focus":"тема дня","tasks":[…]}]}.',
    'В дне от 1 до 12 заданий. Задание: {"id":"mNN-dDD-tK" (уникальный), "cat": одна из sales, content, product, radar, ai, sport, english, review,',
    '"title":"…", "min": минуты 5–240, "steps":["шаг", … до 8], "done":"как понять, что готово",',
    'необязательно: "input":"подпись поля, куда пользователь пишет ответ", "prompt":"запрос, который он скопирует в чат Claude",',
    '"ex":[{"name":"упражнение","sets":"4 × 10–12","hint":"подсказка по весу"}] — только для тренировок; сайт сам покажет поля «кг» и «повторы»}.',
    'Названия упражнений держи теми же, что в отчёте, чтобы прогресс по ним продолжался. Названия products и sources по возможности сохраняй.',
    'Опирайся на отчёт: answer — ответы пользователя, sets — веса и повторы, body — вес тела и самочувствие, notes — его выводы и пожелания по времени.',
  ].join(' ');

  function buildReport(plan, state, plans, today) {
    const m = monthState(state, plan.id);
    const st = monthStats(plan, state);
    const inMonth = d => st.start && d >= st.start && d <= st.end;
    const pct = (a, b) => b ? Math.round(a / b * 100) : null;
    return {
      type: 'mandala-month-report', version: 2, exportedOn: today,
      plan: { id: plan.id, number: plan.number, title: plan.title, targetRub: plan.target, start: st.start, end: st.end,
        products: plan.products, sources: plan.sources },
      summary: { netRub: st.net, receivedRub: st.received, refundsRub: st.refunds, targetReachedPercent: pct(st.net, plan.target),
        tasksDone: st.done, tasksTotal: st.total, minutesPlanned: st.min, minutesOfDoneTasks: st.minDone,
        byCategory: Object.fromEntries(Object.entries(st.byCat).filter(([, v]) => v.total).map(([k, v]) => [CATS[k][0], v])),
        funnel: st.funnel, bySource: st.bySource, byProduct: st.byProduct },
      notes: Object.fromEntries(NOTE_FIELDS.map(([k, label]) => [label, m.notes[k] ?? ''])),
      days: plan.days.map((d, i) => {
        const date = st.start ? addDays(st.start, i) : '';
        return { day: i + 1, date, focus: d.focus, body: state.body[date] ?? null,
          tasks: d.tasks.map(t => {
            const r = m.tasks[t.id] ?? {};
            const row = { id: t.id, category: CATS[t.cat][0], title: t.title, minutes: t.min, done: !!r.done };
            if (r.done && r.at) row.doneOn = r.at;
            if (t.input) row.answer = r.note ?? '';
            if (t.ex) row.sets = t.ex.map((e, k) => ({ name: e.name, plan: e.sets, kg: Number(r.sets?.[k]?.[0]) || null, reps: Number(r.sets?.[k]?.[1]) || null }));
            return row;
          }) };
      }),
      payments: state.payments.filter(p => inMonth(p.date)).map(({ date, product, amount, source, note }) => ({ date, product, amountRub: amount, source, note: note ?? '' })),
      funnelLog: state.funnel.filter(f => inMonth(f.date)),
      previousMonths: plans.filter(p => p.number < plan.number).map(p => {
        const s = monthStats(p, state);
        return { id: p.id, title: p.title, start: s.start, end: s.end, targetRub: p.target, netRub: s.net, tasksDone: s.done, tasksTotal: s.total, funnel: s.funnel };
      }),
      nextPlanFormat: NEXT_PLAN_FORMAT,
    };
  }

  const api = { CATS, STAGES, NOTE_FIELDS, NEXT_PLAN_FORMAT, addDays, offset, validDate, validatePlan, validateState,
    emptyState, monthState, monthStats, exerciseLog, buildReport };
  if (typeof module !== 'undefined') module.exports = api; else root.MandalaCore = api;
})(typeof window === 'undefined' ? globalThis : window);
