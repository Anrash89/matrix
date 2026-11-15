(function () {
  'use strict';
  const C = window.MandalaCore;
  const KEY = 'mandala.v2';
  const $ = (s, el = document) => el.querySelector(s);
  const e = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const VIEWS = ['today', 'month', 'sales', 'sport', 'stats', 'data'];
  const MOODS = ['плохо', 'так себе', 'нормально', 'хорошо', 'отлично'];

  /* ---------- Состояние ---------- */
  let state = C.emptyState();
  let storageError = '';
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = C.validateState(JSON.parse(raw));
  } catch (err) { storageError = 'Сохранённые данные не прочитались: ' + err.message; }

  let plans = [];
  const ui = { view: 'today', planId: '', day: 0, open: new Set(), picked: false, just: '' };

  function rebuildPlans(remote = []) {
    const map = new Map();
    for (const p of [window.MANDALA_BUILTIN, ...state.plans, ...remote]) {
      try { map.set(C.validatePlan(p).id, p); } catch (err) { console.warn(err.message); }
    }
    plans = [...map.values()].sort((a, b) => a.number - b.number);
  }
  rebuildPlans();

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); storageError = ''; return true; }
    catch { storageError = 'Не удалось сохранить в браузере. Скачай резервную копию в разделе «Данные».'; toast(storageError); return false; }
  }
  let saveTimer;
  const saveSoon = () => { clearTimeout(saveTimer); saveTimer = setTimeout(save, 400); };

  /* ---------- Даты и формат ---------- */
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const dateLong = s => new Date(s + 'T12:00:00').toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
  const dateShort = s => new Date(s + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', '');
  const money = n => Math.round(n).toLocaleString('ru-RU') + ' ₽';
  const mins = m => m < 60 ? m + ' мин' : Math.floor(m / 60) + ' ч' + (m % 60 ? ' ' + (m % 60) + ' мин' : '');
  const plural = (n, a, b, c) => { const x = Math.abs(n) % 100, y = x % 10; return n + ' ' + (x > 10 && x < 20 ? c : y === 1 ? a : y >= 2 && y <= 4 ? b : c); };
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

  /* ---------- Месяцы ---------- */
  const plan = () => plans.find(p => p.id === ui.planId) ?? plans[0];
  const mstate = (id = plan().id) => state.months[id] ?? (state.months[id] = { start: '', tasks: {}, notes: {} });
  const started = p => !!state.months[p.id]?.start;
  function pickPlan() {
    const t = today();
    const run = plans.filter(started);
    const live = run.filter(p => t <= C.addDays(state.months[p.id].start, 29)).at(-1);
    const next = plans.find(p => !started(p) && (!run.length || p.number > run.at(-1).number));
    return (live ?? next ?? run.at(-1) ?? plans[0]).id;
  }
  function todayIndex(p = plan()) {
    const start = state.months[p.id]?.start;
    return start ? Math.max(0, Math.min(29, C.offset(today(), start))) : 0;
  }
  function suggestedStart(p) {
    const prev = plans.filter(x => x.number < p.number && started(x)).at(-1);
    const after = prev ? C.addDays(state.months[prev.id].start, 30) : '';
    return after > today() ? after : today();
  }
  function startMonth(p, date) {
    if (!C.validDate(date)) { toast('Выбери дату начала.'); return false; }
    const clash = plans.find(x => x.id !== p.id && started(x) && Math.abs(C.offset(date, state.months[x.id].start)) < 30);
    if (clash) { toast('Эта дата попадает в месяц ' + clash.number + '. Выбери дату после ' + dateShort(C.addDays(state.months[clash.id].start, 29)) + '.'); return false; }
    mstate(p.id).start = date; save(); return true;
  }
  ui.planId = pickPlan(); ui.day = todayIndex();

  /* ---------- Мелкие части интерфейса ---------- */
  let toastTimer;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3200); }
  const chip = cat => `<span class="chip" style="--c:${C.CATS[cat][1]}">${e(C.CATS[cat][0])}</span>`;
  const bar = (value, max, color = 'var(--accent)') => `<div class="bar"><i style="width:${max ? Math.min(100, Math.max(0, value / max * 100)) : 0}%;background:${color}"></i></div>`;
  const empty = text => `<p class="empty">${text}</p>`;
  function monthTabs() {
    if (plans.length < 2) return '';
    return '<div class="tabs" role="tablist">' + plans.map(p =>
      `<button role="tab" aria-selected="${p.id === plan().id}" data-act="pick-plan" data-id="${p.id}">Месяц ${p.number}${started(p) ? '' : ' · не начат'}</button>`).join('') + '</div>';
  }
  function head(title, sub, extra = '') {
    return `<header class="page-head"><div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div>${extra}</header>`;
  }

  /* Цветок дня: один лепесток на задание, закрашивается при завершении. */
  function mandala(tasks, records, size = 230) {
    const n = tasks.length, r = size / 2;
    const len = r * 0.36, wid = Math.min(r * 0.21, (2 * Math.PI * r * 0.55) / n * 0.46);
    const petals = tasks.map((t, i) => {
      const done = !!records[t.id]?.done;
      return `<ellipse class="petal${done ? ' on' : ''}${ui.just === t.id ? ' just' : ''}" cx="${r}" cy="${r - r * 0.56}" rx="${wid}" ry="${len}" transform="rotate(${i * 360 / n} ${r} ${r})" style="--c:${C.CATS[t.cat][1]}"><title>${e(t.title)}</title></ellipse>`;
    }).join('');
    const done = tasks.filter(t => records[t.id]?.done).length;
    return `<svg class="mandala${done === n ? ' full' : ''}" viewBox="0 0 ${size} ${size}" role="img" aria-label="Выполнено ${done} из ${n}">
      <circle class="halo" cx="${r}" cy="${r}" r="${r * 0.95}"/>${petals}
      <circle class="core" cx="${r}" cy="${r}" r="${r * 0.2}"/>
      <text x="${r}" y="${r + 2}" text-anchor="middle" dominant-baseline="middle" class="core-num">${done}/${n}</text></svg>`;
  }

  /* ---------- Графики ---------- */
  function lineChart(points, { target = 0, color = '#6c63e6', unit = '', labels = [], height = 200, zero = true } = {}) {
    const pts = points.filter(p => p[1] !== null && p[1] !== undefined);
    if (pts.length < 1) return '';
    const W = 820, H = height, L = 84, R = 16, T = 22, B = 28;
    const xs = points.map(p => p[0]), x0 = Math.min(...xs), x1 = Math.max(...xs, x0 + 1);
    const ys = pts.map(p => p[1]);
    let y1 = Math.max(...ys, target), y0 = zero ? Math.min(0, ...ys) : Math.min(...ys);
    if (y1 === y0) { y1 += 1; y0 -= zero ? 0 : 1; }
    if (!zero) { const pad = (y1 - y0) * 0.15; y0 -= pad; y1 += pad; }
    const X = x => L + (x - x0) / (x1 - x0) * (W - L - R), Y = y => T + (1 - (y - y0) / (y1 - y0)) * (H - T - B);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1)).join(' ');
    const area = d + ` L${X(pts.at(-1)[0]).toFixed(1)} ${Y(y0)} L${X(pts[0][0]).toFixed(1)} ${Y(y0)} Z`;
    const fmt = v => (Math.abs(v) >= 1000 ? Math.round(v / 1000) + ' тыс' : Math.round(v * 10) / 10) + unit;
    const grid = [0, 0.5, 1].map(k => { const v = y0 + (y1 - y0) * k; return `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" class="grid"/><text x="${L - 8}" y="${Y(v) + 4}" text-anchor="end" class="axis">${fmt(v)}</text>`; }).join('');
    const tl = target ? `<line x1="${X(x0)}" y1="${Y(0)}" x2="${X(x1)}" y2="${Y(target)}" class="pace"/><text x="${W - R}" y="${Y(target) - 6}" text-anchor="end" class="axis">цель ${fmt(target)}</text>` : '';
    const xl = labels.map(([x, text]) => `<text x="${X(x)}" y="${H - 6}" text-anchor="middle" class="axis">${e(text)}</text>`).join('');
    const dots = pts.length <= 31 ? pts.map(p => `<circle cx="${X(p[0])}" cy="${Y(p[1])}" r="3" fill="${color}"><title>${e(p[2] ?? p[1])}</title></circle>`).join('') : '';
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">${grid}${tl}<path d="${area}" fill="${color}" opacity=".13"/><path d="${d}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>${dots}${xl}</svg>`;
  }
  function dayBars(days, ti) {
    const W = 640, H = 150, L = 8, B = 22, bw = (W - L * 2) / 30;
    const max = Math.max(...days.map(d => d.total));
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">` + days.map((d, i) => {
      const x = L + i * bw + 3, full = (H - B - 8) * d.total / max, part = d.total ? full * d.done / d.total : 0;
      return `<rect x="${x}" y="${H - B - full}" width="${bw - 6}" height="${full}" rx="4" class="bar-bg"/><rect x="${x}" y="${H - B - part}" width="${bw - 6}" height="${part}" rx="4" class="bar-fg${i === ti ? ' now' : ''}"><title>День ${d.day}: ${d.done} из ${d.total}</title></rect>` +
        ((i + 1) % 5 === 0 || i === 0 ? `<text x="${x + (bw - 6) / 2}" y="${H - 6}" text-anchor="middle" class="axis">${d.day}</text>` : '');
    }).join('') + '</svg>';
  }

  /* ---------- Сегодня ---------- */
  function startCard(p) {
    const date = suggestedStart(p);
    return `<section class="glass start">
      <div><h2>${p.number === 1 ? 'Начни месяц' : 'Месяц ' + p.number + ' готов'}</h2>
      <p>«${e(p.title)}». 30 дней, цель ${money(p.target)}. Первый день — дата, которую выберешь. Задания можно завершать сразу.</p></div>
      <form data-form="start" class="row"><input type="date" name="date" value="${date}" aria-label="Дата первого дня"><button class="btn primary">Начать</button></form>
    </section>`;
  }
  function taskCard(t, rec, dayDate, log) {
    const done = !!rec.done, open = !done || ui.open.has(t.id);
    const ex = t.ex ? `<div class="sets"><div class="sets-head"><span>Упражнение</span><span>кг</span><span>повторы</span></div>` + t.ex.map((x, k) => {
      const prev = dayDate ? (log[x.name] ?? []).filter(r => r.date < dayDate).at(-1) : null;
      return `<div class="set"><div><b>${e(x.name)}</b><small>${e(x.sets)}${x.hint ? ' · ' + e(x.hint) : ''}${prev ? ` · в прошлый раз ${prev.kg ? prev.kg + ' кг × ' : ''}${prev.reps}` : ''}</small></div>
        <input type="number" inputmode="decimal" min="0" max="200" step="0.5" aria-label="${e(x.name)}, кг" data-set="${t.id}" data-k="${k}" data-j="0" value="${e(rec.sets?.[k]?.[0] ?? '')}">
        <input type="number" inputmode="numeric" min="0" max="999" step="1" aria-label="${e(x.name)}, повторы" data-set="${t.id}" data-k="${k}" data-j="1" value="${e(rec.sets?.[k]?.[1] ?? '')}"></div>`;
    }).join('') + '</div>' : '';
    const input = t.input ? `<label class="answer"><span>${e(t.input)}</span><textarea data-note="${t.id}" rows="3" maxlength="4000" placeholder="Пиши здесь — попадёт в отчёт месяца">${e(rec.note ?? '')}</textarea></label>` : '';
    return `<article class="task glass${done ? ' done' : ''}${ui.just === t.id ? ' just' : ''}" id="t-${t.id}" style="--c:${C.CATS[t.cat][1]}">
      <button class="check" data-act="toggle" data-id="${t.id}" aria-pressed="${done}" aria-label="${done ? 'Вернуть в работу' : 'Завершить задание'}"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></button>
      <div class="task-main">
        <div class="task-top">${chip(t.cat)}<span class="time">${mins(t.min)}</span>${done && rec.at ? `<span class="time">готово ${dateShort(rec.at)}</span>` : ''}</div>
        <h3><button class="title" data-act="open" data-id="${t.id}" aria-expanded="${open}">${e(t.title)}</button></h3>
        ${open ? `<div class="task-body">
          <ol>${t.steps.map(s => `<li>${e(s)}</li>`).join('')}</ol>
          <p class="ready"><b>Готово, когда</b> ${e(t.done.charAt(0).toLowerCase() + t.done.slice(1))}</p>
          ${ex}${input}
          <div class="row actions">
            <button class="btn ${done ? '' : 'primary'}" data-act="toggle" data-id="${t.id}">${done ? 'Вернуть в работу' : 'Завершить задание'}</button>
            <button class="btn" data-act="copy" data-id="${t.id}">Скопировать запрос для Claude</button>
          </div></div>` : ''}
      </div></article>`;
  }
  function bodyCard(date) {
    const b = state.body[date] ?? {};
    return `<section class="glass body-card"><h2>Состояние дня</h2>
      <div class="body-grid">
        <label><span>Вес утром, кг</span><input type="number" inputmode="decimal" step="0.1" min="30" max="250" data-body="weight" data-date="${date}" value="${e(b.weight ?? '')}"></label>
        <label><span>Сон, часов</span><input type="number" inputmode="decimal" step="0.5" min="0" max="24" data-body="sleep" data-date="${date}" value="${e(b.sleep ?? '')}"></label>
        <div><span>Самочувствие</span><div class="mood" role="radiogroup" aria-label="Самочувствие">${MOODS.map((m, i) =>
          `<button role="radio" aria-checked="${b.mood === i + 1}" data-act="mood" data-date="${date}" data-v="${i + 1}">${m}</button>`).join('')}</div></div>
      </div></section>`;
  }
  function viewToday() {
    const p = plan(), m = mstate(p.id), day = p.days[ui.day], ti = todayIndex(p);
    const date = m.start ? C.addDays(m.start, ui.day) : '';
    const total = day.tasks.reduce((s, t) => s + t.min, 0);
    const doneCount = day.tasks.filter(t => m.tasks[t.id]?.done).length;
    const left = day.tasks.filter(t => !m.tasks[t.id]?.done).reduce((s, t) => s + t.min, 0);
    const log = C.exerciseLog(plans, state);
    const isToday = m.start && date === today();
    return (m.start ? '' : startCard(p)) + `
    <section class="hero glass">
      <div class="hero-text">
        <p class="when">${date ? cap(dateLong(date)) : 'Месяц ещё не начат'}${isToday ? ' · сегодня' : ''}</p>
        <h1>День ${ui.day + 1} <span>из 30</span></h1>
        <p class="focus">${e(day.focus)}</p>
        <p class="meta">${doneCount === day.tasks.length ? 'Все задания дня завершены' : plural(day.tasks.length, 'задание', 'задания', 'заданий') + ' на ' + mins(total) + (doneCount ? ', осталось ' + mins(left) : '')}</p>
        <div class="row daynav">
          <button class="btn round" data-act="day" data-d="-1" ${ui.day === 0 ? 'disabled' : ''} aria-label="Предыдущий день">‹</button>
          <button class="btn round" data-act="day" data-d="1" ${ui.day === 29 ? 'disabled' : ''} aria-label="Следующий день">›</button>
          ${m.start && ui.day !== ti ? '<button class="btn" data-act="day-today">К сегодняшнему дню</button>' : ''}
        </div>
      </div>
      <div class="hero-flower">${mandala(day.tasks, m.tasks)}</div>
    </section>
    <section class="tasks">${day.tasks.map(t => taskCard(t, m.tasks[t.id] ?? {}, date, log)).join('')}</section>
    ${date ? bodyCard(date) : ''}`;
  }

  /* ---------- Месяц ---------- */
  function viewMonth() {
    const p = plan(), st = C.monthStats(p, state), ti = started(p) ? todayIndex(p) : -1;
    const inRange = started(p) && today() >= st.start && today() <= st.end;
    return head(`Месяц ${p.number}`, `${e(p.title)}. ${st.start ? dateShort(st.start) + ' — ' + dateShort(st.end) : 'Ещё не начат'}`, monthTabs()) + `
    <section class="kpis">
      <div class="glass kpi"><span>Оплаты</span><b>${money(st.net)}</b><small>из ${money(p.target)}</small>${bar(st.net, p.target)}</div>
      <div class="glass kpi"><span>Задания</span><b>${st.done} <i>из ${st.total}</i></b><small>${st.total ? Math.round(st.done / st.total * 100) : 0}% месяца</small>${bar(st.done, st.total, '#23a884')}</div>
      <div class="glass kpi"><span>Время</span><b>${mins(st.minDone)}</b><small>из ${mins(st.min)} по плану</small>${bar(st.minDone, st.min, '#f08a4b')}</div>
    </section>
    <section class="calendar">${p.days.map((d, i) => {
      const s = st.days[i];
      return `<button class="glass cell${inRange && i === ti ? ' now' : ''}${s.done === s.total ? ' complete' : ''}" data-act="go-day" data-i="${i}">
        <span class="cell-top"><b>${i + 1}</b><small>${s.date ? dateShort(s.date) : ''}</small></span>
        <span class="cell-focus">${e(d.focus)}</span>
        <span class="cell-foot"><span class="dots">${d.tasks.map(t => `<i class="${mstate(p.id).tasks[t.id]?.done ? 'on' : ''}" style="--c:${C.CATS[t.cat][1]}"></i>`).join('')}</span><small>${mins(s.min)}</small></span>
      </button>`;
    }).join('')}</section>`;
  }

  /* ---------- Продажи ---------- */
  function viewSales() {
    const p = plan(), st = C.monthStats(p, state), m = mstate(p.id);
    const left = Math.max(0, p.target - st.net);
    const need = p.products.filter(x => x.price > 0).map(x => `${Math.ceil(left / x.price)} × «${e(x.name)}» по ${money(x.price)}`).join(' или ');
    const inMonth = d => st.start && d >= st.start && d <= st.end;
    const def = inMonth(today()) || !st.start ? today() : st.end;
    const pays = state.payments.filter(x => inMonth(x.date)).sort((a, b) => a.date < b.date ? 1 : -1);
    const fun = state.funnel.filter(x => inMonth(x.date)).sort((a, b) => a.date < b.date ? 1 : -1);
    const f = st.funnel, rate = (a, b) => b ? Math.round(a / b * 100) + '%' : '—';
    const opt = (list, sel) => list.map(x => `<option${x === sel ? ' selected' : ''}>${e(x)}</option>`).join('');
    return head('Продажи', `Месяц ${p.number}. Записывай каждую оплату и цифры дня — из них строится аналитика.`, monthTabs()) + `
    <section class="glass goal">
      <div class="goal-num"><b>${money(st.net)}</b><span>из ${money(p.target)}</span></div>
      ${bar(st.net, p.target)}
      <p>${left ? 'До цели ' + money(left) + (need ? ': это ' + need + '.' : '.') : 'Цель месяца взята.'}${st.refunds ? ' Возвраты: ' + money(st.refunds) + '.' : ''}</p>
    </section>
    ${st.start ? '' : '<section class="glass note">Месяц ещё не начат. Начни его на странице «Сегодня», и оплаты будут считаться в этот месяц.</section>'}
    <div class="two">
      <section class="glass"><h2>Новая оплата</h2>
        <form data-form="pay" class="form">
          <label><span>Дата</span><input type="date" name="date" value="${def}" required></label>
          <label><span>Что купили</span><select name="product" data-price>${p.products.map(x => `<option data-p="${x.price}">${e(x.name)}</option>`).join('')}</select></label>
          <label><span>Сумма, ₽</span><input type="number" name="amount" inputmode="numeric" min="1" step="1" value="${p.products[0].price || ''}" required></label>
          <label><span>Откуда клиент</span><select name="source">${opt(p.sources)}</select></label>
          <label class="wide"><span>Заметка</span><input name="note" maxlength="200" placeholder="Имя клиента, срок, условия"></label>
          <label class="tick"><input type="checkbox" name="refund"><span>Это возврат</span></label>
          <button class="btn primary">Записать оплату</button>
        </form></section>
      <section class="glass"><h2>Цифры дня</h2>
        <form data-form="funnel" class="form">
          <label><span>Дата</span><input type="date" name="date" value="${def}" required></label>
          <label><span>Канал</span><select name="source">${opt(p.sources)}</select></label>
          ${C.STAGES.map(([k, label]) => `<label><span>${label}</span><input type="number" name="${k}" inputmode="numeric" min="0" max="10000" step="1" value="0" required></label>`).join('')}
          <button class="btn primary">Сохранить цифры дня</button>
        </form>
        <p class="hint">Повторная запись на ту же дату и канал заменяет прежнюю.</p></section>
    </div>
    <section class="glass"><h2>Воронка месяца</h2>
      <div class="funnel">${[['Касания', f.contacts, ''], ['Ответы', f.answers, rate(f.answers, f.contacts)], ['Пробные поставки', f.trials, rate(f.trials, f.answers)], ['Оплаты', f.payments, rate(f.payments, f.trials)]].map(([label, v, r], i) =>
        `<div class="stage"><span>${label}</span><b>${v}</b>${bar(v, Math.max(f.contacts, f.answers, f.trials, f.payments, 1), ['#e8618c', '#f08a4b', '#6c63e6', '#23a884'][i])}<small>${r ? r + ' от прошлого шага' : 'первый шаг'}</small></div>`).join('')}</div>
    </section>
    <div class="two">
      <section class="glass"><h2>Оплаты</h2>${pays.length ? '<ul class="list">' + pays.map(x =>
        `<li><div><b class="${x.amount < 0 ? 'neg' : ''}">${money(x.amount)}</b> <span>${e(x.product)}</span><small>${dateShort(x.date)} · ${e(x.source)}${x.note ? ' · ' + e(x.note) : ''}</small></div><button class="x" data-act="del-pay" data-id="${e(x.id)}" aria-label="Удалить оплату">×</button></li>`).join('') + '</ul>'
        : empty('Оплат пока нет. Первая появится здесь, как только запишешь её в форме выше.')}</section>
      <section class="glass"><h2>Записи по дням</h2>${fun.length ? '<ul class="list">' + fun.map(x =>
        `<li><div><b>${dateShort(x.date)}</b> <span>${e(x.source)}</span><small>касаний ${x.contacts} · ответов ${x.answers} · пробных ${x.trials}</small></div><button class="x" data-act="del-fun" data-date="${x.date}" data-src="${e(x.source)}" aria-label="Удалить запись">×</button></li>`).join('') + '</ul>'
        : empty('Вечером внеси касания, ответы и пробные поставки за день — так будет видно, какой канал работает.')}</section>
    </div>`;
  }

  /* ---------- Спорт ---------- */
  function viewSport() {
    const p = plan();
    const log = C.exerciseLog(plans, state);
    const dates = Object.keys(state.body).sort();
    const first = dates[0];
    const series = k => dates.filter(d => state.body[d][k]).map(d => [C.offset(d, first), Number(state.body[d][k]), dateShort(d) + ': ' + state.body[d][k]]);
    const weight = series('weight'), mood = series('mood'), sleep = series('sleep');
    const labels = dates.length ? [[0, dateShort(first)], [C.offset(dates.at(-1), first), dateShort(dates.at(-1))]].filter((x, i, a) => i === 0 || x[0] !== a[0][0]) : [];
    let workouts = 0, workoutsDone = 0;
    for (const pl of plans) for (const d of pl.days) for (const t of d.tasks) if (t.ex) { workouts++; if (state.months[pl.id]?.tasks[t.id]?.done) workoutsDone++; }
    const score = r => r.kg * 1000 + r.reps;
    const rows = Object.entries(log).map(([name, list]) => {
      const a = list[0], z = list.at(-1), best = list.reduce((m, r) => score(r) > score(m) ? r : m, a);
      const show = r => (r.kg ? r.kg + ' кг × ' : '') + r.reps;
      const up = list.length > 1 && score(z) > score(a);
      return `<tr><td>${e(name)}</td><td>${show(a)}</td><td>${show(z)}${up ? ' <i class="up">рост</i>' : ''}</td><td>${show(best)}</td><td>${list.length}</td></tr>`;
    }).join('');
    const dw = weight.length > 1 ? Math.round((weight.at(-1)[1] - weight[0][1]) * 10) / 10 : null;
    return head('Спорт', 'Вес тела, самочувствие и лучший подход в каждом упражнении.') + `
    <section class="kpis">
      <div class="glass kpi"><span>Тренировки</span><b>${workoutsDone} <i>из ${workouts}</i></b>${bar(workoutsDone, workouts, '#23a884')}</div>
      <div class="glass kpi"><span>Вес сейчас</span><b>${weight.length ? weight.at(-1)[1] + ' кг' : '—'}</b><small>${dw === null ? 'запиши вес хотя бы дважды' : (dw > 0 ? '+' : '') + dw + ' кг с первой записи'}</small></div>
      <div class="glass kpi"><span>Среднее самочувствие</span><b>${mood.length ? (mood.reduce((s, x) => s + x[1], 0) / mood.length).toFixed(1) + ' из 5' : '—'}</b><small>${sleep.length ? 'сон в среднем ' + (sleep.reduce((s, x) => s + x[1], 0) / sleep.length).toFixed(1) + ' ч' : 'отмечай в «Состоянии дня»'}</small></div>
    </section>
    <div class="two">
      <section class="glass"><h2>Вес тела</h2>${weight.length > 1 ? lineChart(weight, { color: '#23a884', unit: ' кг', labels, zero: false }) : empty('График появится после двух записей веса. Поле — внизу страницы «Сегодня».')}</section>
      <section class="glass"><h2>Самочувствие</h2>${mood.length > 1 ? lineChart(mood, { color: '#e8618c', labels, zero: false }) : empty('Отмечай самочувствие каждый день — увидишь, как оно связано с нагрузкой и сном.')}</section>
    </div>
    <section class="glass"><h2>Прогресс в упражнениях</h2>${rows ? `<div class="scroll"><table><thead><tr><th>Упражнение</th><th>Первый раз</th><th>Последний раз</th><th>Лучший</th><th>Записей</th></tr></thead><tbody>${rows}</tbody></table></div>`
      : empty('На тренировке записывай лучший подход: вес и повторы. Здесь появится сравнение первого и последнего раза.')}</section>
    ${p.sportGuide ? `<section class="glass"><h2>Правила программы</h2><ul class="guide">${p.sportGuide.map(s => `<li>${e(s)}</li>`).join('')}</ul></section>` : ''}`;
  }

  /* ---------- Аналитика ---------- */
  function viewStats() {
    const p = plan(), st = C.monthStats(p, state), ti = started(p) ? todayIndex(p) : -1;
    const all = plans.map(x => C.monthStats(x, state));
    const lifetime = state.payments.reduce((s, x) => s + x.amount, 0);
    const passed = st.start ? Math.max(0, Math.min(30, C.offset(today(), st.start) + 1)) : 0;
    let streak = 0;
    for (let i = Math.min(ti, 29); i >= 0 && st.days[i].done > 0; i--) streak++;
    const pace = passed ? st.net / passed * 30 : 0;
    const cash = st.days.slice(0, Math.max(passed, 1)).map(d => [d.day, d.balance, 'День ' + d.day + ': ' + money(d.balance)]);
    const cats = Object.entries(st.byCat).filter(([, v]) => v.total);
    const src = Object.entries(st.bySource).filter(([, v]) => v.contacts || v.answers || v.trials || v.payments || v.net).sort((a, b) => b[1].net - a[1].net || b[1].answers - a[1].answers);
    const prod = Object.entries(st.byProduct).filter(([, v]) => v.payments || v.net);
    const rate = (a, b) => b ? Math.round(a / b * 100) + '%' : '—';
    return head('Аналитика', `Месяц ${p.number}: ${e(p.title)}`, monthTabs()) + `
    <section class="kpis four">
      <div class="glass kpi"><span>Оплаты месяца</span><b>${money(st.net)}</b><small>${Math.round(st.net / p.target * 100)}% цели</small>${bar(st.net, p.target)}</div>
      <div class="glass kpi"><span>Если так пойдёт</span><b>${passed > 3 ? money(pace) : '—'}</b><small>${passed > 3 ? 'к концу месяца при текущем темпе' : 'прогноз появится на четвёртый день месяца'}</small></div>
      <div class="glass kpi"><span>Задания</span><b>${rate(st.done, st.total)}</b><small>${st.done} из ${st.total}, вложено ${mins(st.minDone)}</small></div>
      <div class="glass kpi"><span>Дней подряд</span><b>${streak}</b><small>с хотя бы одним завершённым заданием</small></div>
    </section>
    <section class="glass"><h2>Оплаты нарастающим итогом</h2>${st.start ? lineChart([[1, null], ...cash, [30, null]].filter((x, i, a) => x[1] !== null || i === 0 || i === a.length - 1), { target: p.target, unit: ' ₽', labels: [[1, 'день 1'], [10, '10'], [20, '20'], [30, '30']] }) + '<p class="hint">Пунктир — ровный путь к цели. Линия выше пунктира — идёшь с опережением.</p>' : empty('График появится, когда начнётся месяц.')}</section>
    <div class="two">
      <section class="glass"><h2>Задания по дням</h2>${dayBars(st.days, ti)}</section>
      <section class="glass"><h2>По направлениям</h2><div class="cats">${cats.map(([k, v]) =>
        `<div><span>${e(C.CATS[k][0])}</span>${bar(v.done, v.total, C.CATS[k][1])}<small>${v.done} из ${v.total} · ${mins(v.minDone)}</small></div>`).join('')}</div></section>
    </div>
    <div class="two">
      <section class="glass"><h2>Каналы продаж</h2>${src.length ? `<div class="scroll"><table><thead><tr><th>Канал</th><th>Касания</th><th>Ответы</th><th>Пробные</th><th>Оплаты</th><th>Деньги</th></tr></thead><tbody>${src.map(([k, v]) =>
        `<tr><td>${e(k)}</td><td>${v.contacts}</td><td>${v.answers} <small>${rate(v.answers, v.contacts)}</small></td><td>${v.trials}</td><td>${v.payments}</td><td>${money(v.net)}</td></tr>`).join('')}</tbody></table></div>`
        : empty('Каналы появятся после первых записей в «Продажах». По этой таблице видно, где удваивать усилия.')}</section>
      <section class="glass"><h2>Тарифы</h2>${prod.length ? `<div class="scroll"><table><thead><tr><th>Тариф</th><th>Оплат</th><th>Деньги</th></tr></thead><tbody>${prod.map(([k, v]) => `<tr><td>${e(k)}</td><td>${v.payments}</td><td>${money(v.net)}</td></tr>`).join('')}</tbody></table></div>` : empty('Здесь будет видно, какой тариф приносит деньги.')}
        <h2 class="gap">Воронка</h2><p class="conv">Касания ${st.funnel.contacts} → ответы ${st.funnel.answers} (${rate(st.funnel.answers, st.funnel.contacts)}) → пробные ${st.funnel.trials} (${rate(st.funnel.trials, st.funnel.answers)}) → оплаты ${st.funnel.payments} (${rate(st.funnel.payments, st.funnel.trials)})</p></section>
    </div>
    <section class="glass"><h2>Все месяцы</h2><div class="scroll"><table><thead><tr><th>Месяц</th><th>Даты</th><th>Цель</th><th>Оплаты</th><th>Задания</th><th>Касания</th></tr></thead><tbody>${all.map(s =>
      `<tr><td>${s.number}. ${e(s.title)}</td><td>${s.start ? dateShort(s.start) + ' — ' + dateShort(s.end) : 'не начат'}</td><td>${money(s.target)}</td><td>${money(s.net)}</td><td>${s.done} из ${s.total}</td><td>${s.funnel.contacts}</td></tr>`).join('')}
      </tbody><tfoot><tr><td colspan="3">Всего оплат за всё время</td><td colspan="3">${money(lifetime)}</td></tr></tfoot></table></div></section>`;
  }

  /* ---------- Данные ---------- */
  function viewData() {
    const p = plan(), m = mstate(p.id), nextNo = String(plans.at(-1).number + 1).padStart(2, '0');
    return head('Данные', 'Отчёт месяца, следующий месяц и резервная копия.', monthTabs()) + `
    ${storageError ? `<section class="glass note warn">${e(storageError)}</section>` : ''}
    <section class="glass"><h2>Итоги месяца ${p.number} своими словами</h2>
      <p class="hint">Эти четыре поля уходят в отчёт. По ним и по твоим ответам в заданиях собирается следующий месяц.</p>
      <div class="notes">${C.NOTE_FIELDS.map(([k, label]) => `<label><span>${label}</span><textarea rows="3" maxlength="3000" data-mnote="${k}">${e(m.notes[k] ?? '')}</textarea></label>`).join('')}</div>
      <div class="row"><button class="btn primary" data-act="report">Скачать отчёт месяца</button></div>
    </section>
    <section class="glass"><h2>Как получить следующий месяц</h2>
      <ol class="steps">
        <li>Скачай отчёт месяца кнопкой выше. В файле — что выполнено, твои ответы, оплаты, воронка, вес и тренировки.</li>
        <li>Отправь файл в чат Claude и попроси составить следующий месяц. Формат плана уже описан внутри отчёта. Можно приложить учебники по маркетплейсам — задания будут опираться на них.</li>
        <li>Полученный файл <b>month-${nextNo}.json</b> загрузи на GitHub в папку <b>months</b> рядом с остальными. Сайт найдёт его сам на всех устройствах.</li>
      </ol>
      <div class="row"><button class="btn" data-act="load-plan">Загрузить план только в этот браузер</button></div>
      <p class="hint">Прошлые месяцы остаются: их видно в «Аналитике» и по вкладкам месяцев.</p>
    </section>
    <section class="glass"><h2>Дата начала месяца ${p.number}</h2>
      <form data-form="restart" class="row"><input type="date" name="date" value="${m.start || suggestedStart(p)}" aria-label="Дата первого дня"><button class="btn">${m.start ? 'Изменить дату' : 'Начать месяц'}</button></form>
      <p class="hint">Отметки заданий привязаны к номеру дня и не сдвигаются. Оплаты и вес привязаны к датам.</p>
    </section>
    <section class="glass"><h2>Резервная копия</h2>
      <p class="hint">Данные лежат в этом браузере. Чтобы перенести их на телефон или другой компьютер, скачай копию здесь и восстанови там.</p>
      <div class="row"><button class="btn" data-act="backup">Скачать копию</button><button class="btn" data-act="restore">Восстановить из копии</button><button class="btn danger" data-act="reset">Стереть всё</button></div>
    </section>`;
  }

  /* ---------- Отрисовка ---------- */
  const renderers = { today: viewToday, month: viewMonth, sales: viewSales, sport: viewSport, stats: viewStats, data: viewData };
  function render({ keepScroll = true } = {}) {
    const y = window.scrollY;
    $('#view').innerHTML = renderers[ui.view]();
    $('#view').dataset.screen = ui.view;
    document.querySelectorAll('.dock [data-view]').forEach(b => b.setAttribute('aria-current', b.dataset.view === ui.view ? 'page' : 'false'));
    if (keepScroll) window.scrollTo(0, y); else window.scrollTo(0, 0);
    ui.just = '';
  }
  function go(view, push = true) {
    if (!VIEWS.includes(view)) view = 'today';
    ui.view = view;
    if (push && location.hash !== '#' + view) history.replaceState(null, '', '#' + view);
    const v = $('#view'); v.classList.remove('enter'); void v.offsetWidth; v.classList.add('enter');
    render({ keepScroll: false });
  }

  /* ---------- Действия ---------- */
  function findTask(id) {
    for (const p of plans) for (let i = 0; i < p.days.length; i++) { const t = p.days[i].tasks.find(x => x.id === id); if (t) return { p, i, t }; }
    return null;
  }
  const record = (p, id) => mstate(p.id).tasks[id] ?? (mstate(p.id).tasks[id] = {});
  function toggle(id) {
    const { p, t } = findTask(id);
    if (!started(p)) { if (!startMonth(p, suggestedStart(p))) return; toast('Месяц начат сегодня. Дату можно изменить в «Данных».'); }
    const r = record(p, id);
    if (r.done) { delete r.done; delete r.at; ui.open.add(id); }
    else { r.done = true; r.at = today(); ui.open.delete(id); ui.just = id; }
    save(); render();
    if (r.done) {
      const day = p.days[ui.day].tasks;
      if (day.every(x => mstate(p.id).tasks[x.id]?.done)) toast('День закрыт. Все задания завершены.');
      else toast('Завершено: ' + t.title);
    }
  }
  async function copyPrompt(id) {
    const { p, i, t } = findTask(id), r = mstate(p.id).tasks[id] ?? {};
    const sets = t.ex ? t.ex.map((x, k) => r.sets?.[k]?.[1] ? `${x.name}: ${r.sets[k][0] ? r.sets[k][0] + ' кг × ' : ''}${r.sets[k][1]}` : '').filter(Boolean) : [];
    const text = [p.context ?? '',
      `Задание из моего плана на месяц (день ${i + 1}, «${t.title}», на него отведено ${mins(t.min)}).\nШаги:\n${t.steps.map((s, k) => (k + 1) + '. ' + s).join('\n')}\nГотово, когда: ${t.done}`,
      t.prompt ?? 'Распиши подробно, как выполнить это задание: что именно делать по шагам, готовые тексты и примеры, чего избегать. Уложись в отведённое время.',
      r.note ? 'Что у меня уже есть:\n' + r.note : '', sets.length ? 'Мои результаты сегодня:\n' + sets.join('\n') : ''].filter(Boolean).join('\n\n');
    try { await navigator.clipboard.writeText(text); }
    catch {
      const ta = Object.assign(document.createElement('textarea'), { value: text });
      document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove();
    }
    toast('Запрос скопирован. Вставь его в чат Claude.');
  }
  function download(name, data) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function confirmBox(title, text, okLabel, onOk) {
    $('#dialog-body').innerHTML = `<h2>${e(title)}</h2><p>${e(text)}</p><div class="row"><button class="btn" data-act="close">Отмена</button><button class="btn danger" data-act="confirm">${e(okLabel)}</button></div>`;
    $('#dialog').onclose = null;
    $('#dialog-body').querySelector('[data-act=confirm]').onclick = () => { $('#dialog').close(); onOk(); };
    $('#dialog').showModal();
  }
  function readFile(input, handler) {
    const file = input.files[0]; input.value = '';
    if (!file) return;
    file.text().then(text => handler(JSON.parse(text))).catch(err => toast(err instanceof SyntaxError ? 'Файл не читается как JSON.' : err.message));
  }

  document.addEventListener('click', ev => {
    const nav = ev.target.closest('.dock [data-view]');
    if (nav) { ev.preventDefault(); go(nav.dataset.view); return; }
    const b = ev.target.closest('[data-act]');
    if (!b) return;
    const d = b.dataset, p = plan();
    switch (d.act) {
      case 'toggle': toggle(d.id); break;
      case 'open': ui.open.has(d.id) ? ui.open.delete(d.id) : ui.open.add(d.id); if (mstate(p.id).tasks[d.id]?.done) render(); break;
      case 'copy': copyPrompt(d.id); break;
      case 'day': ui.day = Math.max(0, Math.min(29, ui.day + Number(d.d))); ui.picked = true; render({ keepScroll: false }); break;
      case 'day-today': ui.day = todayIndex(); render({ keepScroll: false }); break;
      case 'go-day': ui.day = Number(d.i); ui.picked = true; go('today'); break;
      case 'pick-plan': ui.planId = d.id; ui.day = todayIndex(); ui.picked = true; render(); break;
      case 'mood': { const b0 = state.body[d.date] ?? (state.body[d.date] = {}); if (b0.mood === Number(d.v)) delete b0.mood; else b0.mood = Number(d.v); save(); render(); break; }
      case 'del-pay': confirmBox('Удалить оплату?', 'Запись исчезнет из месяца и аналитики.', 'Удалить', () => { state.payments = state.payments.filter(x => x.id !== d.id); save(); render(); }); break;
      case 'del-fun': state.funnel = state.funnel.filter(x => !(x.date === d.date && x.source === d.src)); save(); render(); break;
      case 'report': {
        if (!started(p)) { toast('Сначала начни месяц — в отчёте нужны даты.'); break; }
        save(); download(`mandala-report-${p.id}.json`, C.buildReport(p, state, plans, today())); toast('Отчёт скачан. Отправь его в чат Claude.'); break;
      }
      case 'backup': save(); download(`mandala-backup-${today()}.json`, state); toast('Копия скачана.'); break;
      case 'restore': $('#file-backup').click(); break;
      case 'load-plan': $('#file-plan').click(); break;
      case 'reset': confirmBox('Стереть все данные?', 'Отметки, ответы, оплаты, вес и загруженные планы будут удалены из этого браузера. Сначала скачай копию.', 'Стереть всё', () => { state = C.emptyState(); save(); rebuildPlans(remotePlans); ui.planId = pickPlan(); ui.day = 0; render(); toast('Данные стёрты.'); }); break;
      case 'close': $('#dialog').close(); break;
    }
  });

  document.addEventListener('input', ev => {
    const el = ev.target, d = el.dataset;
    if (d.note) { const { p } = findTask(d.note); record(p, d.note).note = el.value; saveSoon(); }
    else if (d.set) {
      const { p, t } = findTask(d.set), r = record(p, d.set);
      r.sets ??= t.ex.map(() => ['', '']);
      r.sets[d.k][d.j] = el.value; saveSoon();
    }
    else if (d.body) { const b = state.body[d.date] ?? (state.body[d.date] = {}); if (el.value === '') delete b[d.body]; else b[d.body] = Number(el.value); saveSoon(); }
    else if (d.mnote) { mstate().notes[d.mnote] = el.value; saveSoon(); }
  });
  document.addEventListener('change', ev => {
    const el = ev.target;
    if (el.matches('select[data-price]')) { const price = el.selectedOptions[0].dataset.p; if (Number(price) > 0) el.form.amount.value = price; }
    if (el.id === 'file-plan') readFile(el, data => {
      const np = C.validatePlan(data);
      if (np.id === window.MANDALA_BUILTIN.id) throw Error('Месяц 1 встроен в сайт. Следующий файл должен называться month-02.');
      state.plans = state.plans.filter(x => x.id !== np.id).concat(np); save(); rebuildPlans(remotePlans);
      if (!started(np)) ui.planId = np.id, ui.day = 0;
      go('today'); toast('План «' + np.title + '» загружен.');
    });
    if (el.id === 'file-backup') readFile(el, data => {
      const next = C.validateState(data);
      confirmBox('Заменить данные копией?', 'Текущие отметки и записи в этом браузере будут заменены содержимым файла.', 'Заменить', () => { state = next; save(); rebuildPlans(remotePlans); ui.planId = pickPlan(); ui.day = todayIndex(); go('today'); toast('Данные восстановлены.'); });
    });
  });
  document.addEventListener('submit', ev => {
    ev.preventDefault();
    const f = ev.target, kind = f.dataset.form, v = Object.fromEntries(new FormData(f)), p = plan();
    if (kind === 'start' || kind === 'restart') {
      if (startMonth(p, v.date)) { ui.day = todayIndex(); render(); toast('Месяц ' + p.number + ' начинается ' + dateShort(v.date) + '.'); }
    } else if (kind === 'pay') {
      const amount = Math.round(Number(v.amount));
      if (!C.validDate(v.date) || !(amount > 0)) { toast('Укажи дату и сумму больше нуля.'); return; }
      state.payments.push({ id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), date: v.date, product: v.product, source: v.source, amount: v.refund ? -amount : amount, note: (v.note ?? '').trim() });
      save(); render(); toast(v.refund ? 'Возврат записан.' : 'Оплата записана: ' + money(amount));
    } else if (kind === 'funnel') {
      const row = { date: v.date, source: v.source };
      for (const [k] of C.STAGES) row[k] = Math.max(0, Math.round(Number(v[k]) || 0));
      if (!C.validDate(v.date)) { toast('Укажи дату.'); return; }
      state.funnel = state.funnel.filter(x => !(x.date === row.date && x.source === row.source)).concat(row);
      save(); render(); toast('Цифры дня сохранены.');
    }
  });
  window.addEventListener('hashchange', () => go(location.hash.slice(1), false));
  window.addEventListener('beforeunload', () => { clearTimeout(saveTimer); save(); });

  /* ---------- Следующие месяцы из папки months на GitHub ---------- */
  let remotePlans = [];
  async function probeRemote() {
    if (!location.protocol.startsWith('http')) return;
    const found = [];
    for (let n = 2; n <= 36; n++) {
      try {
        const res = await fetch(`months/month-${String(n).padStart(2, '0')}.json`, { cache: 'no-store' });
        if (!res.ok) break;
        found.push(C.validatePlan(await res.json()));
      } catch (err) { if (/^Файл плана/.test(err.message)) toast(`month-${String(n).padStart(2, '0')}.json: ${err.message}`); break; }
    }
    if (!found.length) return;
    remotePlans = found; rebuildPlans(found);
    if (!ui.picked) { ui.planId = pickPlan(); ui.day = todayIndex(); }
    render();
  }

  go(location.hash.slice(1) || 'today', false);
  if (storageError) toast(storageError);
  probeRemote();
})();
