(function(){
'use strict';
const KEY='mandala.v1',BACKUP='mandala.backup.v1',CONFIG='mandala.firebase.v1';
const $=s=>document.querySelector(s),clone=x=>JSON.parse(JSON.stringify(x)),e=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const C=MandalaCore,D=MandalaDaily,P=MandalaPlan,labels={todo:'Не начато',doing:'В работе',done:'Готово'};
const colors=[['#f3e4db','#e4c5b3','#965b40'],['#e9eddf','#ced9b9','#63754c'],['#e5eced','#bfd1d5','#557880'],['#f3eadd','#e4cfae','#9d7d46'],['#e8eee6','#c5d7c0','#597956'],['#eee8e2','#d9c9bd','#8b705b'],['#e9e8ed','#cfccdb','#77708b'],['#f2e7e3','#e1c5bb','#9b6a5b']];
let pendingState=null;
let viewedDay=null, lastRenderedDate='', openSteps=new Set([0]);
let state=clone(window.MANDALA_SEED),lastRaw=null,storageError='',view='today',mode=matchMedia('(max-width:760px)').matches?'areas':'full',selected=0,filterArea='',filterStatus='',search='',toastTimer,cloud=null,cloudMessage='',cloudBusy=false;
try{lastRaw=localStorage.getItem(KEY);if(lastRaw)state=C.validate(JSON.parse(lastRaw));else{C.validate(state);lastRaw=JSON.stringify(state);localStorage.setItem(KEY,lastRaw);}}catch(err){storageError='Не удалось прочитать сохранение. Исходные данные не перезаписаны. Открой «Данные и облако».';}
function toast(msg){$('#toast').textContent=msg;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),4500);}
function localDate(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function dateFmt(s){return s?new Date(s+'T12:00:00').toLocaleDateString('ru-RU',{day:'numeric',month:'short',year:'numeric'}):'Без срока';}
function theme(i){return '--pale:'+colors[i][0]+';--tone:'+colors[i][1]+';--deep:'+colors[i][2];}
function saveStatus(){const el=$('#save-state');el.classList.toggle('error',!!storageError);el.innerHTML='<i></i>'+e(storageError?'Ошибка сохранения — экспортируй данные':cloud&&cloud.auth.currentUser?'На устройстве · облако вручную':'Сохранено на устройстве');}
function commit(next,{backup=true}={}){
 try{
  C.validate(next);pendingState=next;
  const now=localStorage.getItem(KEY);
  if(now!==lastRaw){toast('Матрица изменилась в другой вкладке. Обнови страницу перед сохранением.');return false;}
  if(storageError && now){toast('Сначала восстанови сохранение через раздел данных.');return false;}
  if(now&&backup)localStorage.setItem(BACKUP,now);
  next.updatedAt=new Date().toISOString();
  const raw=JSON.stringify(next);localStorage.setItem(KEY,raw);lastRaw=raw;state=next;pendingState=null;storageError='';render();return true;
 }catch(err){storageError=err.message;saveStatus();toast('Не сохранено: '+err.message+'. Скачай резервную копию.');return false;}
}
function all(){return state.areas.flatMap((a,i)=>a.actions.map((t,j)=>({t,a,i,j})));}
function mutate(fn){const next=clone(state);fn(next);return commit(next);}
function render(){
 lastRenderedDate=localDate();
 const st=C.stats(state),g=state.goal;
 $('#goal-title').textContent=g.title;$('#goal-subtitle').textContent=g.description;$('#goal-date').textContent=dateFmt(g.deadline);
 const days=g.deadline?Math.ceil((new Date(g.deadline+'T00:00:00')-new Date(localDate()+'T00:00:00'))/86400000):null;
 $('#days-left').textContent=days===null?'свой ритм':days<0?'Пора пересмотреть горизонт':days===0?'День подведения итогов':'Осталось дней: '+days;
 $('#done-count').innerHTML=st.done+' <small>/ 64</small>';$('#doing-count').textContent=st.doing;$('#focus-count').innerHTML=st.focus+' <small>/ 3</small>';$('#total-bar').style.width=(st.done/64*100)+'%';
 $('#income').textContent=g.target?g.current.toLocaleString('ru-RU')+' / '+g.target.toLocaleString('ru-RU')+' ₽':'Задать цель →';
 $('#income-note').textContent=g.target?'факт / цель · редактируется вручную':'сумма пока не выбрана';
 document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===view);if(b.classList.contains('nav'))b.setAttribute('aria-current',b.dataset.view===view?'page':'false');});
 const titles={today:['Рабочий месяц',''],analytics:['Динамика','Выручка, воронка и прогресс по заданиям'],pipeline:['Воронка','Итоги продаж по источникам'],reports:['Отчёты','Итоги текущего месяца и следующий план'],matrix:['Твоя большая цель.<span>По шагам.</span>','Собери то, что важно, в одну понятную картину.'],actions:['Действия.<span>Из намерения в результат.</span>','Все 64 шага: выбирай, уточняй, отмечай прогресс.'],focus:['Фокус недели.<span>Только главное.</span>','До трёх действий. Достаточно, чтобы двигаться вперёд.'],reviews:['Рефлексия.<span>Замечай движение.</span>','Что сработало, чему научился и какой шаг следующий.']};
 $('#page-title').innerHTML=titles[view][0];$('#page-description').textContent=titles[view][1];
 const breadcrumbs={today:'Рабочий месяц',analytics:'Динамика',pipeline:'Воронка',reports:'Отчёты',matrix:'Моя матрица',actions:'Все действия',focus:'Фокус недели',reviews:'Рефлексия'};
 $('#breadcrumb').textContent=breadcrumbs[view]+' / Личный план';
 document.body.dataset.screen=view;
 if(view==='today')renderToday();else if(view==='analytics')renderAnalytics();else if(view==='pipeline')renderPipeline();else if(view==='reports')renderReports();else if(view==='matrix')renderMatrix();else if(view==='reviews')renderReviews();else renderActions();
 saveStatus();
}
function money(value) {
 return value.toLocaleString('ru-RU') + ' ₽';
}
function ratio(value, target) {
 return Math.round(Math.min(1, Math.max(0, value / target)) * 100);
}
function metric(label, value, detail, accent = '') {
 return '<article class="dash-metric ' + accent + '"><span>' + label + '</span><strong>' +
  e(value) + '</strong><small>' + e(detail) + '</small></article>';
}
function targetOf(month) {
 return month.plan?.target ?? P.firstTarget;
}
function heading(period, label) {
 return '<div class="panel-head"><div><span class="caption">' + e(period) +
  '</span><h2>' + e(label) + '</h2></div></div>';
}

function cashChart(stats, month, compact = false) {
 const elapsed = month.start ? Math.max(0, Math.min(30, P.offset(localDate(), month.start) + 1)) : 0;
 const points = stats.series.slice(0, elapsed);
 const max = Math.max(1, ...points.map(day => Math.abs(day.balance)));
 const hasData = points.some(day => day.net !== 0);
 const chart = stats.series.map((day, index) => {
  const height = Math.max(2, Math.round(Math.abs(day.balance) / max * 100));
  const label = 'День ' + day.day + ' · ' + money(day.balance);
  return '<button type="button" class="cash-column' + (day.balance < 0 ? ' negative' : '') +
    (index >= elapsed ? ' future' : '') + '" data-act="chart-point" data-i="' + index +
   '" aria-label="' + e(label) + '" title="' + e(label) + '"' + (index >= elapsed ? ' disabled' : '') +
   '><span style="height:' + height + '%"></span></button>';
 }).join('');
 return '<section class="dash-panel ' + (compact ? 'chart-compact' : '') + '">' +
  heading('Поступления минус возвраты', 'Выручка по дням') +
  '<div class="chart-values"><strong>' + money(stats.net) + '</strong><span id="chart-readout">' +
  (hasData ? 'Нажми на столбик, чтобы увидеть сумму' : 'График заполнится после первой оплаты') + '</span></div>' +
  '<div class="cash-chart" aria-label="Накопленная выручка за 30 дней">' + chart + '</div>' +
  '<div class="chart-axis"><span>День 1</span><span>10</span><span>20</span><span>30</span></div></section>';
}

