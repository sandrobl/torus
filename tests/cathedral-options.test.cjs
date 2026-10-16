const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {test}=require('node:test');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
function model(overrides={}){
  const THREE={MathUtils:{clamp:(x,a,b)=>Math.max(a,Math.min(b,x)),smoothstep:(x,a,b)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)}}};
  const run=new Function('THREE',html.slice(html.indexOf('const M='),html.indexOf('const $='))+
    html.slice(html.indexOf('function normalizeConfig('),html.indexOf('const holder='))+
    html.slice(html.indexOf('function innerRadius()'),html.indexOf('function holeFor('))+';return code=>eval(code)')(THREE);
  run('st=normalizeConfig({...DEFAULT_CONFIG,ringType:"engagement",shoulder:"cathedral",emb:"krappen",w:2.5,mainStoneSize:6,fh:3,...'+JSON.stringify(overrides)+'})');
  return {run,set:(key,value)=>run('st['+JSON.stringify(key)+']='+JSON.stringify(value))};
}
test('all cathedral options normalize and survive JSON round trips',()=>{
  const m=model({cathedralThickness:1.4,cathedralCurvature:70,cathedralSideSpacing:.25,cathedralSideTilt:15,cathedralConnection:'split',cathedralPave:true,cathedralPaveSize:.8,cathedralPaveCount:6,cathedralPaveStone:'blue'});
  const cfg=m.run('parseConfigurationJSON(JSON.stringify(configurationSnapshot()))');
  for(const [key,value] of Object.entries({cathedralThickness:1.4,cathedralCurvature:70,cathedralSideSpacing:.25,cathedralSideTilt:15,cathedralConnection:'split',cathedralPave:true,cathedralPaveSize:.8,cathedralPaveCount:6,cathedralPaveStone:'blue'}))assert.equal(cfg[key],value,key);
  const invalid=m.run('normalizeConfig({cathedralThickness:-1,cathedralCurvature:1000,cathedralSideSpacing:5,cathedralSideTilt:-100,cathedralConnection:"unknown",cathedralPave:"yes",cathedralPaveCount:500,cathedralPaveStone:"unknown"})');
  assert.equal(invalid.cathedralThickness,.4);assert.equal(invalid.cathedralCurvature,100);assert.equal(invalid.cathedralSideSpacing,.6);assert.equal(invalid.cathedralSideTilt,-20);
  assert.equal(invalid.cathedralConnection,'gallery');assert.equal(invalid.cathedralPave,false);assert.equal(invalid.cathedralPaveCount,8);assert.equal(invalid.cathedralPaveStone,'white');
});
test('shoulder thickness changes independently of the band and retains a smooth taper',()=>{
  const m=model({cathedralThickness:.6}),before=m.run('cathedralShoulderDepth({d:6},.5)'),band=m.run('outerPeak()-innerRadius()');
  m.set('cathedralThickness',2);
  assert.ok(m.run('cathedralShoulderDepth({d:6},.5)')>before+.3);assert.equal(m.run('outerPeak()-innerRadius()'),band);
  const depth=t=>m.run(`cathedralShoulderDepth({d:6},${t})`),h=.0001;
  assert.ok(Math.abs((depth(.5)-2*depth(.5-h)+depth(.5-2*h))-(depth(.5+2*h)-2*depth(.5+h)+depth(.5)))<.000001);
});
test('curve shape changes independently of bend angle and both attachment endpoints',()=>{
  const m=model({cathedralBendAngle:85,cathedralCurvature:0}),before=m.run('cathedralShoulderPoints(settingPlan(),1)'),middle=m.run('cathedralShoulderRadius(.8)');
  m.set('cathedralCurvature',100);const after=m.run('cathedralShoulderPoints(settingPlan(),1)');
  assert.deepEqual(after[0],before[0]);assert.deepEqual(after.at(-1),before.at(-1));assert.notEqual(m.run('cathedralShoulderRadius(.8)'),middle);
  let previous=-Infinity;
  for(let i=0;i<=100;i++){const r=m.run(`cathedralShoulderRadius(1.5-${i}*.015)`);assert.ok(r>=previous-1e-10);previous=r}
});
test('side-stone spacing increases mirrored gaps and tilt lifts the stones clear',()=>{
  const m=model({side:2,sideStoneSize:2}),before=m.run('settingPlan().filter(item=>item.slot!==2).map(item=>Math.abs(item.th))');
  m.set('cathedralSideSpacing',.5);const spaced=m.run('settingPlan().filter(item=>item.slot!==2)');
  assert.ok(spaced.every((item,i)=>Math.abs(item.th)>before[i]));assert.equal(spaced[0].th,-spaced[1].th);
  const item=spaced[0],level=m.run('stoneLevel('+JSON.stringify(item)+')');m.set('cathedralSideTilt',20);
  assert.ok(m.run('stoneLevel('+JSON.stringify(item)+')')>level);
});
test('basket-base and split connections attach below the gallery',()=>{
  const m=model(),gallery=m.run('cathedralShoulderProfile()');
  m.set('cathedralConnection','base');const base=m.run('cathedralShoulderProfile()');assert.ok(base.basket<gallery.basket-.5);assert.ok(base.end<gallery.end);
  m.set('cathedralConnection','split');const split=m.run('cathedralShoulderProfile()');assert.equal(split.basket,base.basket);assert.equal(split.end,base.end);
});
test('shoulder pave adds symmetric flush stones with its own size and color',()=>{
  const m=model({side:1,cathedralWidth:2,cathedralThickness:1.4,cathedralBendAngle:100,cathedralPave:true,cathedralPaveSize:.8,cathedralPaveCount:5,cathedralPaveStone:'blue'});
  const items=m.run('settingPlan()'),pave=items.filter(item=>item.cathedralPave),regular=items.filter(item=>!item.cathedralPave);
  assert.equal(regular.length,3);assert.ok(pave.length>=4&&pave.length<=10);assert.equal(pave.length%2,0);
  for(let i=0;i<pave.length;i+=2){assert.equal(pave[i].th,-pave[i+1].th);assert.equal(pave[i].d,.8);assert.equal(pave[i].sk,'blue');assert.equal(pave[i].cathedralFlush,true);assert.equal(pave[i].em,'flush')}
  m.set('cathedralPave',false);assert.equal(m.run('settingPlan().length'),3);
  m.set('cathedralPave',true);m.set('shoulder','straight');assert.equal(m.run('settingPlan().length'),3);
});

