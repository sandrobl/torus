const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {test} = require('node:test');
const html = fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const context = vm.createContext({THREE:{MathUtils:{
  clamp:(x,a,b)=>Math.max(a,Math.min(b,x)),
  smoothstep:(x,a,b)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)}
}}});
vm.runInContext(html.slice(html.indexOf('const M='),html.indexOf('const $='))+
  html.slice(html.indexOf('function innerRadius()'),html.indexOf('// Triangulate openings'))+
  html.slice(html.indexOf('function exportDescription()'),html.indexOf("$('#save').onclick")),context);
const api=vm.runInContext('({st,DEFAULT_CONFIG,EMB,ST,innerRadius,outerPeak,ringProfile,stoneSizes,stoneLevel,settingPlan,estimateCarats,exportDescription})',context);
const reset=overrides=>Object.assign(api.st,api.DEFAULT_CONFIG,{sc:[...api.DEFAULT_CONFIG.sc]},overrides);

test('5,832 boundary combinations keep valid dimensions, bore clearance and separated stone envelopes',()=>{
  let cases=0;
  for(const emb of Object.keys(api.EMB))for(const size of [48,54,76])for(const thickness of [1,1.9,4])
  for(const w of [4,6,10])for(const dome of [0,100,200])
  for(const bandProfile of ['flat','rounded','bevel','dshape'])for(const profile of ['flat','comfort']){
    reset({emb,size,thickness,w,dome,bandProfile,profile,side:2,mainStoneSize:5,sideStoneSize:3,fh:.4,pattern:'facets',patternDepth:.3,patternSpacing:1});
    const stones=api.settingPlan().sort((a,b)=>a.th-b.th);
    assert.equal(stones.length,emb==='pave'?15:5);
    assert.ok(Math.abs(2*Math.PI*api.innerRadius()-size)<1e-10);
    const bounds=[];
    for(const item of stones){
      assert.ok(Number.isFinite(item.d)&&Number.isFinite(item.th));
      assert.ok(item.d>0&&item.d<=w-.8+1e-10);
      const level=api.stoneLevel(item);
      assert.ok(level-.43*item.d>=api.innerRadius()+.08-1e-10);
      bounds.push({lo:item.th-Math.atan2(item.d/2,level-.012*item.d),hi:item.th+Math.atan2(item.d/2,level-.012*item.d)});
    }
    for(let i=1;i<bounds.length;i++)assert.ok(bounds[i].lo>bounds[i-1].hi,`${emb}: overlapping envelopes`);
    assert.ok(bounds.at(-1).hi-bounds[0].lo<2*Math.PI,'stones must not wrap onto each other');
    for(const y of [-w/2+.16,-w/4,0,w/4,w/2-.16])for(const a of [-Math.PI,-.5,0,.5,Math.PI]){
      const p=api.ringProfile(y,a);
      assert.ok(Number.isFinite(p.inner)&&Number.isFinite(p.outer));
      assert.ok(p.outer-p.inner>=.12-1e-10);
    }
    cases++;
  }
  assert.equal(cases,5832);
});

test('all supported stone weights are positive, finite and increase with size for both cuts',()=>{
  for(const stone of Object.keys(api.ST))for(const square of [false,true]){
    let previous=0;
    for(let tenth=5;tenth<=50;tenth++){
      const weight=api.estimateCarats(tenth/10,stone,square);
      assert.ok(Number.isFinite(weight)&&weight>previous);
      previous=weight;
    }
  }
  assert.ok(Math.abs(api.estimateCarats(6.5,'white')-1.03863175)<1e-10);
});

test('export counts, dimensions, and stone colors agree with the generated configuration',()=>{
  for(const emb of Object.keys(api.EMB))for(const side of [0,1,2]){
    reset({emb,side,size:60,stone:'white',sc:['blue','red','green','moissanite'],mainStoneSize:2,sideStoneSize:1});
    const plan=api.settingPlan(),text=api.exportDescription();
    assert.equal(text.split('\n').filter(line=>/^Stein \d/.test(line)).length,plan.length);
    assert.ok(text.includes('Innendurchmesser: 19.10 mm'));
    for(const stone of plan)assert.ok(text.includes(api.ST[stone.sk][0]+', '+stone.d.toFixed(2)+' mm'));
    assert.ok(!/NaN|Infinity|undefined/.test(text));
  }
  reset({stones:false});
  assert.equal(api.settingPlan().length,0);
  assert.ok(!/^Stein \d/m.test(api.exportDescription()));
});