function funnelChart(stats, withLink = false) {
 const steps = [...P.stages, ['payments', 'Оплаты']];
 const max = Math.max(1, ...Object.values(stats.funnel));
 return '<section class="dash-panel">' + heading('За текущие 30 дней', 'Воронка продаж') +
  '<div class="funnel-chart">' + steps.map(([key, label]) => '<div class="funnel-row"><span>' + label +
  '</span><div class="meter-track"><i style="width:' + ratio(stats.funnel[key], max) + '%"></i></div><b>' +
  stats.funnel[key] + '</b></div>').join('') + '</div>' +
  (withLink ? '<button class="text-btn" data-view="pipeline">Внести цифры →</button>' : '') + '</section>';
}

function renderToday() {
 const month = P.stateOf(state);
 const today = localDate();
 const elapsed = month.start ? P.offset(today, month.start) : 0;
 const current = Math.min(29, Math.max(0, elapsed));
 const day = viewedDay ?? current;
 const progress = month.checks[day];
 const completed = P.completedCount(progress);
 const date = month.start ? P.addDays(month.start, day) : '';
 const editable = month.start && date <= today;
 const stats = P.totals(month, today);
 const target = targetOf(month);
 const title = month.plan?.title ?? 'Первые продажи';
 const phase = ['Поиск и первые демо', 'Проверка предложения', 'Пилоты и оплаты', 'Дожим и итоги'][Math.min(3, Math.floor(day / 7))];
 const tasks = (month.plan?.days ?? P.days)[day].map((task, slot) => {
  const done = !!(progress & (1 << slot));
  const open = openSteps.has(slot);
  return '<article class="mission ' + (done ? 'done' : '') + '">' +
   '<button class="mission-check" data-act="plan-toggle" data-i="' + day + '" data-j="' + slot +
   '" aria-pressed="' + done + '" aria-label="' + e((done ? 'Вернуть: ' : 'Выполнено: ') + task.title) +
   '"' + (editable ? '' : ' disabled') + '>' + (done ? '✓' : String(slot + 1).padStart(2, '0')) + '</button>' +
   '<details data-slot="' + slot + '"' + (open ? ' open' : '') + '><summary><span class="task-category category-' + slot + '">' +
   P.labels[slot] + '</span><span class="mission-title">' + e(task.title) + '</span><span class="details-hint" aria-hidden="true"></span></summary>' +
   '<ol>' + task.steps.map(step => '<li>' + e(step) + '</li>').join('') +
   '</ol><div class="definition"><strong>Готово, когда</strong><p>' + e(task.done) + '</p></div></details></article>';
 }).join('');
 const dayOptions = (month.plan?.days ?? P.days).map((_, index) => '<option value="' + index +
  '"' + (index === day ? ' selected' : '') + '>День ' + (index + 1) +
  (month.checks[index] ? ' · ' + P.completedCount(month.checks[index]) + '/5' : '') + '</option>').join('');
 const projects = D.data(state).projects.map(project => '<li><div><strong>' + e(project.title) +
  '</strong><small>' + e(project.detail || 'Без описания') + '</small></div>' +
  '<button class="btn small" data-act="project" data-id="' + e(project.id) + '" aria-label="' +
  e('Настройки проекта ' + project.title) + '">Изменить</button></li>').join('');
 const period = month.start ? dateFmt(month.start) + ' — ' + dateFmt(P.addDays(month.start, 29)) : '30 дней с даты старта';
 const markText = !month.start ? 'Начни месяц, чтобы отмечать задачи' : !editable ? 'Этот день ещё не наступил' :
  elapsed >= 30 ? 'Месяц завершён. Подведи итоги в отчёте.' : 'Выполнено ' + completed + ' из 5';
 $('#view-content').innerHTML =
  '<div class="dashboard-hero"><div><div class="cycle-label"><i></i>' + e(period) +
  '</div><h1>' + e(title) + '</h1><p>Пять заданий на день. Цель месяца — ' + money(target) + ' поступлений после возвратов.</p></div>' +
  '<div class="hero-actions">' + (month.start ? '<button class="btn primary" data-act="payment">＋ Записать оплату</button>' :
    '<button class="btn primary" data-act="plan-start">Начать месяц</button>') +
  '<button class="btn" data-view="reports">Отчёт месяца</button></div></div>' +
  '<div class="dash-metrics">' + metric('Выручка месяца', money(stats.net), 'Из ' + money(target) + ' · ' + ratio(stats.net, target) + '%', 'metric-main') +
  metric('Первый миллион', money(P.lifetime(state, today)), 'Накопительно по всем сервисам') +
  metric('Задачи месяца', stats.done + ' / 150', 'Отмечено в календаре') +
  metric('Проведено демо', String(stats.funnel.demos), 'По журналу воронки') + '</div>' +
  '<div class="month-layout"><section><div class="mission-header"><div><div class="caption">' +
  e((date ? dateFmt(date) + ' · ' : '') + (month.plan ? 'План месяца' : phase)) + '</div><h2>День ' + (day + 1) +
  '<small> / 30</small></h2></div><div class="day-picker">' +
  '<button class="btn small" data-act="plan-jump" data-i="' + (day - 1) + '" aria-label="Предыдущий день"' + (day === 0 ? ' disabled' : '') + '>←</button>' +
  '<select id="plan-day" aria-label="День плана">' + dayOptions + '</select>' +
  '<button class="btn small" data-act="plan-jump" data-i="' + (day + 1) + '" aria-label="Следующий день"' + (day === 29 ? ' disabled' : '') + '>→</button>' +
  (day !== current ? '<button class="btn small" data-act="plan-today">Сегодня</button>' : '') + '</div></div>' +
  '<p class="day-status">' + e(markText) + '</p><div class="day-strip" aria-label="Календарь заданий">' +
  month.checks.map((mask, index) => '<button data-act="plan-jump" data-i="' + index +
    '" class="' + (day === index ? 'selected ' : '') + (mask === 31 ? 'finished' : mask ? 'partial' : '') +
    '" aria-label="День ' + (index + 1) + ', отмечено ' + P.completedCount(mask) + ' из 5" aria-current="' +
    (day === index ? 'true' : 'false') + '">' + (index + 1) + '</button>').join('') +
  '</div><div class="mission-list">' + tasks + '</div></section>' +
  '<aside class="dashboard-side">' + cashChart(stats, month, true) + funnelChart(stats, true) +
  '<section class="dash-panel">' + heading('Открытые источники', 'Где искать клиентов') +
  '<p>Запросы для Telegram и 2ГИС, отбор компаний, тексты для первого сообщения и после демо.</p>' +
  '<div class="source-links"><a class="btn small" href="SALES.html">Поиск и шаблоны →</a>' +
  '<button class="btn small" data-act="payments">Журнал оплат</button></div></section>' +
  '<section class="dash-panel">' + heading('SellerCtrl, FLRAD и новые идеи', 'Мои проекты') +
  '<ul class="project-list">' + projects + '</ul><button class="btn small" data-act="project">＋ Добавить проект</button></section></aside></div>';
}

