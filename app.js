(function(){
'use strict';
const KEY='mandala.v1',BACKUP='mandala.backup.v1',CONFIG='mandala.firebase.v1';
const $=s=>document.querySelector(s),clone=x=>JSON.parse(JSON.stringify(x)),e=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const C=MandalaCore,labels={todo:'Не начато',doing:'В работе',done:'Готово'};
const colors=[['#f3e4db','#e4c5b3','#965b40'],['#e9eddf','#ced9b9','#63754c'],['#e5eced','#bfd1d5','#557880'],['#f3eadd','#e4cfae','#9d7d46'],['#e8eee6','#c5d7c0','#597956'],['#eee8e2','#d9c9bd','#8b705b'],['#e9e8ed','#cfccdb','#77708b'],['#f2e7e3','#e1c5bb','#9b6a5b']];
let pendingState=null;
let state=clone(window.MANDALA_SEED),lastRaw=null,storageError='',view='matrix',mode=matchMedia('(max-width:760px)').matches?'areas':'full',selected=0,filterArea='',filterStatus='',search='',toastTimer,cloud=null,cloudMessage='',cloudBusy=false;
try{lastRaw=localStorage.getItem(KEY);if(lastRaw)state=C.validate(JSON.parse(lastRaw));else{C.validate(state);lastRaw=JSON.stringify(state);localStorage.setItem(KEY,lastRaw);}}catch(err){storageError='Не удалось прочитать сохранение. Исходные данные не перезаписаны. Открой «Данные и облако».';}
function toast(msg){$('#toast').textContent=msg;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),4500);}
function localDate(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function dateFmt(s){return s?new Date(s+'T12:00:00').toLocaleDateString('ru-RU',{day:'numeric',month:'short',year:'numeric'}):'Без срока';}
function theme(i){return '--pale:'+colors[i][0]+';--tone:'+colors[i][1]+';--deep:'+colors[i][2];}
function saveStatus(){const el=$('#save-state');el.classList.toggle('error',!!storageError);el.innerHTML='<i></i>'+e(storageError?'Ошибка сохранения — экспортируй данные':cloud&&cloud.auth.currentUser?'На устройстве · облако вручную':'Сохранено на устройстве');}
function commit(next){
 try{
  C.validate(next);pendingState=next;
  const now=localStorage.getItem(KEY);
  if(now!==lastRaw){toast('Матрица изменилась в другой вкладке. Обнови страницу перед сохранением.');return false;}
  if(storageError && now){toast('Сначала восстанови сохранение через раздел данных.');return false;}
  if(now)localStorage.setItem(BACKUP,now);
  next.updatedAt=new Date().toISOString();
  const raw=JSON.stringify(next);localStorage.setItem(KEY,raw);lastRaw=raw;state=next;pendingState=null;storageError='';render();return true;
 }catch(err){storageError=err.message;saveStatus();toast('Не сохранено: '+err.message+'. Скачай резервную копию.');return false;}
}
function all(){return state.areas.flatMap((a,i)=>a.actions.map((t,j)=>({t,a,i,j})));}
function mutate(fn){const next=clone(state);fn(next);return commit(next);}
function render(){
 const st=C.stats(state),g=state.goal;
 $('#goal-title').textContent=g.title;$('#goal-subtitle').textContent=g.description;$('#goal-date').textContent=dateFmt(g.deadline);
 const days=g.deadline?Math.ceil((new Date(g.deadline+'T00:00:00')-new Date(localDate()+'T00:00:00'))/86400000):null;
 $('#days-left').textContent=days===null?'свой ритм':days<0?'Пора пересмотреть горизонт':days===0?'День подведения итогов':'Осталось дней: '+days;
 $('#done-count').innerHTML=st.done+' <small>/ 64</small>';$('#doing-count').textContent=st.doing;$('#focus-count').innerHTML=st.focus+' <small>/ 3</small>';$('#total-bar').style.width=(st.done/64*100)+'%';
 $('#income').textContent=g.target?g.current.toLocaleString('ru-RU')+' / '+g.target.toLocaleString('ru-RU')+' ₽':'Задать цель →';
 $('#income-note').textContent=g.target?'факт / цель · редактируется вручную':'сумма пока не выбрана';
 document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===view);if(b.classList.contains('nav'))b.setAttribute('aria-current',b.dataset.view===view?'page':'false');});
 const titles={matrix:['Твоя большая цель.<span>По шагам.</span>','Собери то, что важно, в одну понятную картину.'],actions:['Действия.<span>Из намерения в результат.</span>','Все 64 шага: выбирай, уточняй, отмечай прогресс.'],focus:['Фокус недели.<span>Только главное.</span>','До трёх действий. Достаточно, чтобы двигаться вперёд.'],reviews:['Рефлексия.<span>Замечай движение.</span>','Что сработало, чему научился и какой шаг следующий.']};
 $('#page-title').innerHTML=titles[view][0];$('#page-description').textContent=titles[view][1];
 if(view==='matrix')renderMatrix();else if(view==='reviews')renderReviews();else renderActions();
 saveStatus();
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
 const g=state.goal;showDialog('<h2 id="dialog-title">Главная цель</h2><p>Что должно измениться через 12 месяцев? Сформулируй результат, который можно проверить.</p><form id="goal-form">'+field('title','Формулировка цели',g.title,180)+field('description','Зачем это тебе',g.description,2000,true)+'<label for="f-deadline">Дата подведения итогов</label><input id="f-deadline" type="date" name="deadline" value="'+e(g.deadline)+'"><div class="form-row"><div><label for="f-target">Цель дохода, ₽ / месяц</label><input id="f-target" type="number" min="0" max="1000000000000" step="1" name="target" value="'+g.target+'"></div><div><label for="f-current">Текущий доход, ₽ / месяц</label><input id="f-current" type="number" min="0" max="1000000000000" step="1" name="current" value="'+g.current+'"></div></div><p class="small-note">0 в поле цели — сумма ещё не выбрана. Показатели вводятся вручную.</p>'+field('notes','Критерии успеха и заметки',g.notes,5000,true)+buttons()+'</form>','ЦЕНТР МАТРИЦЫ');
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
function exportData(data=pendingState||state,name='mandala-'+localDate()+'.json'){const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);toast('Резервная копия подготовлена');}
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
 if(b.matches('a.brand')){ev.preventDefault();view='matrix';render();return;}
 if(b.dataset.view){view=b.dataset.view;render();return;}
 if(b.dataset.mode){mode=b.dataset.mode;render();return;}
 const act=b.dataset.act,i=Number(b.dataset.i),j=Number(b.dataset.j);
 if(act==='close')$('#editor').close();
 else if(act==='goal')goalEditor();
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
document.addEventListener('change',ev=>{if(ev.target.id==='area-filter'){filterArea=ev.target.value;renderTaskList();}if(ev.target.id==='status-filter'){filterStatus=ev.target.value;renderTaskList();}});
$('#import-file').onchange=async ev=>{const file=ev.target.files[0];ev.target.value='';if(!file)return;try{if(file.size>500000)throw Error('Размер файла больше 500 КБ');const data=C.validate(JSON.parse(await file.text()));if(!confirm('Заменить матрицу данными из «'+file.name+'»? Текущая версия останется в предыдущей копии.'))return;storageError='';if(commit(data)){$('#editor').close();toast('Матрица импортирована');}}catch(err){toast('Импорт отменён: '+err.message);}};
window.addEventListener('storage',ev=>{if(ev.key===KEY&&ev.newValue!==lastRaw){if($('#editor').open){toast('Матрица изменена в другой вкладке. Закрой редактор и обнови страницу.');return;}try{state=C.validate(JSON.parse(ev.newValue));lastRaw=ev.newValue;render();toast('Подхвачены изменения из другой вкладки');}catch{toast('Данные в другой вкладке изменились. Обнови страницу.');}}});
render();if(storageError)toast(storageError);
})();
