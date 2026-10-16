const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path');
// node tests/check-band-performance.cjs /absolute/path/to/three-r147.cjs
if(!process.argv[2])throw new Error('Pass the local path to the pinned Three.js r147 CommonJS build');
const THREE=require(path.resolve(process.argv[2]));
assert.equal(THREE.REVISION,'147');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const run=new Function('THREE',html.slice(html.indexOf('const DEFAULT_CONFIG='),html.indexOf('const $='))+
  html.slice(html.indexOf('function innerRadius()'),html.indexOf('function socket('))+';let holes;return code=>eval(code)')(THREE);
// Expanded attributes captured before optimization. Index sharing must preserve
// triangle order, winding, normals and UV seams byte for byte, even at holes.
const cases=[
  ['plain',{},[43152,'d96785f9ec045ad8781385d8424d9d6b11cfbc81567982b9b8f8f14b7355399f'],[43296,'9f8171194a35207fe9a7fd7f21787a7cffd75f749dfa8f7fcf145bb566cf2b2c']],
  ['waves',{pattern:'waves'},[1195164,'a3fc4069802e85f1b15afda764d7100df2fb4e567ce5e8a9bfc2c0d6970e0418'],[43296,'9f8171194a35207fe9a7fd7f21787a7cffd75f749dfa8f7fcf145bb566cf2b2c']],
  ['facets',{pattern:'facets'},[1195164,'933722baaf248e4608874b6f73e8c21a39294b56ceb515bda7f743f5d68df720'],[43296,'9f8171194a35207fe9a7fd7f21787a7cffd75f749dfa8f7fcf145bb566cf2b2c']],
  ['pave',{emb:'pave'},[83112,'85ae1401bd7724e609c2d806840270752aefab08d2572c79688ea3fa1547674f'],[89142,'9d7a4a6655c25706f91b37bc40a74ec23c04e08675e6b95bc3028e86c31ff522']],
  ['channel',{emb:'kanal',side:2},[58200,'7fae03de0fe59d9bae2416ebf5af3fb7701509dabf691f6c52e65a57e86a40cd'],[59244,'08154f97296092aba08c16de7253040f53415023783db7b5b29412a724851a8b']],
  ['tapered',{ringType:'engagement',emb:'krappen',shoulder:'tapered',w:2.5,mainStoneSize:6,fh:3},[5232,'76de5eb916ada42d4ce036a3695c005e0af62be0bc7d724a688dc6780099dbdb'],[5232,'3517f1380ef57f90e579650b82a295ce8e0e86f94b6bfa3b4615298fa2a6c4f4']]
];
for(const [name,config,outer,inner] of cases){
  run('st={...DEFAULT_CONFIG,...'+JSON.stringify(config)+'};holes=settingPlan().filter(item=>!raisedSetting(item.em)).map(holeFor)');
  for(const [inside,[count,digest]] of [[false,outer],[true,inner]]){
    const geometry=run(`bandSkin(holes,${inside})`),label=name+(inside?' bore':' surface');
    const flatNormals=name==='tapered'||(name==='facets'&&!inside);
    if(flatNormals)assert.equal(geometry.index,null,label+' preserves separate face normals');
    else{
      assert.ok(geometry.index,label+' should reuse vertices');
      assert.ok(geometry.attributes.position.count<count*.5,label+' eliminates at least half the duplicate vertex data');
    }
    const expanded=geometry.index?geometry.toNonIndexed():geometry,hash=crypto.createHash('sha256');
    assert.equal(expanded.attributes.position.count,count,label+' triangle count');
    for(const attribute of ['position','normal','uv'])hash.update(Buffer.from(expanded.attributes[attribute].array.buffer));
    assert.equal(hash.digest('hex'),digest,label+' must match the original triangles, normals and UVs exactly');
    geometry.dispose();if(expanded!==geometry)expanded.dispose();
  }
}
console.log('12 band meshes retain identical triangles, normals and UVs; smooth meshes eliminate duplicate vertices.');
