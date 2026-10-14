const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {test}=require('node:test');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
function importUI(){
  const elements=Object.fromEntries(['import-json','import-json-file','import-json-text','import-json-submit','close-import','import-content','import-status','save-status'].map(id=>['#'+id,{value:'',textContent:'',focus(){}}]));
  elements['#import-dialog']={open:false,showModal(){this.open=true},close(){this.open=false}};
  const ctx=vm.createContext({$:id=>elements[id],render(){}});
  vm.runInContext(html.slice(html.indexOf('const M='),html.indexOf('const $=')),ctx);
  vm.runInContext(html.slice(html.indexOf('function normalizeConfig('),html.indexOf('const holder=')),ctx);
  vm.runInContext('let sel=4',ctx);
  vm.runInContext(html.slice(html.indexOf("$('#import-json').onclick"),html.indexOf("let exportKind=")),ctx);
  return {elements,run:code=>vm.runInContext(code,ctx)};
}
test('pasted JSON restores the design and closes the import dialog',()=>{
  const {elements,run}=importUI();
  elements['#import-json-text'].onclick();
  elements['#import-content'].value='{"version":1,"configuration":{"size":62,"engraving":"Pasted design","stones":false}}';
  elements['#import-json-submit'].onclick();
  assert.equal(run('st.size'),62);
  assert.equal(run('st.engraving'),'Pasted design');
  assert.equal(run('st.stones'),false);
  assert.equal(run('sel'),2);
  assert.equal(elements['#import-dialog'].open,false);
});
test('invalid pasted JSON leaves the design intact and displays an error for correction',()=>{
  const {elements,run}=importUI();
  const before=run('JSON.stringify(st)');
  elements['#import-json-text'].onclick();
  elements['#import-content'].value='{broken';
  elements['#import-json-submit'].onclick();
  assert.equal(run('JSON.stringify(st)'),before);
  assert.equal(elements['#import-dialog'].open,true);
  assert.equal(elements['#import-content'].value,'{broken');
  assert.ok(elements['#import-status'].textContent.length>0);
});
