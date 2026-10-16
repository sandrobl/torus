const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {test} = require('node:test');
const html = fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
function preview(){
  const frames=new Map(),events={},controls={},elements=new Map();
  let next=0,draws=0,rebuilds=0,lastWidth;
  const document={hidden:false,addEventListener:(name,fn)=>events[name]=fn};
  const ctl={autoRotate:false,moving:0,update(){return this.moving-->0},addEventListener:(name,fn)=>controls[name]=fn};
  const st={w:2.5};
  const ctx=vm.createContext({document,ctl,st,scene:{},cam:{},
    renderer:{render(){draws++}},
    requestAnimationFrame:fn=>{frames.set(++next,fn);return next},cancelAnimationFrame:id=>frames.delete(id),
    render:()=>{rebuilds++;lastWidth=st.w},
    $:id=>{if(!elements.has(id))elements.set(id,{});return elements.get(id)}
  });
  const start=html.includes('// Preview scheduling')?html.indexOf('// Preview scheduling'):html.indexOf('let visible=true;');
  vm.runInContext(html.slice(start,html.indexOf('function fit()',start)>0?html.indexOf('function fit()',start):html.indexOf('function seeded(')),ctx);
  return {ctx,document,ctl,events,controls,st,elements,
    tick(){const batch=[...frames.values()];frames.clear();batch.forEach(fn=>fn())},
    get queued(){return frames.size},get draws(){return draws},get rebuilds(){return rebuilds},get lastWidth(){return lastWidth}
  };
}
test('stationary preview stops drawing and scheduling frames',()=>{
  const p=preview();p.controls.change();for(let i=0;i<5;i++)p.tick();
  const count=p.draws;assert.ok(count>0);for(let i=0;i<120;i++)p.tick();
  assert.equal(p.draws,count);assert.equal(p.queued,0);
});
test('rapid slider inputs rebuild once per frame with the latest value',()=>{
  const p=preview();
  const start=html.indexOf("for(const [id,key] of [['cathedral-width'");
  vm.runInContext(html.slice(start,html.indexOf('const SAVE_KEY=',start)),p.ctx);
  for(const value of [3,3.5,4,4.5,5])p.elements.get('#w').oninput({target:{value:String(value)}});
  assert.equal(p.rebuilds,0);assert.equal(p.queued,1);
  p.tick();assert.equal(p.rebuilds,1);assert.equal(p.lastWidth,5);
});
test('the cathedral bend slider schedules the latest angle for the next preview frame',()=>{
  const p=preview(),start=html.indexOf("for(const [id,key] of [['cathedral-width'");
  vm.runInContext(html.slice(start,html.indexOf('const SAVE_KEY=',start)),p.ctx);
  for(const angle of [60,75,85])p.elements.get('#cathedral-angle').oninput({target:{value:String(angle)}});
  assert.equal(p.st.cathedralBendAngle,85);assert.equal(p.rebuilds,0);assert.equal(p.queued,1);
  p.tick();assert.equal(p.rebuilds,1);
});
test('camera damping and automatic rotation keep updating until they stop',()=>{
  const p=preview();p.ctl.moving=3;
  assert.equal(typeof p.controls.change,'function','camera changes must wake the preview');
  p.controls.change();for(let i=0;i<6;i++)p.tick();
  assert.ok(p.draws>=3);assert.equal(p.queued,0);
  p.ctl.autoRotate=true;p.controls.change();
  const count=p.draws;for(let i=0;i<5;i++)p.tick();assert.equal(p.draws,count+5);
  p.ctl.autoRotate=false;for(let i=0;i<3;i++)p.tick();assert.equal(p.queued,0);
});
test('hidden tabs cancel scheduled work and resume with the latest changes',()=>{
  const p=preview();
  const start=html.indexOf("for(const [id,key] of [['cathedral-width'");
  vm.runInContext(html.slice(start,html.indexOf('const SAVE_KEY=',start)),p.ctx);
  p.elements.get('#w').oninput({target:{value:'4'}});
  p.document.hidden=true;p.events.visibilitychange();
  assert.equal(p.queued,0);p.tick();assert.equal(p.rebuilds,0);
  p.elements.get('#w').oninput({target:{value:'5'}});
  assert.equal(p.queued,0);
  p.document.hidden=false;p.events.visibilitychange();p.tick();
  assert.equal(p.rebuilds,1);assert.equal(p.lastWidth,5);assert.ok(p.draws>0);
});

test('selecting a stone changes the editor selection without rebuilding the ring',()=>{
  const buttons=[];let rebuilds=0,updates=0;
  const slots={appendChild:b=>buttons.push(b)};
  const ctx=vm.createContext({st:{emb:'krappen',side:1,stone:'white',sc:['white','white','white','white']},sel:2,
    ST:{white:['Diamond','#fff','#eee','#aaa']},$:()=>slots,
    document:{createElement:()=>({style:{},setAttribute(){}}),querySelectorAll:()=>[]},
    render:()=>{rebuilds++},updateControls:()=>{updates++}
  });
  vm.runInContext(html.slice(html.indexOf("  const nn=st.emb==='pave'"),html.indexOf('  const info=STONE_INFO[AA[sel]]')),ctx);
  buttons[0].onclick();
  assert.equal(vm.runInContext('sel',ctx),1);
  assert.equal(rebuilds,0);assert.equal(updates,1);
});
