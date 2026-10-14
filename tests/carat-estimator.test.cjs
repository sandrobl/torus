const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {test}=require('node:test');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const declarations=html.slice(html.indexOf('const M='),html.indexOf('const $='));
const context=vm.createContext({});
vm.runInContext(declarations,context);
function run(code){return vm.runInContext(code,context)}
test('round and square estimates account for cut and scale with stone volume',()=>{
  assert.ok(Math.abs(run("estimateCarats(5,'white',false)")-.47275)<1e-8);
  assert.ok(Math.abs(run("estimateCarats(5,'white',true)")-.72625)<1e-8);
  assert.ok(Math.abs(run("estimateCarats(4,'white',false)/estimateCarats(2,'white',false)")-8)<1e-8);
});
test('weights use each gemstone density rather than diamond equivalent weight',()=>{
  assert.ok(run("estimateCarats(3,'blue',false)>estimateCarats(3,'white',false)"));
  assert.ok(run("estimateCarats(3,'moissanite',false)<estimateCarats(3,'white',false)"));
  assert.ok(run("estimateCarats(3,'aquamarine',false)<estimateCarats(3,'moissanite',false)"));
});
test('small stones remain nonzero in displayed estimates',()=>{
  assert.equal(run("formatCarats(estimateCarats(.5,'white',false))"),'0,0005 ct');
  assert.equal(run("formatCarats(estimateCarats(5,'white',false))"),'0,47 ct');
});
test('mixed side stones show a per-stone range and pave uses its own selected stone',()=>{
  assert.equal(run("caratRange(2,['white','blue'],false)"),'ca. 0,03 ct je Stein');
  assert.equal(run("caratRange(3,['white','aquamarine'],false)"),'ca. 0,08–0,10 ct je Stein');
  assert.equal(run("caratRange(2,['white','white'],false)"),'ca. 0,03 ct je Stein');
});
