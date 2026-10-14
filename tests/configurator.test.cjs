const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');
const html = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
const modelCode = html.slice(html.indexOf('function innerRadius()'), html.indexOf('function holeFor('));
function model(overrides = {}) {
  const st = {size:54,profile:'comfort',stones:true,pattern:'none',patternDepth:.15,patternSpacing:2,thickness:1.9,w:6,dome:40,fh:.8,emb:'flush',side:1,sc:['blue','red','black','green'],stone:'white',...overrides};
  const ctx = vm.createContext({ st, THREE:{MathUtils:{clamp:(x,a,b)=>Math.max(a,Math.min(b,x)),smoothstep:(x,a,b)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)}}}});
  vm.runInContext(modelCode, ctx);
  return {st, run: code => vm.runInContext(code,ctx)};
}
test('no stones removes holes and stone-specific grooves without forgetting choices',()=>{
  for(const emb of ['flush','groove','karree','kanal','pave']) {
    const m=model({emb});
    const before=JSON.stringify(m.run('settingPlan()'));
    m.st.stones=false;
    assert.equal(m.run('settingPlan().length'),0);
    assert.ok(Math.abs(m.run('ringProfile(0).outer-outerBandRadius(0)'))<1e-10);
    m.st.stones=true;
    assert.equal(JSON.stringify(m.run('settingPlan()')),before);
  }
});
test('ring size changes bore circumference and thickness stays constant',()=>{
  for(const size of [48,54,76]) {
    const m=model({size,dome:0,profile:'flat'});
    assert.ok(Math.abs(m.run('ringProfile(0).inner*2*Math.PI')-size)<1e-10);
    assert.ok(Math.abs(m.run('ringProfile(0).outer-ringProfile(0).inner')-1.9)<1e-10);
  }
});
test('flat bore is straight and comfort bore opens at edges',()=>{
  const flat=model({profile:'flat'}), comfort=model({profile:'comfort'});
  assert.equal(flat.run('ringProfile(0).inner'),flat.run('ringProfile(2.84).inner'));
  assert.ok(comfort.run('ringProfile(2.84).inner-ringProfile(0).inner')>.1);
});
test('each pattern is recessed, responds to depth, and stays continuous at the seam',()=>{
  for(const pattern of ['lines','diagonal','chevron','waves','facets']) {
    const m=model({pattern,stones:false});
    let maxDepth=0;
    for(let i=0;i<50;i++) {
      const y=-2.5+i/10,a=-Math.PI+i*.13;
      const d=m.run(`patternDepthAt(${y},${a})`);
      assert.ok(d>=0&&d<=.15+1e-10);
      maxDepth=Math.max(maxDepth,d);
      m.st.patternDepth=.3;
      assert.ok(Math.abs(m.run(`patternDepthAt(${y},${a})`)-2*d)<1e-10);
      m.st.patternDepth=.15;
    }
    assert.ok(maxDepth>.1,pattern+' must be visible');
    assert.ok(Math.abs(m.run('patternDepthAt(1,-Math.PI)-patternDepthAt(1,Math.PI)'))<1e-10);
    assert.equal(m.run('patternDepthAt(2.84,0)'),0);
  }
});
test('pattern spacing changes geometry without cutting through the thinnest band',()=>{
  for(const pattern of ['lines','diagonal','chevron','waves','facets']) {
    const m=model({pattern,thickness:1,patternDepth:.3,emb:'kanal',dome:100});
    m.run('settingPlan()');
    const original=m.run('patternDepthAt(.7,.43)');
    m.st.patternSpacing=4;
    assert.notEqual(m.run('patternDepthAt(.7,.43)'),original);
    for(let y=-2.84;y<=2.84;y+=.12) for(let a=-.8;a<.8;a+=.11) {
      assert.ok(m.run(`ringProfile(${y},${a}).outer>ringProfile(${y},${a}).inner`));
    }
  }
});
const configStart = html.indexOf('function normalizeConfig(');
const configEnd = html.indexOf('const holder=');
function configModel() {
  const declarations = html.slice(html.indexOf('const M='),html.indexOf('const $='));
  const ctx=vm.createContext({});
  vm.runInContext(declarations,ctx);
  if(configStart>=0)vm.runInContext(html.slice(configStart,configEnd),ctx);
  return code=>vm.runInContext(code,ctx);
}
test('saved configuration round trips independent stone colors and engraving',()=>{
  const run=configModel();
  run("st.stones=false;st.pattern='waves';st.size=62;st.engraving='Anna & Max · 14.10.2026';st.sc=['blue','red','black','green']");
  const expected=run('JSON.stringify(st)');
  run('st=normalizeConfig(JSON.parse(JSON.stringify(configurationSnapshot())).configuration)');
  assert.equal(run('JSON.stringify(st)'),expected);
});
test('invalid saved values are clamped or replaced with safe defaults',()=>{
  const run=configModel();
  const result=run("normalizeConfig({size:1000,thickness:-5,pattern:'unknown',mat:'unknown',stones:'false',sc:['unknown'],engraving:'x'.repeat(100)})");
  assert.equal(result.size,76);
  assert.equal(result.thickness,1);
  assert.equal(result.pattern,'none');
  assert.equal(result.mat,'platin');
  assert.equal(typeof result.stones,'boolean');
  assert.equal(result.sc.length,4);
  assert.equal(result.engraving.length,30);
});
test('main and side stones use independent sizes and remain separated',()=>{
  for(const emb of ['flush','karree','kanal']) {
    const m=model({emb,mainStoneSize:1.5,sideStoneSize:2.5,side:2});
    const items=m.run('settingPlan()');
    assert.equal(items.find(i=>i.slot===2).d,1.5);
    assert.ok(items.filter(i=>i.slot!==2).every(i=>i.d===2.5));
    const ordered=items.sort((a,b)=>a.th-b.th);
    const radius=m.run('outerPeak()');
    for(let i=1;i<ordered.length;i++)assert.ok((ordered[i].th-ordered[i-1].th)*radius>(ordered[i].d+ordered[i-1].d)/2);
  }
});
test('oversized stones fit narrow bands and pave uses the small-stone size',()=>{
  const m=model({w:4,mainStoneSize:5,sideStoneSize:3,emb:'karree',side:2});
  const items=m.run('settingPlan()');
  assert.equal(items.find(i=>i.slot===2).d,3.2);
  m.st.emb='pave';m.st.sideStoneSize=1;
  assert.ok(m.run('settingPlan()').every(i=>i.d===1));
});
test('band profiles create distinct shapes while keeping the bore unchanged',()=>{
  const radii=[];
  for(const bandProfile of ['flat','rounded','bevel','dshape']) {
    const m=model({bandProfile,stones:false});
    radii.push(m.run('outerBandRadius(2.2)'));
    assert.ok(Math.abs(m.run('ringProfile(0).inner')-8.594366926962348)<1e-10);
    assert.ok(m.run('ringProfile(2.84).outer>ringProfile(2.84).inner'));
    if(bandProfile==='flat')assert.equal(m.run('outerBandRadius(0)'),m.run('outerBandRadius(2.2)'));
    if(bandProfile==='bevel')assert.equal(m.run('outerBandRadius(0)'),m.run('outerBandRadius(1)'));
  }
  assert.equal(new Set(radii).size,4);
});
test('stone sizes and band profile survive configuration restore',()=>{
  const run=configModel();
  const cfg=run("normalizeConfig({mainStoneSize:4,sideStoneSize:1.5,bandProfile:'bevel'})");
  assert.equal(cfg.mainStoneSize,4);assert.equal(cfg.sideStoneSize,1.5);assert.equal(cfg.bandProfile,'bevel');
});
test('embedded stones cannot protrude into the finger opening',()=>{
  for(const emb of ['flush','groove','grat','kanal','pave']) {
    const m=model({emb,thickness:1,mainStoneSize:5,sideStoneSize:3,side:2});
    for(const item of m.run('settingPlan()')) {
      const offset={flush:.13,groove:.11,grat:.18,kanal:.13,pave:.10}[emb];
      const tip=m.run('outerPeak()')+offset-.59*item.d;
      assert.ok(tip>=m.run('innerRadius()')+.08-1e-10,`${emb}: stone tip must clear bore`);
    }
  }
});

test('large channel and pave stones have separated angular footprints at their actual seated height',()=>{
  for(const emb of ['kanal','pave']) {
    const m=model({emb,size:48,thickness:1,w:10,dome:200,bandProfile:'rounded',side:2,mainStoneSize:5,sideStoneSize:3});
    const items=m.run('settingPlan()').sort((a,b)=>a.th-b.th);
    const peak=m.run('outerPeak()');
    // Lower girdle: crown is 0.16d above the seat, girdle extends 0.012d below it.
    const halfAngle=item=>Math.atan2(item.d/2,peak+(emb==='pave'?.10:.13)-.172*item.d);
    for(let i=1;i<items.length;i++){
      const gap=items[i].th-items[i-1].th-halfAngle(items[i])-halfAngle(items[i-1]);
      assert.ok(gap>0,`${emb}: adjacent stone envelopes overlap by ${-gap} radians`);
    }
  }
});
