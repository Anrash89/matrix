(function (root) {
  'use strict';
  const days = typeof module !== 'undefined' ? require('./plan-data.js') : root.MandalaPlanDays;
  const labels = ['Поиск клиентов', 'Демо и продукт', 'Деньги и развитие', 'Движение', 'Восстановление'];
  const products = ['SellerCtrl', 'FLRAD', 'Другой сервис'];
  const sources = ['Telegram', '2ГИС', 'Сайты компаний', 'Kwork', 'Рекомендации', 'Свой канал', 'Другое'];
  const stages = [['contacts', 'Контакты'], ['answers', 'Ответы'], ['demos', 'Демо'], ['offers', 'Предложения']];
  const firstTarget = 100000;
  const finalTarget = 1000000;
  const dayMs = 86400000;
  const reportFields = [['worked', 'Что сработало'], ['blocked', 'Что мешало и почему отказывали'],
    ['ideas', 'Новые сервисы и идеи'], ['capacity', 'Время, нагрузка и пожелания на следующий месяц']];

  const text = (value, n) => typeof value === 'string' && value.length <= n;
  const nonempty = (value, n) => text(value, n) && !!value.trim();
  const count = (value, n) => Number.isInteger(value) && value >= 0 && value <= n;

  function stateOf(matrix) {
    return matrix.month ?? { start: '', checks: Array(30).fill(0), payments: [], activity: [], notes: {}, plan: null };
  }

  function offset(date, start) { return Math.round((Date.parse(date) - Date.parse(start)) / dayMs); }
  function addDays(date, n) { return new Date(Date.parse(date) + n * dayMs).toISOString().slice(0, 10); }
  function validDate(date) {
    return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) &&
      Number.isFinite(Date.parse(date)) && addDays(date, 0) === date;
  }

  function validatePlan(plan) {
    if (!plan || plan.type !== 'mandala-month-plan' || plan.version !== 1 ||
        !nonempty(plan.title, 100) || !count(plan.target, 100000000) || plan.target === 0 ||
        !Array.isArray(plan.days) || plan.days.length !== 30 ||
        !plan.days.every(day => Array.isArray(day) && day.length === 5 && day.every(card =>
          card && nonempty(card.title, 140) && nonempty(card.done, 320) &&
          Array.isArray(card.steps) && card.steps.length >= 1 && card.steps.length <= 6 &&
          card.steps.every(step => nonempty(step, 550)))) ||
        JSON.stringify(plan).length > 100000) {
      throw Error('Нужен план mandala-month-plan версии 1: 30 дней, по 5 карточек с заголовком, шагами и результатом.');
    }
    return plan;
  }

  function validatePayments(items, start, limit, monthly) {
    if (!Array.isArray(items) || items.length > limit) return false;
    const ids = new Set();
    return items.every(payment => {
      if (!start || !payment || !nonempty(payment.id, 80) || ids.has(payment.id) ||
          !validDate(payment.date) || payment.date < start || !products.includes(payment.product) ||
          !Number.isInteger(payment.amount) || payment.amount === 0 || Math.abs(payment.amount) > 100000000 ||
          !text(payment.note, 100) ||
          (monthly && (offset(payment.date, start) > 29 || !sources.includes(payment.source)))) return false;
      ids.add(payment.id);
      return true;
    });
  }

  function validateLegacy(cycle) {
    if (!cycle || (cycle.start !== '' && !validDate(cycle.start)) ||
        !Array.isArray(cycle.checks) || cycle.checks.length !== 90 ||
        !cycle.checks.every(value => count(value, 31)) ||
        !validatePayments(cycle.payments, cycle.start, 600, false)) {
      throw Error('Некорректное состояние предыдущего плана.');
    }
  }

  function validate(month) {
    if (!month || (month.start !== '' && !validDate(month.start)) ||
        !Array.isArray(month.checks) || month.checks.length !== 30 ||
        !month.checks.every(value => count(value, 31)) ||
        !validatePayments(month.payments, month.start, 600, true) ||
        !Array.isArray(month.activity) || month.activity.length > 210 ||
        !month.notes || !reportFields.every(([key]) => text(month.notes[key] ?? '', 900))) {
      throw Error('Некорректное состояние месяца.');
    }
    if (!month.start && month.checks.some(Boolean)) throw Error('Сначала запусти месяц.');
    if (month.plan !== null) validatePlan(month.plan);
    const activityKeys = new Set();
    for (const entry of month.activity) {
      const key = entry?.date + ':' + entry?.source;
      if (!month.start || !entry || !validDate(entry.date) || entry.date < month.start ||
          offset(entry.date, month.start) > 29 || !sources.includes(entry.source) || activityKeys.has(key) ||
          !stages.every(([stage]) => count(entry[stage], 1000))) {
        throw Error('Некорректная запись воронки.');
      }
      activityKeys.add(key);
    }
  }

  function validateHistory(history) {
    if (!Array.isArray(history) || history.length > 36 || !history.every((entry, i) =>
      entry && validDate(entry.start) && validDate(entry.end) && offset(entry.end, entry.start) === 29 &&
      (i === 0 || history[i - 1].end < entry.start) && nonempty(entry.title, 100) &&
      count(entry.target, 100000000) && Number.isSafeInteger(entry.net) && count(entry.done, 150))) {
      throw Error('Некорректный архив месяцев.');
    }
  }

  function completedCount(mask) {
    return labels.filter((_, slot) => (mask & (1 << slot)) !== 0).length;
  }

  function totals(month, through) {
    const payments = month.payments.filter(item => item.date <= through);
    const activity = month.activity.filter(item => item.date <= through);
    const byProduct = Object.fromEntries(products.map(product => [product, 0]));
    const bySource = Object.fromEntries(sources.map(source =>
      [source, { contacts: 0, answers: 0, demos: 0, offers: 0, payments: 0, net: 0 }]));
    const series = Array.from({ length: 30 }, (_, index) => ({
      day: index + 1, date: month.start ? addDays(month.start, index) : '',
      net: 0, balance: 0, done: completedCount(month.checks[index]),
    }));
    let received = 0;
    let refunds = 0;
    for (const item of payments) {
      if (item.amount > 0) {
        received += item.amount;
        bySource[item.source].payments++;
      } else {
        refunds -= item.amount;
      }
      bySource[item.source].net += item.amount;
      byProduct[item.product] += item.amount;
      series[offset(item.date, month.start)].net += item.amount;
    }
    for (const item of activity) {
      for (const [key] of stages) bySource[item.source][key] += item[key];
    }
    let balance = 0;
    for (const day of series) {
      balance += day.net;
      day.balance = balance;
    }
    const funnel = Object.fromEntries([...stages, ['payments', 'Оплаты']].map(([key]) =>
      [key, Object.values(bySource).reduce((sum, source) => sum + source[key], 0)]));
    return {
      net: received - refunds, received, refunds, byProduct, bySource, funnel, series,
      done: series.reduce((sum, day) => sum + day.done, 0),
    };
  }

  function lifetime(matrix, through) {
    const old = (matrix.cycle?.payments ?? []).filter(item => item.date <= through).reduce((sum, item) => sum + item.amount, 0);
    const archive = (matrix.monthHistory ?? []).reduce((sum, month) => sum + month.net, 0);
    return old + archive + totals(stateOf(matrix), through).net;
  }

  function nextStart(matrix) {
    const latestMonth = matrix.month?.start || matrix.monthHistory?.at(-1)?.start;
    const lastLegacyPayment = (matrix.cycle?.payments ?? []).map(item => item.date).sort().at(-1);
    const afterMonth = latestMonth ? addDays(latestMonth, 30) : '';
    const afterLegacy = lastLegacyPayment ? addDays(lastLegacyPayment, 1) : '';
    return afterMonth > afterLegacy ? afterMonth : afterLegacy;
  }

  function buildReport(matrix, asOf, projects) {
    const month = stateOf(matrix);
    const stats = totals(month, asOf);
    const details = reportFields.map(([field, title]) => [title, month.notes[field] ?? '']);
    return {
      type: 'mandala-month-report', version: 1, exportedOn: asOf,
      month: { title: month.plan?.title ?? 'Первые продажи', start: month.start,
        end: month.start ? addDays(month.start, 29) : '', targetRub: month.plan?.target ?? firstTarget },
      financesRub: { received: stats.received, refunds: stats.refunds, net: stats.net,
        lifetimeNet: lifetime(matrix, asOf), byProduct: stats.byProduct,
        averagePayment: stats.funnel.payments ? Math.round(stats.received / stats.funnel.payments) : null },
      funnel: stats.funnel, bySource: stats.bySource,
      days: stats.series.map((day, index) => ({
        ...day,
        tasks: (month.plan?.days ?? days)[index].map((card, slot) =>
          ({ title: card.title, done: !!(month.checks[index] & (1 << slot)) })),
      })),
      loggedActivity: month.activity.filter(item => item.date <= asOf),
      paymentBreakdown: month.payments.filter(item => item.date <= asOf)
        .map(({ date, product, amount, source }) => ({ date, product, amount, source })),
      previousMonths: matrix.monthHistory ?? [], projects, details,
    };
  }

  const api = { days, labels, products, sources, stages, firstTarget, finalTarget, reportFields,
    stateOf, offset, addDays, validDate, validatePlan, validateLegacy, validate, validateHistory,
    completedCount, totals, lifetime, nextStart, buildReport };
  validatePlan({ type: 'mandala-month-plan', version: 1, title: 'Первые продажи', target: firstTarget, days });
  if (typeof module !== 'undefined') module.exports = api;
  else root.MandalaPlan = api;
})(typeof window === 'undefined' ? globalThis : window);