function renderAnalytics() {
 const month = P.stateOf(state);
 const stats = P.totals(month, localDate());
 const byWeek = [0, 1, 2, 3, 4].map(week => stats.series.slice(week * 7, week * 7 + 7).reduce((sum, day) => sum + day.done, 0));
 const table = Object.entries(stats.bySource).map(([source, item]) => '<tr><th>' + source + '</th>' +
  [...P.stages.map(([name]) => item[name]), item.payments, money(item.net)].map(value => '<td>' + value + '</td>').join('') + '</tr>').join('');
 $('#view-content').innerHTML = '<div class="dash-metrics">' +
  metric('Фактически получено', money(stats.received), 'Положительные платежи') +
  metric('Возвраты', money(stats.refunds), 'Вычтены из выручки') +
  metric('После возвратов', money(stats.net), 'До расходов и налогов', 'metric-main') +
  metric('Средний платёж', stats.funnel.payments ? money(Math.round(stats.received / stats.funnel.payments)) : '—', 'По поступившим платежам') +
  '</div><div class="analytics-grid">' + cashChart(stats, month) + funnelChart(stats, true) +
  '<section class="dash-panel">' + heading('Отметки по неделям', 'Выполнение плана') +
  '<div class="funnel-chart">' + byWeek.map((done, week) => {
   const max = (week === 4 ? 2 : 7) * 5;
   return '<div class="funnel-row"><span>' + (week === 4 ? 'Дни 29–30' : 'Неделя ' + (week + 1)) +
    '</span><div class="meter-track"><i style="width:' + ratio(done, max) + '%"></i></div><b>' + done + '/' + max + '</b></div>';
  }).join('') + '</div></section>' +
  '<section class="dash-panel">' + heading('После возвратов', 'Выручка по сервисам') +
  '<ul class="project-list">' + Object.entries(stats.byProduct).map(([key, value]) =>
   '<li><strong>' + key + '</strong><span>' + money(value) + '</span></li>').join('') + '</ul>' +
  '<button class="btn small" data-act="payments">Журнал оплат</button></section></div>' +
  '<section class="dash-panel table-panel">' + heading('Фактические показатели', 'Результат по источникам') +
  '<div class="table-scroll"><table><thead><tr><th>Источник</th>' +
  [...P.stages.map(([, label]) => label), 'Оплаты', 'Выручка'].map(label => '<th>' + label + '</th>').join('') +
  '</tr></thead><tbody>' + table + '</tbody></table></div></section>';
}

function editDateMax(month) {
 const end = P.addDays(month.start, 29);
 return end < localDate() ? end : localDate();
}

function startPlan() {
 if (P.stateOf(state).start) return;
 const earliest = P.nextStart(state);
 const start = earliest > localDate() ? earliest : localDate();
 showDialog('<h2 id="dialog-title">Начать месяц</h2><p>Период длится 30 дней с выбранной даты.</p>' +
  '<form id="start-form"><label for="cycle-start">Первый день</label><input id="cycle-start" name="start" type="date" required value="' +
  start + '"' + (earliest ? ' min="' + earliest + '"' : '') + '>' + buttons() + '</form>', 'ПЕРВЫЕ ПРОДАЖИ');
 $('#start-form').onsubmit = event => {
  event.preventDefault();
  const startDate = new FormData(event.target).get('start');
  if (!P.validDate(startDate) || (earliest && startDate < earliest)) return;
  const next = clone(state);
  next.month = { ...P.stateOf(next), start: startDate };
  viewedDay = null;
  openSteps = new Set([0]);
  submit(next);
 };
}

function sourceChoices(value) {
 return P.sources.map(source => '<option' + (value === source ? ' selected' : '') + '>' + source + '</option>').join('');
}

function renderPipeline() {
 const month = P.stateOf(state);
 const stats = P.totals(month, localDate());
 const rows = month.activity.slice().sort((a, b) => b.date.localeCompare(a.date) || a.source.localeCompare(b.source))
  .map(entry => '<tr><th>' + e(dateFmt(entry.date)) + '</th><td>' + entry.source + '</td>' +
  P.stages.map(([key]) => '<td>' + entry[key] + '</td>').join('') +
  '<td><button class="btn small" data-act="activity" data-date="' + entry.date + '" data-source="' +
  e(entry.source) + '">Изменить</button></td></tr>').join('');
 $('#view-content').innerHTML = '<div class="analytics-grid">' + funnelChart(stats) +
  '<section class="dash-panel">' + heading('Одна строка на канал и день', 'Записывай итог работы') +
  '<p>Считай новые адресные обращения, содержательные ответы, проведённые демо и отправленные предложения. Разные этапы могут относиться к разным людям и датам. Оплаты берутся из журнала денег.</p>' +
  '<button class="btn primary" data-act="activity">＋ Записать итоги дня</button></section></div>' +
  '<section class="dash-panel table-panel">' + heading('С разбивкой по источникам', 'Журнал воронки') +
  (rows ? '<div class="table-scroll"><table><thead><tr><th>Дата</th><th>Источник</th>' +
   P.stages.map(([, label]) => '<th>' + label + '</th>').join('') + '<th></th></tr></thead><tbody>' +
   rows + '</tbody></table></div>' : '<p>Записей пока нет. Внеси цифры после первого рабочего блока.</p>') + '</section>';
}

function activityEditor(date, source) {
 const month = P.stateOf(state);
 if (!month.start) { startPlan(); return; }
 const max = editDateMax(month);
 if (month.start > max) { toast('Месяц ещё не начался.'); return; }
 showDialog('<h2 id="dialog-title">Итоги по каналу</h2><p>Если строка за эту дату уже есть, её значения подставятся при выборе канала.</p>' +
  '<form id="activity-form"><div class="form-row"><div><label for="activity-date">Дата</label><input id="activity-date" name="date" type="date"' +
  ' required min="' + month.start + '" max="' + max + '" value="' + (date ?? max) + '"></div>' +
  '<div><label for="activity-source">Источник</label><select id="activity-source" name="source">' +
  sourceChoices(source) + '</select></div></div><div class="form-row">' +
  P.stages.map(([key, label]) => '<div><label for="activity-' + key + '">' + label + '</label>' +
   '<input id="activity-' + key + '" name="' + key + '" type="number" min="0" max="1000" step="1" required value="0"></div>').join('') +
  '</div>' + buttons() + '</form>', 'ВОРОНКА');
 const form = $('#activity-form');
 function loadEntry() {
  const item = month.activity.find(entry => entry.date === form.elements.date.value &&
    entry.source === form.elements.source.value);
  for (const [key] of P.stages) form.elements[key].value = item?.[key] ?? 0;
 }
 form.elements.date.onchange = loadEntry;
 form.elements.source.onchange = loadEntry;
 loadEntry();
 form.onsubmit = event => {
  event.preventDefault();
  const data = new FormData(form);
  const entry = { date: data.get('date'), source: data.get('source') };
  for (const [key] of P.stages) entry[key] = Number(data.get(key));
  const next = clone(state);
  next.month.activity = next.month.activity.filter(item => item.date !== entry.date || item.source !== entry.source);
  if (P.stages.some(([key]) => entry[key] !== 0)) next.month.activity.push(entry);
  submit(next);
 };
}

function paymentEditor(previousId = '') {
 const month = P.stateOf(state);
 if (!month.start) { startPlan(); return; }
 const max = editDateMax(month);
 if (month.start > max) { toast('Месяц ещё не начался.'); return; }
 const previous = month.payments.find(item => item.id === previousId);
 showDialog('<h2 id="dialog-title">' + (previous ? 'Изменить запись' : 'Записать оплату') +
  '</h2><p>Запиши проведённый платёж или возврат. Для пакета с подпиской внеси сумму один раз.</p>' +
  '<form id="payment-form"><div class="form-row"><div><label for="pay-date">Дата</label><input id="pay-date" name="date" type="date" required min="' +
  month.start + '" max="' + max + '" value="' + (previous?.date ?? max) + '"></div>' +
  '<div><label for="pay-product">Сервис</label><select id="pay-product" name="product">' +
  P.products.map(product => '<option' + (product === previous?.product ? ' selected' : '') + '>' + product + '</option>').join('') +
  '</select></div><div><label for="pay-amount">Сумма, ₽</label><input id="pay-amount" type="number" min="1" max="100000000" step="1" name="amount" required value="' +
  (previous ? Math.abs(previous.amount) : '') + '"></div><div><label for="pay-kind">Операция</label>' +
  '<select id="pay-kind" name="kind"><option value="paid">Поступление</option><option value="refund"' +
  (previous?.amount < 0 ? ' selected' : '') + '>Возврат</option></select></div></div>' +
  '<label for="pay-source">Источник клиента</label><select id="pay-source" name="source">' +
  sourceChoices(previous?.source ?? 'Другое') + '</select>' +
  '<label for="pay-note">Пометка, например «запуск»</label><input id="pay-note" name="note" maxlength="100" value="' +
  e(previous?.note) + '">' + buttons() + '</form>', 'ОПЛАТЫ');
 $('#payment-form').onsubmit = event => {
  event.preventDefault();
  const form = new FormData(event.target);
  const next = clone(state);
  const payment = {
   id: previous?.id ?? (crypto.randomUUID ? crypto.randomUUID() : 'payment-' + Date.now()),
   date: form.get('date'), product: form.get('product'), source: form.get('source'),
   amount: Number(form.get('amount')) * (form.get('kind') === 'refund' ? -1 : 1),
   note: form.get('note').trim(),
  };
  const index = next.month.payments.findIndex(item => item.id === payment.id);
  if (index === -1) next.month.payments.push(payment);
  else next.month.payments[index] = payment;
  submit(next);
 };
}