test('flush side stones on a low connection request enough height to clear the band',()=>{
  const m=model({side:2,cathedralStoneSeat:'flush',cathedralConnection:'base',cathedralCurvature:100,cathedralThickness:1.4,cathedralSideSpacing:.3,cathedralBendAngle:100});
  const before=m.run('st.fh'),height=m.run('minimumSettingHeight()');
  assert.ok(height>3);assert.equal(m.run('st.fh'),before,'measuring the minimum must not alter the selected design');
  m.set('fh',height);
  for(const item of m.run('settingPlan().filter(item=>item.cathedralFlush)')){
    const frame=m.run('cathedralStoneFrame('+JSON.stringify(item)+')'),floor=frame.origin.map((v,i)=>v-frame.normal[i]*(.43*item.d+.06));
    assert.ok(Math.hypot(floor[0],floor[2])>m.run('outerPeak()')+.03);
  }
});

test('the exposed middle of the shoulder reaches the selected physical thickness',()=>{
  const m=model({thickness:1,cathedralThickness:2.5});
  assert.equal(m.run('cathedralShoulderDepth({d:6},.5)'),2.5);
});
test('small lower bezel connections follow the fitted height and keep flush seats above the band',()=>{
  for(const emb of ['zarge','vollzarge','karree'])for(const cathedralConnection of ['base','split']){
    const m=model({emb,cathedralConnection,mainStoneSize:1,side:1,sideStoneSize:1.2,cathedralStoneSeat:'flush',cathedralCurvature:50,cathedralThickness:1.4,cathedralWidth:2,cathedralBendAngle:100});
    const first=m.run('cathedralShoulderProfile().basket');m.set('fh',5);assert.ok(m.run('cathedralShoulderProfile().basket')>first+1);
    const height=m.run('minimumSettingHeight()');m.set('fh',height);
    for(const item of m.run('settingPlan().filter(item=>item.cathedralFlush)')){
      const frame=m.run('cathedralStoneFrame('+JSON.stringify(item)+')'),floor=frame.origin.map((v,i)=>v-frame.normal[i]*(.43*item.d+.06));
      assert.ok(Math.hypot(floor[0],floor[2])>m.run('outerPeak()')+.03,emb+' '+cathedralConnection);
    }
  }
});
