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
test('JSON import restores exported choices and normalizes unsafe values',()=>{
  const run=configModel();
  const cfg=run(`parseConfigurationJSON(JSON.stringify({version:1,configuration:{mat:'gold',size:62,engraving:'Anna & Max',sc:['blue','red','black','green'],thickness:-5}}))`);
  assert.equal(cfg.size,62);
  assert.equal(cfg.engraving,'Anna & Max');
  assert.equal(JSON.stringify(cfg.sc),'["blue","red","black","green"]');
  assert.equal(cfg.thickness,1);
  run("st.size=62;st.engraving='Imported design'");
  assert.equal(run('parseConfigurationJSON(JSON.stringify(configurationSnapshot())).engraving'),'Imported design');
});
test('JSON import rejects malformed or unrelated files without changing the design',()=>{
  const run=configModel();
  const before=run('JSON.stringify(st)');
  for(const input of ['{','null','[]','{}','{"version":2,"configuration":{"size":62}}','{"version":1,"configuration":[]}','{"version":1,"configuration":{}}','{"version":1,"configuration":{"unrelated":true}}']){
    assert.throws(()=>run(`parseConfigurationJSON(${JSON.stringify(input)})`),error=>error.name==='SyntaxError'||error.message==='Invalid ring configuration');
    assert.equal(run('JSON.stringify(st)'),before);
  }
});
test('women and engagement configurations retain slim bands and engagement settings in JSON',()=>{
  const run=configModel();
  const cfg=run("normalizeConfig({ringType:'engagement',w:2,size:46,emb:'krappen',mainStoneSize:6.5,cut:'oval',prongs:6,fh:3})");
  assert.equal(cfg.ringType,'engagement');assert.equal(cfg.w,2);assert.equal(cfg.size,46);
  assert.equal(cfg.mainStoneSize,6.5);assert.equal(cfg.cut,'oval');assert.equal(cfg.prongs,6);assert.equal(cfg.fh,3);
  run('st='+JSON.stringify(cfg));
  assert.equal(run('parseConfigurationJSON(JSON.stringify(configurationSnapshot())).cut'),'oval');
  assert.equal(run("normalizeConfig({ringType:'women',w:2.5}).w"),2.5);
});
test('large engagement stones sit above slim bands while embedded stones stay inside the band width',()=>{
  for(const emb of ['krappen','vollzarge','zarge','karree']){
    const m=model({ringType:'engagement',w:2,mainStoneSize:6.5,fh:3,side:1,sideStoneSize:1});
    m.st.emb=emb;
    const items=m.run('settingPlan()');
    assert.equal(items.find(i=>i.slot===2).d,6.5);
    for(const item of items)assert.ok(m.run(`stoneLevel(${JSON.stringify(item)})`)-.43*item.d>=m.run('outerPeak()')+.08-1e-10);
    m.st.emb='flush';
    assert.ok(m.run('stoneSizes().main')<=1.2);
  }
});
test('ring type starting designs preserve personal choices and fit women or engagement proportions',()=>{
  const run=configModel();
  run("st.size=49;st.mat='rosegold';st.engraving='Forever';selectRingType('engagement')");
  assert.equal(run('st.w'),2.5);assert.equal(run('st.emb'),'krappen');assert.equal(run('st.mainStoneSize'),6);
  assert.equal(run('st.size'),49);assert.equal(run('st.mat'),'rosegold');assert.equal(run('st.engraving'),'Forever');
  run("selectRingType('women')");
  assert.equal(run('st.w'),3);assert.equal(run('st.emb'),'flush');assert.equal(run('st.mainStoneSize'),1.5);
});
test('raised center cut changes independently of round side stones',()=>{
  const m=model({ringType:'engagement',cut:'oval',emb:'krappen',side:1});
  assert.equal(m.run("stoneShape({em:'krappen',slot:2})"),'oval');
  assert.equal(m.run("stoneShape({em:'krappen',slot:1})"),'round');
  m.st.cut='princess';
  assert.equal(m.run("stoneShape({em:'krappen',slot:2})"),'princess');
});
test('small engagement side stones sit lower than the raised center and remain separated',()=>{
  const m=model({ringType:'engagement',emb:'krappen',w:2.5,mainStoneSize:6,sideStoneSize:2,fh:3,side:2});
  const items=m.run('settingPlan()').sort((a,b)=>a.th-b.th);
  const center=items.find(i=>i.slot===2),side=items.find(i=>i.slot===1);
  assert.ok(m.run(`stoneLevel(${JSON.stringify(side)})`)<m.run(`stoneLevel(${JSON.stringify(center)})`));
  for(let i=1;i<items.length;i++)assert.ok(items[i].th-items[i-1].th>m.run(`stoneHalfAngle(${JSON.stringify(items[i])})+stoneHalfAngle(${JSON.stringify(items[i-1])})`));
});
test('tapered shoulders narrow at the head and retain full band width at the back',()=>{
  const m=model({ringType:'engagement',emb:'krappen',shoulder:'tapered',shoulderWidth:60});
  assert.equal(m.run('shoulderWidthFactor(0)'),.6);
  assert.equal(m.run('shoulderWidthFactor(Math.PI)'),1);
  assert.equal(m.run('shoulderWidthFactor(-.5)'),m.run('shoulderWidthFactor(.5)'));
  m.st.shoulder='straight';assert.equal(m.run('shoulderWidthFactor(0)'),1);
  m.st.shoulder='tapered';m.st.emb='flush';assert.equal(m.run('shoulderWidthFactor(0)'),1);
});
test('shoulder options survive JSON import and default safely for old designs',()=>{
  const run=configModel();
  const cfg=run("normalizeConfig({ringType:'engagement',shoulder:'cathedral',shoulderWidth:60})");
  assert.equal(cfg.shoulder,'cathedral');assert.equal(cfg.shoulderWidth,60);
  run('st='+JSON.stringify(cfg));
  assert.equal(run('parseConfigurationJSON(JSON.stringify(configurationSnapshot())).shoulder'),'cathedral');
  assert.equal(run('normalizeConfig({}).shoulder'),'straight');
  assert.equal(run("normalizeConfig({shoulder:'unknown',shoulderWidth:-100}).shoulderWidth"),50);
});
test('cathedral shoulders rise continuously from the band and support side stones above the arches',()=>{
  for(const side of [1,2]){
    const m=model({ringType:'engagement',emb:'krappen',shoulder:'cathedral',w:2.5,mainStoneSize:6,sideStoneSize:2,fh:3,side});
    const points=m.run('cathedralShoulderPoints(settingPlan(),1)'),base=m.run('outerBandRadius(0)');
    assert.ok(Math.atan2(-points[0][2],points[0][0])>=1);
    assert.ok(points.at(-1)[0]>base);
    for(let i=1;i<points.length;i++)assert.ok(Math.hypot(points[i][0],points[i][2])>=Math.hypot(points[i-1][0],points[i-1][2])-1e-10);
    for(const item of m.run('settingPlan()').filter(item=>item.slot!==2)){
      const tip=m.run(`stoneLevel(${JSON.stringify(item)})`)-.43*item.d;
      assert.ok(tip>=m.run(`cathedralShoulderRadius(${item.th})`)+.3-1e-10);
    }
  }
});
test('wide cathedral shoulders narrow to the gallery on a small center stone',()=>{
  const m=model({ringType:'engagement',emb:'krappen',shoulder:'cathedral',w:2.5,cathedralWidth:2.5,mainStoneSize:2.2,sideStoneSize:2,fh:3,side:1});
  assert.equal(m.run("cathedralShoulderSectionWidth({d:2.2},0)"),2.5);
  assert.ok(m.run("cathedralShoulderSectionWidth({d:2.2},1)")<=.484+1e-10);
  assert.ok(m.run("cathedralShoulderSectionWidth({d:2.2},.8)")<2.5);
  const p=m.run('cathedralShoulderPoints(settingPlan(),1)'),base=m.run('outerBandRadius(0)');
  assert.ok(Math.atan2(-p[0][2],p[0][0])>=1);
  assert.ok(p.length>10);
});
test('cathedral width adjusts independently and stays within the ring band width',()=>{
  const m=model({ringType:'engagement',emb:'krappen',shoulder:'cathedral',w:2.5,cathedralWidth:.6});
  assert.equal(m.run('cathedralShoulderWidth()'),.6);
  m.st.cathedralWidth=1.5;assert.equal(m.run('cathedralShoulderWidth()'),1.5);
  m.st.cathedralWidth=3;assert.equal(m.run('cathedralShoulderWidth()'),2.5);
  m.st.cathedralWidth=0;assert.equal(m.run('cathedralShoulderWidth()'),.4);
  const run=configModel();
  run("st=normalizeConfig({ringType:'engagement',shoulder:'cathedral',cathedralWidth:1.5})");
  assert.equal(run('parseConfigurationJSON(JSON.stringify(configurationSnapshot())).cathedralWidth'),1.5);
});
test('prong mounts connect below the culet and place a gallery immediately below the girdle',()=>{
  for(const d of [1,2,6,8]){
    const m=model({ringType:'engagement',emb:'krappen',cut:'round',prongs:6});
    const plan=m.run(`prongMountPlan({d:${d},em:'krappen',slot:2})`);
    assert.equal(plan.count,6);
    assert.ok(plan.lowerY<-.43*d);
    assert.ok(plan.galleryY<0&&plan.galleryY>-.43*d);
    assert.ok(plan.galleryRadius>d/2);
    assert.ok(plan.prongRadius>=.055&&plan.prongRadius<=.18);
    assert.equal(plan.prongs.length,6);
    for(const points of plan.prongs){
      assert.equal(points[0][1],plan.lowerY);
      assert.equal(points[2][1],plan.galleryY);
      assert.ok(points.at(-1)[1]>0);
    }
  }
});
test('princess mounts use four corner claws and a square gallery',()=>{
  const m=model({ringType:'engagement',emb:'krappen',cut:'princess',prongs:6});
  const plan=m.run("prongMountPlan({d:6,em:'krappen',slot:2})");
  assert.equal(plan.count,4);assert.equal(plan.square,true);
  assert.equal(plan.cornerCaps.length,4);
  for(const cap of plan.cornerCaps){assert.equal(cap.length,3);assert.ok(cap.every(p=>p[1]>0))}
});
test('non-raised prong baskets clear the finger bore including the lower ribs',()=>{
  for(const thickness of [1,1.9,4]){
    const m=model({ringType:'men',emb:'krappen',thickness,w:6,mainStoneSize:5,side:2,sideStoneSize:3});
    for(const item of m.run('settingPlan()')){
      const plan=m.run(`prongMountPlan(${JSON.stringify(item)})`);
      const bottom=m.run(`stoneLevel(${JSON.stringify(item)})`)+plan.lowerY-plan.prongRadius;
      assert.ok(bottom>=m.run('innerRadius()')+.08-1e-10);
    }
  }
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

test('cathedral roots blend into the shank and gallery joins retain a useful width',()=>{
  const m=model({ringType:'engagement',emb:'krappen',shoulder:'cathedral',w:2.5,cathedralWidth:1.5,mainStoneSize:6,fh:3,side:0});
  assert.ok(m.run('cathedralShoulderSectionWidth({d:6},0)')>=2,'root must overlap most of the shank width');
  assert.ok(m.run('cathedralShoulderSectionWidth({d:6},1)')>=1,'gallery join must not pinch into a wire');
  const points=m.run('cathedralShoulderPoints(settingPlan(),1)');
  assert.ok(Math.hypot(...[points[0][0],points[0][2]])<m.run('outerPeak()')-.3,'root must start inside the shank');
});
test('cathedral arches do not flatten at intermediate profile knots',()=>{
  const m=model({ringType:'engagement',emb:'krappen',shoulder:'cathedral',w:2.5,cathedralWidth:1.5,mainStoneSize:6,fh:3,side:1});
  const p=m.run('cathedralShoulderProfile()');
  for(const [a] of p.knots.slice(1,-1)){
    const slope=m.run(`(cathedralShoulderRadius(${a-.0001})-cathedralShoulderRadius(${a+.0001}))/.0002`);
    assert.ok(slope>.2,'intermediate join must keep rising rather than form a plateau');
  }
});

test('five-stone cathedral culets clear the outer shoulder surface',()=>{
  const m=model({ringType:'engagement',emb:'krappen',shoulder:'cathedral',w:2.5,thickness:1.9,cathedralWidth:1.5,mainStoneSize:6,sideStoneSize:2,fh:3,side:2});
  const item=m.run('settingPlan().find(item=>item.slot===4)');
  const culet=m.run(`stoneLevel(${JSON.stringify(item)})`)-.43*item.d;
  // Independent raycast of the actual swept mesh put its surface at 11.444 mm.
  assert.ok(culet>11.494,'leave at least 0.05 mm above the shoulder surface');
});

test('cathedral shoulder taper is independent of its width',()=>{
  const m=model({ringType:'engagement',emb:'krappen',shoulder:'cathedral',w:2.5,cathedralWidth:1.5,cathedralProfile:'constant',mainStoneSize:6});
  for(const t of [0,.25,.5,.75,1])assert.equal(m.run(`cathedralShoulderSectionWidth({d:6},${t})`),1.5);
  m.st.cathedralProfile='tapered';
  assert.ok(m.run('cathedralShoulderSectionWidth({d:6},0)>cathedralShoulderSectionWidth({d:6},1)'));
});
test('cathedral shape and side-stone seating round trip independently',()=>{
  const run=configModel();
  run("st=normalizeConfig({ringType:'engagement',shoulder:'cathedral',cathedralProfile:'constant',cathedralStoneSeat:'flush'})");
  const cfg=run('parseConfigurationJSON(JSON.stringify(configurationSnapshot()))');
  assert.equal(cfg.cathedralProfile,'constant');assert.equal(cfg.cathedralStoneSeat,'flush');
  const invalid=run("normalizeConfig({cathedralProfile:'invalid',cathedralStoneSeat:'invalid'})");
  assert.equal(invalid.cathedralProfile,'tapered');assert.equal(invalid.cathedralStoneSeat,'raised');
});
test('flush cathedral seats apply only to side stones and fit inside the shoulder',()=>{
  const m=model({ringType:'engagement',emb:'krappen',shoulder:'cathedral',w:2.5,thickness:1.9,cathedralWidth:1.5,cathedralProfile:'constant',cathedralStoneSeat:'flush',mainStoneSize:6,sideStoneSize:2,fh:3,side:2});
  const items=m.run('settingPlan()');
  assert.equal(items.find(i=>i.slot===2).em,'krappen');
  for(const item of items.filter(i=>i.slot!==2)){
    assert.equal(item.em,'flush');assert.equal(item.cathedralFlush,true);
    assert.ok(item.d<=1.1+1e-10,'leave metal beside the stone');
    const frame=m.run(`cathedralStoneFrame(${JSON.stringify(item)})`);
    const table=frame.origin.map((v,i)=>v+frame.normal[i]*.16*item.d);
    assert.ok(Math.hypot(...table.map((v,i)=>v-frame.surface[i]))<=.041);
  }
});

test('flush side-stone size limits stay on the slider and saved configuration step',()=>{
  const m=model({ringType:'engagement',emb:'krappen',shoulder:'cathedral',cathedralStoneSeat:'flush',cathedralProfile:'tapered',w:2.5,cathedralWidth:1.5,mainStoneSize:6,sideStoneSize:2,side:1,thickness:1.9});
  const size=m.run('stoneSizes().side');
  assert.ok(Math.abs(size*10-Math.round(size*10))<1e-9,'a save/load must not silently round the fitted stone to a different size');
});