function paymentHistory() {
 const month = P.stateOf(state);
 const stats = P.totals(month, localDate());
 const rows = month.payments.slice().reverse().sort((a, b) => b.date.localeCompare(a.date)).map(item =>
  '<li><div><strong>' + money(item.amount) + ' · ' + e(item.product) + '</strong><small>' +
  e(dateFmt(item.date)) + ' · ' + e(item.source) + (item.note ? ' · ' + e(item.note) : '') + '</small></div>' +
  '<div class="ledger-row-actions"><button class="btn small" data-act="payment" data-id="' + e(item.id) +
  '">Изменить</button><button class="btn small danger" data-act="payment-delete" data-id="' + e(item.id) + '">Удалить</button></div></li>'
 ).join('');
 showDialog('<h2 id="dialog-title">Журнал оплат</h2><p>Получено ' + money(stats.received) +
  ' · возвращено ' + money(stats.refunds) + ' · после возвратов ' + money(stats.net) + '.</p>' +
  (rows ? '<ul class="project-list ledger-rows">' + rows + '</ul>' : '<p>Записей пока нет.</p>') +
  '<div class="dialog-actions"><button class="btn primary" data-act="' + (month.start ? 'payment' : 'plan-start') + '">' +
  (month.start ? '＋ Записать оплату' : 'Начать месяц') + '</button></div>', 'ДЕНЬГИ');
}

function renderReports() {
 const month = P.stateOf(state);
 const archive = (state.monthHistory ?? []).slice().reverse().map(entry =>
  '<li><div><strong>' + e(entry.title) + '</strong><small>' + e(dateFmt(entry.start)) + ' — ' + e(dateFmt(entry.end)) +
  '</small></div><div>' + money(entry.net) + ' · ' + entry.done + '/150</div></li>').join('');
 $('#view-content').innerHTML = '<div class="analytics-grid reports-grid"><section class="dash-panel">' +
  heading('Передай в чат для пересмотра плана', 'Отчёт за месяц') +
  '<p>Файл содержит задачи и отметки, воронку, суммы по источникам и сервисам, а также заметки ниже. Пометки к платежам не входят в отчёт.</p>' +
  '<form id="report-form">' + P.reportFields.map(([name, label]) => field(name, label, month.notes[name] ?? '', 900, true)).join('') +
  '<div class="report-actions"><button class="btn" type="submit">Сохранить заметки</button>' +
  '<button class="btn primary" type="button" data-act="report-download">↓ Скачать отчёт JSON</button></div></form></section>' +
  '<section><div class="dash-panel">' + heading('Каждый цикл — 30 дней', 'Следующий месяц') +
  '<ol class="next-month"><li>Скачай отчёт и пришли его в чат. Напиши, что хочешь изменить.</li>' +
  '<li>Попроси новый план «Мандалы» в формате mandala-month-plan JSON.</li>' +
  '<li>После завершения цикла загрузи файл. Текущий итог уйдёт в архив.</li></ol>' +
  '<button class="btn primary" data-act="month-import">↑ Загрузить следующий план</button>' +
  '<p class="small-note">Чтобы сохранить все старые записи, перед сменой месяца скачай отчёт или полную резервную копию.</p></div>' +
  '<div class="dash-panel archive-panel">' + heading('Закрытые циклы', 'Архив месяцев') +
  (archive ? '<ul class="project-list">' + archive + '</ul>' : '<p>Первый итог появится здесь после смены месяца.</p>') + '</div></section></div>';
 $('#report-form').onsubmit = event => {
  event.preventDefault();
  if (saveReportNotes()) toast('Заметки сохранены');
 };
}

function saveReportNotes() {
 const form = $('#report-form');
 if (!form) return true;
 const values = new FormData(form);
 const notes = Object.fromEntries(P.reportFields.map(([key]) => [key, values.get(key).trim()]));
 if (P.reportFields.every(([key]) => (P.stateOf(state).notes[key] ?? '') === notes[key])) return true;
 return mutate(next => {
  next.month = P.stateOf(next);
  next.month.notes = notes;
 });
}

function downloadReport() {
 if (!saveReportNotes()) return;
 const projects = D.data(state).projects.map(({ title, detail, active }) => ({ title, detail, active }));
 const report = P.buildReport(state, localDate(), projects);
 exportData(report, 'mandala-report-' + (report.month.start || localDate()) + '.json', 'Отчёт подготовлен');
}

function previewNewMonth(plan) {
 const month = P.stateOf(state);
 const earliest = P.nextStart(state);
 if (month.start && earliest > localDate()) {
  toast('Новый цикл можно установить с ' + dateFmt(earliest) + '. Текущий месяц ещё идёт.');
  return;
 }
 if ((state.monthHistory ?? []).length >= 36) {
  toast('Архив достиг 36 месяцев. Скачай полную резервную копию.');
  return;
 }
 const start = earliest > localDate() ? earliest : localDate();
 showDialog('<h2 id="dialog-title">' + e(plan.title) +
  '</h2><p>30 дней · 150 заданий · цель ' + money(plan.target) +
  '. При установке итог предыдущего месяца будет сохранён в архиве.</p>' +
  '<form id="new-month-form"><label for="next-start">Когда начать</label><input id="next-start" name="start" type="date" required value="' +
  start + '"' + (earliest ? ' min="' + earliest + '"' : '') + '>' + buttons() + '</form>', 'НОВЫЙ ПЛАН');
 $('#new-month-form').onsubmit = event => {
  event.preventDefault();
  const date = new FormData(event.target).get('start');
  if (!P.validDate(date) || (earliest && date < earliest)) return;
  const next = clone(state);
  if (month.start) {
   const stats = P.totals(month, localDate());
   next.monthHistory = [...(state.monthHistory ?? []), { start: month.start, end: P.addDays(month.start, 29),
    title: month.plan?.title ?? 'Первые продажи', target: targetOf(month), net: stats.net, done: stats.done }];
  }
  next.month = { start: date, checks: Array(30).fill(0), payments: [], activity: [], notes: {}, plan };
  viewedDay = null;
  openSteps = new Set([0]);
  if (commit(next)) {
   $('#editor').close();
   view = 'today';
   render();
   toast('Следующий план загружен');
  }
 };
}

