const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const core=require('../core.js');
const ctx={window:{}};vm.runInNewContext(fs.readFileSync(require.resolve('../seed.js'),'utf8'),ctx);
const fresh=()=>JSON.parse(JSON.stringify(ctx.window.MANDALA_SEED));
test('81 cells, 64 distinct actions and each area linked twice',()=>{
 const s=fresh(),cells=core.cells(s).flat();
 assert.equal(cells.length,81);assert.equal(cells.filter(c=>c.type==='goal').length,1);
 const actions=cells.filter(c=>c.type==='action');assert.equal(actions.length,64);
 assert.equal(new Set(actions.map(c=>s.areas[c.area].actions[c.action].id)).size,64);
 for(let i=0;i<8;i++)assert.equal(cells.filter(c=>c.type==='area'&&c.area===i).length,2);
});
test('roundtrip preserves notes, dates, focus, reviews and money',()=>{
 const s=fresh();s.goal.target=250000;s.goal.current=12300;
 Object.assign(s.areas[1].actions[2],{status:'doing',focus:true,notes:'Текст <img src=x onerror=alert(1)> & "кавычки"',due:'2027-01-15'});
 s.reviews.push({id:'r1',date:'2026-11-15',win:'Победа',lesson:'Вывод',next:'Шаг'});
 const r=core.validate(JSON.parse(JSON.stringify(s)));assert.deepEqual(r,s);assert.deepEqual(core.stats(r),{done:0,doing:1,focus:1,total:64});
});
test('reject malformed imports without replacing source',()=>{
 const cases=[
 s=>s.areas.pop(),s=>s.areas[0].actions.pop(),s=>s.areas[0].actions[0].status='fake',
 s=>s.goal.current=-1,s=>s.goal.target=Infinity,s=>s.areas[1].id=s.areas[0].id,
 s=>s.areas[0].actions[0].id=s.areas[0].actions[1].id,
 s=>s.areas[0].actions[0].title=' ',s=>s.areas[0].actions[0].due='bad',
 s=>s.areas[0].actions.slice(0,4).forEach(t=>t.focus=true),s=>s.reviews='bad'
 ];for(const bad of cases){const s=fresh();bad(s);assert.throws(()=>core.validate(s));}
 assert.doesNotThrow(()=>core.validate(fresh()));
});

test('cloud revision guards never silently overwrite another version',()=>{
 assert.equal(core.nextRevision(null,null),1);
 assert.equal(core.nextRevision(null,0),1);
 assert.equal(core.nextRevision(3,3),4);
 assert.throws(()=>core.nextRevision(3,null));
 assert.throws(()=>core.nextRevision(4,3));
 assert.throws(()=>core.nextRevision(null,3));
 assert.throws(()=>core.nextRevision('3',3));
});
test('invalid calendar dates rejected',()=>{
 const s=fresh();s.goal.deadline='2027-02-31';assert.throws(()=>core.validate(s));
});
