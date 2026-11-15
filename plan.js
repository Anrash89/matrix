(function (root) {
  'use strict';
  const days = typeof module !== 'undefined' ? require('./plan-data.js') : root.MandalaPlanDays;
  const labels = ['Клиенты и продажи', 'Демо и продукт', 'Деньги и развитие', 'Движение', 'Восстановление'];
  const phases = [
    ['1–30', 'Первые 100 000 ₽', 'Демо, оплаченные запуски SellerCtrl и проверка спроса на FLRAD.'],
    ['31–60', 'Повторные оплаты', 'Удержание, партнёрские сделки и проверка одной новой идеи.'],
    ['61–90', 'Рост по фактам', 'Больше работающих продаж, прибыльные пакеты и план до миллиона.'],
  ];
  const firstTarget = 100000;
  const finalTarget = 1000000;
  const products = ['SellerCtrl', 'FLRAD', 'Другой сервис'];
  const dayMs = 86400000;

  function stateOf(matrix) {
    return matrix.cycle ?? { start: '', checks: Array(90).fill(0), payments: [] };
  }

  function offset(date, start) {
    return Math.round((Date.parse(date) - Date.parse(start)) / dayMs);
  }

  function addDays(date, count) {
    return new Date(Date.parse(date) + count * dayMs).toISOString().slice(0, 10);
  }

  function validDate(date) {
    return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) &&
      Number.isFinite(Date.parse(date)) && addDays(date, 0) === date;
  }

  function validate(cycle) {
    if (!cycle || (cycle.start !== '' && !validDate(cycle.start)) ||
        !Array.isArray(cycle.checks) || cycle.checks.length !== days.length ||
        !cycle.checks.every(value => Number.isInteger(value) && value >= 0 && value <= 31) ||
        !Array.isArray(cycle.payments) || cycle.payments.length > 600) {
      throw Error('Некорректное состояние плана на 90 дней.');
    }
    const ids = new Set();
    for (const payment of cycle.payments) {
      if (!cycle.start || !payment || typeof payment.id !== 'string' || payment.id.length > 80 ||
          !payment.id || ids.has(payment.id) || !validDate(payment.date) ||
          payment.date < cycle.start || !products.includes(payment.product) ||
          !Number.isInteger(payment.amount) || payment.amount === 0 || Math.abs(payment.amount) > 100000000 ||
          typeof payment.note !== 'string' || payment.note.length > 100) {
        throw Error('Некорректная запись поступления.');
      }
      ids.add(payment.id);
    }
  }

  function totals(cycle, through) {
    const payments = cycle.payments.filter(payment => payment.date <= through);
    const cutoff = cycle.start ? addDays(cycle.start, 29) : '';
    const byProduct = Object.fromEntries(products.map(product => [product, 0]));
    const byDate = new Map();
    let firstMonth = 0;
    let total = 0;
    let paid = 0;
    let refunded = 0;
    for (const payment of payments) {
      if (payment.date <= cutoff) firstMonth += payment.amount;
      total += payment.amount;
      if (payment.amount > 0) paid += payment.amount;
      else refunded -= payment.amount;
      byProduct[payment.product] += payment.amount;
      byDate.set(payment.date, (byDate.get(payment.date) ?? 0) + payment.amount);
    }
    let balance = 0;
    let reached = '';
    for (const [date, amount] of [...byDate].sort(([a], [b]) => a.localeCompare(b))) {
      balance += amount;
      if (balance >= firstTarget) {
        reached = date;
        break;
      }
    }
    return { firstMonth, total, paid, refunded, cutoff, byProduct, reached };
  }

  function completedCount(mask) {
    return labels.filter((_, slot) => (mask & (1 << slot)) !== 0).length;
  }

  const api = { days, labels, phases, firstTarget, finalTarget, products, stateOf,
    addDays, offset, validDate, validate, totals, completedCount };
  if (typeof module !== 'undefined') module.exports = api;
  else root.MandalaPlan = api;
})(typeof window === 'undefined' ? globalThis : window);