function editProject(id) {
 const daily = D.data(state);
 const existing = daily.projects.find(project => project.id === id);
 if (!existing && daily.projects.length >= 30) {
  toast('Достигнут лимит в 30 проектов. Можно переиспользовать карточку старого проекта.');
  return;
 }
 const project = existing ?? { title: '', detail: '', area: '', active: true };
 const areaOptions = state.areas.map(area => '<option value="' + e(area.id) + '"' +
  (project.area === area.id ? ' selected' : '') + '>' + e(area.title) + '</option>').join('');
 showDialog('<h2 id="dialog-title">' + (existing ? 'Настройки проекта' : 'Новый проект') +
  '</h2><form id="project-form">' + field('title', 'Название', project.title, 80) +
  field('detail', 'Для кого сервис и какую проблему решает', project.detail, 240, true) +
  '<label for="f-area">Связь с матрицей</label><select name="area" id="f-area"><option value="">Без привязки</option>' +
  areaOptions + '</select><label class="check-label"><input type="checkbox" name="active"' +
  (project.active ? ' checked' : '') + '> Активный проект</label>' +
  '' +
  buttons() + '</form>', 'ПРОЕКТЫ');
 $('#project-form').onsubmit = ev => {
  ev.preventDefault();
  const form = new FormData(ev.target);
  const next = clone(state);
  next.daily = D.data(next);
  const record = {
   id: existing?.id ?? (crypto.randomUUID ? crypto.randomUUID() : 'project-' + Date.now()),
   title: form.get('title').trim(),
   detail: form.get('detail').trim(),
   area: form.get('area'),
   active: form.has('active'),
  };
  const pos = next.daily.projects.findIndex(entry => entry.id === record.id);
  if (pos === -1) next.daily.projects.push(record);
  else next.daily.projects[pos] = record;
  submit(next);
 };
}

