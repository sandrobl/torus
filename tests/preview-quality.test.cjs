const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
function quality(saved=null,blocked=false){
  const elements=new Map(),writes=[];let redraws=0,fits=0;
  const ctx=vm.createContext({devicePixelRatio:2,renderer:{capabilities:{maxTextureSize:8192}},
    localStorage:{getItem(){if(blocked)throw Error('blocked');return saved},setItem(k,v){if(blocked)throw Error('blocked');writes.push([k,v])}},
    $:id=>{if(!elements.has(id))elements.set(id,{setAttribute(k,v){this[k]=v}});return elements.get(id)},
    fit(){fits++},invalidatePreview(){redraws++}
  });
  const start=html.indexOf('// Preview quality preference');
  assert.ok(start>=0,'preview quality control is implemented');
  vm.runInContext(html.slice(start,html.indexOf('renderer.toneMapping=',start)),ctx);
  return {ctx,elements,writes,get fits(){return fits},get redraws(){return redraws}};
}
test('quality increases resolution while respecting pixel and device limits',()=>{
  const q=quality();
  assert.equal(vm.runInContext('previewPixelRatio(600,500)',q.ctx),2);
  q.elements.get('#preview-quality').oninput({target:{value:'2'}});
  assert.equal(vm.runInContext('previewPixelRatio(600,500)',q.ctx),4);
  assert.ok(vm.runInContext('previewPixelRatio(4000,3000)**2*4000*3000',q.ctx)<=8000001);
  assert.ok(vm.runInContext('previewPixelRatio(12000,100)*12000',q.ctx)<=8192);
  assert.equal(q.fits,1);assert.equal(q.redraws,1);
  assert.equal(q.writes[0][1],'2');
});
test('quality preference restores and corrupt values fall back to standard',()=>{
  const restored=quality('1');assert.equal(restored.elements.get('#preview-quality').value,'1');
  assert.equal(vm.runInContext('previewPixelRatio(600,500)',restored.ctx),3);
  for(const saved of ['NaN','-1','9','1.5','',null]){
    const q=quality(saved);assert.equal(q.elements.get('#preview-quality').value,'0');
  }
});
test('unavailable browser storage does not prevent live quality adjustment',()=>{
  const q=quality(null,true);
  q.elements.get('#preview-quality').oninput({target:{value:'2'}});
  assert.equal(vm.runInContext('previewPixelRatio(600,500)',q.ctx),4);
  assert.equal(q.redraws,1);
});
