(function(root){
 const daily=typeof module!=='undefined'?require('./daily.js'):root.MandalaDaily;
 const plan=typeof module!=='undefined'?require('./plan.js'):root.MandalaPlan;
 const positions=[0,1,2,3,5,6,7,8];
 function validate(data){
  const str=(s,n)=>typeof s==='string'&&s.length<=n;
  const date=s=>s===''||(typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s);
  if(!data||data.version!==1||!data.goal||!Array.isArray(data.areas)||data.areas.length!==8)throw Error('Это не резервная копия Мандалы версии 1.');
  const g=data.goal;if(!str(g.title,180)||!g.title.trim()||!str(g.description,2000)||!str(g.notes,5000)||!date(g.deadline)||![g.target,g.current].every(v=>Number.isFinite(v)&&v>=0&&v<=1e12))throw Error('Некорректная главная цель.');
  const ids=new Set();let focused=0;
  data.areas.forEach(a=>{if(!a||!str(a.id,80)||ids.has(a.id)||!str(a.title,80)||!a.title.trim()||!str(a.tagline,150)||!str(a.description,2000)||!Array.isArray(a.actions)||a.actions.length!==8)throw Error('В каждом из 8 направлений должно быть 8 действий.');ids.add(a.id);a.actions.forEach(t=>{if(!t||!str(t.id,80)||ids.has(t.id)||!str(t.title,180)||!t.title.trim()||!str(t.notes,5000)||!['todo','doing','done'].includes(t.status)||typeof t.focus!=='boolean'||!date(t.due))throw Error('Некорректные данные действия.');ids.add(t.id);if(t.focus)focused++;});});
  if(focused>3)throw Error('В фокусе может быть не больше 3 действий.');
  if(!Array.isArray(data.reviews)||data.reviews.length>200||data.reviews.some(r=>!r||!str(r.id,80)||!date(r.date)||!str(r.win,3000)||!str(r.lesson,3000)||!str(r.next,3000)))throw Error('Некорректный журнал рефлексии.');
  if(data.daily!==undefined)daily.validate(data.daily);
  if(data.cycle!==undefined)plan.validateLegacy(data.cycle);
  if(data.month!==undefined)plan.validate(data.month);
  if(data.monthHistory!==undefined)plan.validateHistory(data.monthHistory);
  if(data.month?.start && data.monthHistory?.at(-1)?.end >= data.month.start)throw Error('Месяцы в резервной копии пересекаются.');
  if(JSON.stringify(data).length>300000)throw Error('Резервная копия слишком большая.');
  return data;
 }
 function cells(state){return Array.from({length:9},(_,block)=>Array.from({length:9},(_,cell)=>{if(block===4)return cell===4?{type:'goal'}:{type:'area',area:positions.indexOf(cell)};const area=positions.indexOf(block);return cell===4?{type:'area',area}:{type:'action',area,action:positions.indexOf(cell)};}));}
 function stats(s){const all=s.areas.flatMap(a=>a.actions);return{done:all.filter(x=>x.status==='done').length,doing:all.filter(x=>x.status==='doing').length,focus:all.filter(x=>x.focus).length,total:all.length};}
 function nextRevision(remote,expected){
  if(remote!==null&&(!Number.isSafeInteger(remote)||remote<1))throw Error('Некорректная версия облачного документа.');
  if(remote!==null&&(expected===null||remote!==expected))throw Error('В облаке есть другая версия. Скачай локальный JSON и сначала загрузи матрицу из облака.');
  if(remote===null&&expected!==null&&expected!==0)throw Error('Облачный документ изменился. Сначала загрузи его заново.');
  return (remote||0)+1;
 }
 const api={validate,cells,stats,positions,nextRevision};root.MandalaCore=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