function cell(c,large){
 if(c.type==='goal')return '<button class="cell goal-cell" data-act="goal" title="'+e(state.goal.title)+'">'+e(state.goal.title)+'</button>';
 const a=state.areas[c.area];
 if(c.type==='area')return '<button class="cell area-cell" style="'+theme(c.area)+'" data-act="'+(large?'edit-area':'area')+'" data-i="'+c.area+'" title="Открыть направление '+e(a.title)+'">'+e(a.title)+'</button>';
 const t=a.actions[c.action];
 return '<button class="cell '+t.status+(t.focus?' focused':'')+'" data-act="task" data-i="'+c.area+'" data-j="'+c.action+'" title="'+e(t.title+' · '+labels[t.status])+'">'+e(t.title)+'</button>';
}
function fullGrid(){return '<div class="matrix" aria-label="Матрица Мандалы 9 на 9">'+C.cells(state).map((block,b)=>'<div class="block '+(b===4?'central':'')+'" style="'+(b===4?'':theme(C.positions.indexOf(b)))+'">'+block.map(c=>cell(c)).join('')+'</div>').join('')+'</div>';}
function renderMatrix(){
 const a=state.areas[selected],done=a.actions.filter(t=>t.status==='done').length;
 let content='';
 if(mode==='full')content='<p class="mobile-hint">Прокручивай матрицу вбок или выбери «Направления».</p><div class="matrix-shell">'+fullGrid()+'<div class="matrix-caption"><span>Нажми на ячейку, чтобы раскрыть или изменить её</span><span class="legend"><span>✓ готово</span><span>━ в работе</span><span>• фокус</span></span></div></div>';
 else if(mode==='areas')content='<div class="areas-grid">'+state.areas.map((a,i)=>'<button class="area-card" style="'+theme(i)+'" data-act="area" data-i="'+i+'"><span class="area-num">0'+(i+1)+' / НАПРАВЛЕНИЕ</span><h3>'+e(a.title)+'</h3><p>'+e(a.tagline)+'</p><small>'+a.actions.filter(t=>t.status==='done').length+' из 8 шагов →</small></button>').join('')+'</div>';
 else content='<div class="direction-header"><h3>'+e(a.title)+'</h3><button class="btn small" data-act="edit-area" data-i="'+selected+'">✎ Изменить</button></div><div class="matrix-shell"><div class="focus-matrix" style="'+theme(selected)+'">'+Array.from({length:9},(_,p)=>cell(p===4?{type:'area',area:selected}:{type:'action',area:selected,action:C.positions.indexOf(p)},true)).join('')+'</div></div>';
 const side='<aside class="matrix-aside"><div class="side-card"><span class="eyebrow">ВЫБРАННОЕ НАПРАВЛЕНИЕ · 0'+(selected+1)+'</span><h3>'+e(a.tagline)+'</h3><p>'+e(a.description)+'</p><button class="btn" data-act="area" data-i="'+selected+'">Открыть '+e(a.title)+' →</button><div class="mini-progress"><span>Прогресс направления</span><span>'+done+' / 8</span></div><div class="progress-track"><i style="width:'+done/8*100+'%"></i></div></div><div class="side-card tip"><div class="tip-icon">✳</div><span class="eyebrow">МАЛЕНЬКИЙ ШАГ СЕГОДНЯ</span><h3>Не нужно делать<br>всё одновременно.</h3><p>Выбери три действия на неделю. Для каждого определи ближайший понятный результат.</p><button class="text-btn" data-view="actions">Выбрать фокус →</button></div><p class="draft-note">Это твой стартовый черновик. Перепиши шаги под себя и задай измеримую цель дохода.</p></aside>';
 $('#view-content').innerHTML='<div class="section-bar"><div><h3>Карта твоего движения <small>1 цель · 8 направлений</small></h3></div><div class="segmented" aria-label="Вид матрицы"><button data-mode="full" class="'+(mode==='full'?'active':'')+'">Матрица 9×9</button><button data-mode="areas" class="'+(mode==='areas'?'active':'')+'">Направления</button></div></div>'+(mode==='areas'?content:'<div class="matrix-layout"><div>'+content+'</div>'+side+'</div>');
}
function taskRow({t,a,i,j}){
 const overdue=t.due&&t.due<localDate()&&t.status!=='done';
 return '<div class="task-row '+(t.status==='done'?'is-done':'')+'"><button class="task-check '+(t.status==='done'?'checked':'')+'" data-act="toggle" data-i="'+i+'" data-j="'+j+'" aria-label="'+e((t.status==='done'?'Вернуть в работу: ':'Завершить: ')+t.title)+'" aria-pressed="'+(t.status==='done')+'">'+(t.status==='done'?'✓':'')+'</button><button class="task-body" data-act="task" data-i="'+i+'" data-j="'+j+'"><strong>'+e(t.title)+'</strong><small>'+e(a.title)+(t.due?' · '+dateFmt(t.due):'')+(overdue?' · Срок прошёл':'')+'</small></button><span class="badge '+(overdue?'overdue':t.status)+'">'+labels[t.status]+'</span><button class="star-btn '+(t.focus?'selected':'')+'" data-act="focus-toggle" data-i="'+i+'" data-j="'+j+'" aria-pressed="'+t.focus+'" aria-label="'+e((t.focus?'Убрать из фокуса: ':'Добавить в фокус: ')+t.title)+'">'+(t.focus?'★':'☆')+'</button></div>';
}
function renderActions(){
 const isFocus=view==='focus';
 $('#view-content').innerHTML='<div class="section-bar"><h3>'+(isFocus?'На этой неделе':'Все действия')+'</h3>'+(isFocus?'<button class="btn small" data-view="actions">Выбрать действия →</button>':'<span class="eyebrow">ЗВЁЗДОЧКА → ФОКУС НЕДЕЛИ</span>')+'</div>'+(!isFocus?'<div class="filter-row"><input id="search" type="search" placeholder="Найти действие…" aria-label="Поиск действий" value="'+e(search)+'"><select id="area-filter" aria-label="Фильтр направлений"><option value="">Все направления</option>'+state.areas.map((a,i)=>'<option value="'+i+'" '+(String(i)===filterArea?'selected':'')+'>'+e(a.title)+'</option>').join('')+'</select><select id="status-filter" aria-label="Фильтр статуса"><option value="">Любой статус</option>'+Object.entries(labels).map(([v,l])=>'<option value="'+v+'" '+(v===filterStatus?'selected':'')+'>'+l+'</option>').join('')+'</select></div>':'')+'<div class="task-list" id="tasks"></div>';
 renderTaskList();
}
function renderTaskList(){
 const isFocus=view==='focus',rows=all().filter(({t,i})=>isFocus?t.focus:(!filterArea||String(i)===filterArea)&&(!filterStatus||t.status===filterStatus)&&t.title.toLowerCase().includes(search.toLowerCase()));
 $('#tasks').innerHTML=rows.length?rows.map(taskRow).join(''):'<div class="empty-state"><span class="goal-symbol">◎</span><h3>'+(isFocus?'Освободи место для главного':'Ничего не найдено')+'</h3><p>'+(isFocus?'Отметь звёздочкой до трёх действий в списке. Они появятся здесь — твой небольшой план на ближайшую неделю.':'Попробуй другой запрос или убери фильтры.')+'</p>'+(isFocus?'<button class="btn primary" data-view="actions">Выбрать фокус недели</button>':'')+'</div>';
}
function renderReviews(){
 $('#view-content').innerHTML='<div class="section-bar"><h3>Твои еженедельные итоги</h3><button class="btn primary" data-act="review">＋ Записать итог</button></div>'+(state.reviews.length?'<div class="review-grid">'+state.reviews.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(r=>'<article class="review-card"><h3>'+dateFmt(r.date)+'</h3><h4>Что получилось</h4><p>'+e(r.win)+'</p><h4>Что понял</h4><p>'+e(r.lesson)+'</p><h4>Следующий шаг</h4><p>'+e(r.next)+'</p><button class="text-btn" data-act="review" data-id="'+e(r.id)+'">Редактировать</button><button class="text-btn" data-act="delete-review" data-id="'+e(r.id)+'">Удалить</button></article>').join('')+'</div>':'<div class="empty-state"><span class="goal-symbol">◷</span><h3>Пять минут для себя</h3><p>В конце недели запиши одну победу, один вывод и следующий шаг. Так ты увидишь изменения, которые легко не заметить.</p><button class="btn" data-act="review">Записать первый итог</button></div>');
}
function showDialog(html,kicker){$('#dialog-content').innerHTML=html;$('#dialog-kicker').textContent=kicker||'ТВОЙ СЛЕДУЮЩИЙ ШАГ';if(!$('#editor').open)$('#editor').showModal();}
function buttons(){return '<div class="dialog-actions"><button type="button" class="btn" data-act="close">Отмена</button><button class="btn primary" type="submit">Сохранить изменения</button></div><p id="form-error" class="error" role="alert"></p>';}
function field(name,label,value,max,textarea){return '<label for="f-'+name+'">'+label+'</label>'+(textarea?'<textarea id="f-'+name+'" name="'+name+'" maxlength="'+max+'">'+e(value)+'</textarea>':'<input id="f-'+name+'" name="'+name+'" maxlength="'+max+'" value="'+e(value)+'" required>');}
function goalEditor(){
 const g=state.goal;showDialog('<h2 id="dialog-title">Главная цель</h2><p>Сформулируй результат, который можно проверить.</p><form id="goal-form">'+field('title','Формулировка цели',g.title,180)+field('description','Зачем это тебе',g.description,2000,true)+'<label for="f-deadline">Дата подведения итогов</label><input id="f-deadline" type="date" name="deadline" value="'+e(g.deadline)+'"><div class="form-row"><div><label for="f-target">Цель дохода, ₽ / месяц</label><input id="f-target" type="number" min="0" max="1000000000000" step="1" name="target" value="'+g.target+'"></div><div><label for="f-current">Текущий доход, ₽ / месяц</label><input id="f-current" type="number" min="0" max="1000000000000" step="1" name="current" value="'+g.current+'"></div></div><p class="small-note">0 в поле цели — сумма ещё не выбрана. Показатели вводятся вручную.</p>'+field('notes','Критерии успеха и заметки',g.notes,5000,true)+buttons()+'</form>','ЦЕНТР МАТРИЦЫ');
 $('#goal-form').onsubmit=ev=>{ev.preventDefault();const f=new FormData(ev.target),next=clone(state);next.goal={title:f.get('title').trim(),description:f.get('description').trim(),deadline:f.get('deadline'),target:Number(f.get('target')),current:Number(f.get('current')),notes:f.get('notes').trim()};submit(next);};
}
function taskEditor(i,j){
 const t=state.areas[i].actions[j];showDialog('<h2 id="dialog-title">Один конкретный шаг</h2><p>'+e(state.areas[i].title)+' · Действие '+(j+1)+' из 8</p><form id="task-form">'+field('title','Что сделать',t.title,180)+'<div class="form-row"><div><label for="f-status">Статус</label><select id="f-status" name="status">'+Object.entries(labels).map(([v,l])=>'<option value="'+v+'" '+(t.status===v?'selected':'')+'>'+l+'</option>').join('')+'</select></div><div><label for="f-due">Срок, если нужен</label><input id="f-due" name="due" type="date" value="'+e(t.due)+'"></div></div>'+field('notes','Как поймёшь, что готово? Заметки и следующий шаг',t.notes,5000,true)+'<label class="check-label"><input type="checkbox" name="focus" '+(t.focus?'checked':'')+'> Включить в фокус недели (до 3 действий)</label>'+buttons()+'</form>');
 $('#task-form').onsubmit=ev=>{ev.preventDefault();const f=new FormData(ev.target),next=clone(state);Object.assign(next.areas[i].actions[j],{title:f.get('title').trim(),status:f.get('status'),due:f.get('due'),notes:f.get('notes').trim(),focus:f.has('focus')});submit(next);};
}
function areaEditor(i){const a=state.areas[i];showDialog('<h2 id="dialog-title">Направление '+(i+1)+'</h2><form id="area-form">'+field('title','Название',a.title,80)+field('tagline','Главный результат направления',a.tagline,150)+field('description','Почему это важно',a.description,2000,true)+buttons()+'</form>','ОДНА ИЗ ВОСЬМИ ОПОР');$('#area-form').onsubmit=ev=>{ev.preventDefault();const f=new FormData(ev.target),next=clone(state);for(const k of ['title','tagline','description'])next.areas[i][k]=f.get(k).trim();submit(next);};}
function reviewEditor(id){
 const r=state.reviews.find(x=>x.id===id)||{id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),date:localDate(),win:'',lesson:'',next:''};showDialog('<h2 id="dialog-title">Оглянуться на неделю</h2><form id="review-form"><label for="f-date">Дата</label><input id="f-date" name="date" type="date" required value="'+e(r.date)+'">'+field('win','Что получилось?',r.win,3000,true)+field('lesson','Что понял? Что мешало?',r.lesson,3000,true)+field('next','Что сделаешь дальше?',r.next,3000,true)+buttons()+'</form>','ЗАМЕЧАЙ СВОЙ ПРОГРЕСС');
 $('#review-form').onsubmit=ev=>{ev.preventDefault();const f=new FormData(ev.target),next=clone(state),entry={id:r.id,date:f.get('date'),win:f.get('win').trim(),lesson:f.get('lesson').trim(),next:f.get('next').trim()};if(!entry.win&&!entry.lesson&&!entry.next){$('#form-error').textContent='Добавь хотя бы одну мысль.';return;}const idx=next.reviews.findIndex(x=>x.id===r.id);if(idx<0)next.reviews.push(entry);else next.reviews[idx]=entry;submit(next);};
}
function submit(next){try{C.validate(next);if(commit(next)){$('#editor').close();toast('Изменения сохранены');}}catch(err){$('#form-error').textContent=err.message;}}
function exportData(data=pendingState||state,name='mandala-'+localDate()+'.json', message='Резервная копия подготовлена'){const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);toast(message);}
function help(){showDialog('<h2 id="dialog-title">Одна цель. Восемь опор.</h2><p>Мандала 9×9 помогает превратить большое намерение в конкретные действия. Это формат планирования, связанный с методом Харады; здесь — его практическая адаптация.</p><div class="help-grid"><div><b>01 · Центр.</b> Запиши главную цель и дату проверки результата.</div><div><b>02 · Восемь направлений.</b> Вокруг центра — то, что поможет прийти к цели. Каждое направление повторяется в центре своего блока.</div><div><b>03 · 64 действия.</b> В каждом внешнем блоке восемь шагов. Нажимай на ячейки, уточняй результат, срок и статус.</div><div><b>04 · Ритм.</b> Выбери три действия на неделю. В конце недели запиши итоги и обнови фокус.</div></div><p class="small-note">Процент показывает долю выполненных действий, а не вероятность достижения цели. Повторяющиеся привычки можно возвращать в работу после очередного цикла.</p><div class="dialog-actions"><button class="btn primary" data-act="close">Понятно, начнём</button></div>','КАК ПОЛЬЗОВАТЬСЯ');}
function settings(){
 let config='';try{config=localStorage.getItem(CONFIG)||'';}catch{}
 showDialog('<h2 id="dialog-title">Данные и облако</h2><p>Изменения сохраняются в этом браузере после кнопки «Сохранить» или отметки действия. Для другого устройства используй JSON-копию или Firebase.</p>'+(storageError?'<div class="notice error">'+e(storageError)+'</div>':'')+'<div class="settings-block"><h3>Резервные копии</h3><div class="settings-buttons"><button class="btn" data-act="export">↓ Скачать JSON</button><button class="btn" data-act="import">↑ Импорт JSON</button><button class="btn" data-act="restore">Вернуть предыдущую копию</button></div><p class="small-note">Очистка данных браузера удалит локальную матрицу. Экспортируй копию время от времени. Перед импортом текущая версия остаётся в предыдущей копии.</p></div><div class="settings-block"><h3>Firebase · перенос между устройствами</h3><p class="small-note">Создай проект и настрой доступ по инструкции <a href="SETUP.html" target="_blank" rel="noopener">Подключение и запуск →</a>. Синхронизация по кнопке: сначала загрузи облачную версию, затем сохрани изменения в облако.</p><label for="firebase-config">Конфигурация веб-приложения Firebase</label><textarea id="firebase-config" spellcheck="false" placeholder=\'{"apiKey":"…","authDomain":"…","projectId":"…","appId":"…"}\'>'+e(config)+'</textarea><p class="small-note">Можно вставить JSON или целиком блок const firebaseConfig = { … }. Без сервисных ключей и паролей.</p><div class="settings-buttons"><button class="btn" data-act="cloud-init">1. Подключить проект</button><button class="btn primary" data-act="cloud-login" '+(!cloud?'disabled':'')+'>2. Войти через Google</button></div><div id="cloud-status" class="cloud-status" role="status"></div><div class="settings-buttons"><button class="btn" data-act="cloud-load" '+(!cloud?.auth.currentUser?'disabled':'')+'>↓ Загрузить из облака</button><button class="btn" data-act="cloud-save" '+(!cloud?.auth.currentUser?'disabled':'')+'>↑ Сохранить в облако</button><button class="btn" data-act="cloud-logout" '+(!cloud?.auth.currentUser?'disabled':'')+'>Выйти</button></div><p class="small-note">Облако не перезаписывается автоматически. Если версия изменилась на другом устройстве, приложение остановит запись. Сначала сохрани свою JSON-копию, затем загрузи актуальную версию.</p></div>','ТВОИ ДАННЫЕ — ПОД КОНТРОЛЕМ');updateCloudUI();
}
function updateCloudUI(){
 const el=$('#cloud-status');if(el)el.textContent=cloudMessage||(cloud?.auth.currentUser?'Вход выполнен: '+cloud.auth.currentUser.email:cloud?'Проект подключён. Войди в Google.':'Облако ещё не подключено.');
 ['cloud-load','cloud-save','cloud-logout'].forEach(act=>{const b=$('[data-act="'+act+'"]');if(b)b.disabled=cloudBusy||!cloud?.auth.currentUser;});
 const b=$('[data-act="cloud-login"]');if(b)b.disabled=cloudBusy||!cloud;
 const b2=$('[data-act="cloud-init"]');if(b2)b2.disabled=cloudBusy;saveStatus();
}
async function cloudInit(){
 if(cloudBusy)return;
 let config;try{
  let raw=$('#firebase-config').value.trim();raw=raw.replace(/^(?:const|let|var)\s+firebaseConfig\s*=\s*/,'').replace(/;\s*$/,'');
  // Parse config data without executing pasted JavaScript.
  raw=raw.replace(/([{,]\s*)([A-Za-z][A-Za-z0-9]*)(\s*:)/g,'$1"$2"$3').replace(/,\s*}/g,'}');
  config=JSON.parse(raw);for(const k of ['apiKey','authDomain','projectId','appId'])if(typeof config[k]!=='string'||!config[k])throw Error('Нужно заполнить '+k);
 }catch(err){cloudMessage='Не удалось прочитать конфигурацию: '+err.message;updateCloudUI();return;}
 if(location.protocol==='file:'){cloudMessage='Для Firebase открой сайт по HTTPS (например, GitHub Pages). Локальная матрица уже работает.';updateCloudUI();return;}
 cloudBusy=true;cloudMessage='Подключение Firebase…';updateCloudUI();
 try{
  const base='https://www.gstatic.com/firebasejs/13.3.0/';
  const [appSDK,authSDK,dbSDK]=await Promise.all([import(base+'firebase-app.js'),import(base+'firebase-auth.js'),import(base+'firebase-firestore.js')]);
  if(cloud){cloud.unsubscribe?.();await authSDK.signOut(cloud.auth);await appSDK.deleteApp(cloud.app);}
  const app=appSDK.initializeApp(config),auth=authSDK.getAuth(app),db=dbSDK.getFirestore(app);
  cloud={app,auth,db,authSDK,dbSDK,revision:null,userId:null};
  await auth.authStateReady();
  cloud.unsubscribe=authSDK.onAuthStateChanged(auth,user=>{if(cloud.userId!==user?.uid){cloud.revision=null;cloud.userId=user?.uid||null;}updateCloudUI();});
  localStorage.setItem(CONFIG,JSON.stringify(config,null,2));cloudMessage='Проект подключён. '+(auth.currentUser?'Аккаунт: '+auth.currentUser.email+'. UID: '+auth.currentUser.uid:'Нажми «Войти через Google».');
 }catch(err){cloudMessage=cloudError(err);}finally{cloudBusy=false;updateCloudUI();}
}
function cloudError(err){const codes={'auth/unauthorized-domain':'Добавь домен сайта в Authentication → Settings → Authorized domains.','auth/popup-blocked':'Разреши всплывающее окно и снова нажми вход.','auth/popup-closed-by-user':'Окно входа закрыто. Можно попробовать ещё раз.','auth/operation-not-allowed':'Включи Google в Firebase Authentication → Sign-in method.','permission-denied':'Нет доступа: проверь правила Firestore и UID владельца.','unavailable':'Облако недоступно. Локальные данные остаются в браузере.','resource-exhausted':'Достигнут лимит Firebase. Локальная версия доступна.'};return codes[err.code]||('Не удалось выполнить операцию: '+err.message);}
async function cloudLogin(){
 if(!cloud||cloudBusy)return;
 cloudBusy=true;cloudMessage='Ожидаем вход в Google…';updateCloudUI();
 try{await cloud.authSDK.signInWithPopup(cloud.auth,new cloud.authSDK.GoogleAuthProvider());cloudMessage='Вход выполнен: '+cloud.auth.currentUser.email+'. UID: '+cloud.auth.currentUser.uid+'. Для существующей матрицы сначала нажми «Загрузить из облака».';}catch(err){cloudMessage=cloudError(err);}finally{cloudBusy=false;updateCloudUI();}
}
function cloudRef(){return cloud.dbSDK.doc(cloud.db,'users',cloud.auth.currentUser.uid,'matrices','main');}
async function cloudLoad(){
 if(!cloud?.auth.currentUser||cloudBusy)return;
 if(!confirm('Заменить локальную матрицу облачной? Текущая останется в предыдущей копии. Для отдельного архива сначала скачай JSON.'))return;
 cloudBusy=true;cloudMessage='Читаем облачную версию…';updateCloudUI();
 try{
  const snap=await cloud.dbSDK.getDocFromServer(cloudRef());
  if(!snap.exists()){cloud.revision=0;cloudMessage='В облаке пока пусто. Можно сохранить текущую матрицу.';return;}
  const doc=snap.data(),data=C.validate(JSON.parse(doc.payload));
  if(commit(data)){cloud.revision=doc.revision;cloudMessage='Загружена версия '+doc.revision+'. На устройстве тоже сохранено.';}
 }catch(err){cloudMessage=cloudError(err);}finally{cloudBusy=false;updateCloudUI();}
}
async function cloudSave(){
 if(!cloud?.auth.currentUser||cloudBusy)return;
 cloudBusy=true;cloudMessage='Сохраняем облачную версию…';updateCloudUI();
 try{
  const payload=JSON.stringify(C.validate(state)),ref=cloudRef(),expected=cloud.revision;
  const revision=await cloud.dbSDK.runTransaction(cloud.db,async tx=>{
   const snap=await tx.get(ref);
   const rev=C.nextRevision(snap.exists()?snap.data().revision:null,expected);
   tx.set(ref,{payload,revision:rev,updatedAt:cloud.dbSDK.serverTimestamp()});return rev;
  });
  cloud.revision=revision;cloudMessage='Облачная версия '+revision+' сохранена. На другом устройстве нажми «Загрузить из облака».';
 }catch(err){cloudMessage=cloudError(err);}finally{cloudBusy=false;updateCloudUI();}
}
document.addEventListener('click',async ev=>{
 const b=ev.target.closest('button,a.brand');if(!b)return;
 if(b.matches('a.brand')){ev.preventDefault();view='today';viewedDay=null;render();return;}
 if(b.dataset.view){view=b.dataset.view;if(view==='today'){viewedDay=null;openSteps=new Set([0]);}render();return;}
 if(b.dataset.mode){mode=b.dataset.mode;render();return;}
 const act=b.dataset.act,i=Number(b.dataset.i),j=Number(b.dataset.j);
 if(act==='close')$('#editor').close();
 else if(act==='goal')goalEditor();
 else if(act==='project')editProject(b.dataset.id);
 else if(act==='plan-start')startPlan();
 else if(act==='plan-jump' && i>=0 && i<30){viewedDay=i;openSteps=new Set([0]);renderToday();}
 else if(act==='plan-today'){viewedDay=null;openSteps=new Set([0]);renderToday();}
 else if(act==='plan-toggle'){
  const month=P.stateOf(state);
  if(month.start && i>=0 && i<30 && j>=0 && j<5 && P.addDays(month.start,i)<=localDate()){
   mutate(next=>{next.month.checks[i]^=1<<j;});
   $('[data-act="plan-toggle"][data-j="'+j+'"]')?.focus({preventScroll:true});
  }
 }
 else if(act==='chart-point'){
  const point=P.totals(P.stateOf(state),localDate()).series[i];
  if(point)$('#chart-readout').textContent='День '+point.day+' · '+money(point.balance);
 }
 else if(act==='activity')activityEditor(b.dataset.date,b.dataset.source);
 else if(act==='payment')paymentEditor(b.dataset.id);
 else if(act==='payments')paymentHistory();
 else if(act==='payment-delete'&&confirm('Удалить эту запись об оплате?')){
  if(mutate(next=>{next.month.payments=next.month.payments.filter(item=>item.id!==b.dataset.id);}))paymentHistory();
 }
 else if(act==='report-download')downloadReport();
 else if(act==='month-import')$('#month-file').click();
 else if(act==='help')help();
 else if(act==='settings')settings();
 else if(act==='task')taskEditor(i,j);
 else if(act==='area'){selected=i;mode='detail';view='matrix';render();}
 else if(act==='edit-area')areaEditor(i);
 else if(act==='toggle')mutate(s=>{const t=s.areas[i].actions[j];t.status=t.status==='done'?'todo':'done';if(t.status==='done')t.focus=false;});
 else if(act==='focus-toggle'){const t=state.areas[i].actions[j];if(!t.focus&&C.stats(state).focus>=3){toast('В фокусе уже 3 действия. Убери одно, чтобы выбрать новое.');return;}mutate(s=>s.areas[i].actions[j].focus=!t.focus);}
 else if(act==='review')reviewEditor(b.dataset.id);
 else if(act==='delete-review'&&confirm('Удалить эту запись?'))mutate(s=>s.reviews=s.reviews.filter(r=>r.id!==b.dataset.id));
 else if(act==='export')exportData();
 else if(act==='import')$('#import-file').click();
 else if(act==='restore'){
  try{const raw=localStorage.getItem(BACKUP);if(!raw){toast('Предыдущей копии пока нет.');return;}const data=C.validate(JSON.parse(raw));if(confirm('Вернуть предыдущую локальную копию?')){storageError='';lastRaw=localStorage.getItem(KEY);if(commit(data)){$('#editor').close();toast('Предыдущая копия восстановлена');}}}catch(err){toast('Восстановление не удалось: '+err.message);}
 }
 else if(act==='print'){const prev={view,mode};view='matrix';mode='full';render();const restore=()=>{view=prev.view;mode=prev.mode;render();};window.addEventListener('afterprint',restore,{once:true});window.print();}
 else if(act==='cloud-init')await cloudInit();
 else if(act==='cloud-login')await cloudLogin();
 else if(act==='cloud-load')await cloudLoad();
 else if(act==='cloud-save')await cloudSave();
 else if(act==='cloud-logout'&&cloud&&!cloudBusy){try{await cloud.authSDK.signOut(cloud.auth);cloud.revision=null;cloudMessage='Вход завершён. Локальная матрица остаётся на этом устройстве.';updateCloudUI();}catch(err){toast(cloudError(err));}}
});
document.addEventListener('input',ev=>{if(ev.target.id==='search'){search=ev.target.value;renderTaskList();}});
document.addEventListener('change',ev=>{if(ev.target.id==='plan-day'){viewedDay=Number(ev.target.value);openSteps=new Set([0]);renderToday();$('#plan-day').focus();}if(ev.target.id==='area-filter'){filterArea=ev.target.value;renderTaskList();}if(ev.target.id==='status-filter'){filterStatus=ev.target.value;renderTaskList();}});
document.addEventListener('toggle', event => {
 const slot=event.target.dataset?.slot;
 if(slot===undefined || !event.target.isConnected)return;
 if(event.target.open)openSteps.add(Number(slot));
 else openSteps.delete(Number(slot));
},true);
$('#month-file').onchange=async event=>{
 const file=event.target.files[0];
 event.target.value='';
 if(!file)return;
 try{
  if(file.size>400000)throw Error('Файл плана больше 400 КБ.');
  previewNewMonth(P.validatePlan(JSON.parse(await file.text())));
 }catch(error){toast('Не удалось загрузить план: '+error.message);}
};
$('#import-file').onchange=async ev=>{const file=ev.target.files[0];ev.target.value='';if(!file)return;try{if(file.size>2000000)throw Error('Размер файла больше 2 МБ');const data=C.validate(JSON.parse(await file.text()));if(!confirm('Заменить матрицу данными из «'+file.name+'»? Текущая версия останется в предыдущей копии.'))return;storageError='';if(commit(data)){$('#editor').close();toast('Матрица импортирована');}}catch(err){toast('Импорт отменён: '+err.message);}};
window.addEventListener('storage',ev=>{if(ev.key===KEY&&ev.newValue!==lastRaw){if($('#editor').open){toast('Матрица изменена в другой вкладке. Закрой редактор и обнови страницу.');return;}try{state=C.validate(JSON.parse(ev.newValue));lastRaw=ev.newValue;render();toast('Подхвачены изменения из другой вкладки');}catch{toast('Данные в другой вкладке изменились. Обнови страницу.');}}});
render();
if(storageError)toast(storageError);
function updateDate(){
 if(!document.hidden && localDate()!==lastRenderedDate)render();
}
document.addEventListener('visibilitychange',updateDate);
setInterval(updateDate,30000);
})();
