const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
// node tests/check-cathedral-options.cjs /absolute/path/to/three-r147.cjs
if(!process.argv[2])throw new Error('Pass the local path to the pinned Three.js r147 CommonJS build');
const THREE=require(path.resolve(process.argv[2]));assert.equal(THREE.REVISION,'147');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),ring=new THREE.Group(),cam=new THREE.PerspectiveCamera();cam.position.set(30,23,30);
const BUMP={matt:new THREE.Texture(),hammer:new THREE.Texture(),ice:new THREE.Texture(),weave:new THREE.Texture()};
const env={THREE,ring,cam,BUMP,CARBON_MAP:new THREE.Texture(),studio:new THREE.Texture(),floor:new THREE.Object3D(),contact:new THREE.Object3D(),ctl:{},
  renderer:{shadowMap:{},capabilities:{getMaxAnisotropy:()=>1}},document:{createElement:()=>({getContext:()=>({fillRect(){},fillText(){},save(){},restore(){},translate(){},scale(){}})})},invalidatePreview(){},updateControls(){}};
const run=new Function('env','const {'+Object.keys(env).join(',')+'}=env;'+html.slice(html.indexOf('const DEFAULT_CONFIG='),html.indexOf('const $='))+
  html.slice(html.indexOf('const METAL_COLOR='),html.indexOf('function updateControls()'))+';return code=>eval(code)')(env);
let cases=0,totalPave=0;
for(const mainStoneSize of [1,6,8])for(const emb of ['krappen','zarge','vollzarge','karree'])for(const cathedralConnection of ['gallery','base','split'])for(const cut of ['round','oval','princess'])for(const cathedralThickness of [.6,1.4,2.5])for(const cathedralPave of [false,true]){
  const cathedralCurvature=[0,50,100][cases%3],cathedralSideTilt=[-20,0,20][Math.floor(cases/3)%3];
  const config={ringType:'engagement',shoulder:'cathedral',emb,w:2.5,size:cases%2?44:64,thickness:cases%2?1:2,mainStoneSize,fh:Math.max(3,.43*mainStoneSize+.15),side:cases%3,cathedralStoneSeat:cases%5===0?'flush':'raised',sideStoneSize:1.2,cathedralBendAngle:100,cathedralWidth:2,cathedralConnection,cut,cathedralThickness,cathedralCurvature,cathedralSideTilt,cathedralSideSpacing:.3,cathedralPave,cathedralPaveSize:.6,cathedralPaveCount:5};
  run('st={...DEFAULT_CONFIG,...'+JSON.stringify(config)+'};render()');ring.updateMatrixWorld(true);
  const label=JSON.stringify(config),items=run('settingPlan()'),stones=run('pickTargets'),main=stones.find(o=>!o.userData.cathedralPave&&o.userData.slot===2),inverse=new THREE.Matrix4().copy(main.matrixWorld).invert(),planes=main.geometry.userData.planes;
  const bore=run('innerRadius()'),point=new THREE.Vector3(),local=new THREE.Vector3();
  let forks=0;
  ring.traverse(mesh=>{
    if(!mesh.geometry)return;if(mesh.name==='cathedral-split-connection')forks++;
    const p=mesh.geometry.attributes.position,n=mesh.geometry.attributes.normal;
    for(let i=0;i<p.count;i++){
      point.fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld);
      assert.ok([point.x,point.y,point.z,n.getX(i),n.getY(i),n.getZ(i)].every(Number.isFinite),'finite mesh '+label);
      assert.ok(Math.hypot(point.x,point.z)>=bore-.000002,'finger bore collision '+mesh.name+' '+label);
      if(mesh.name==='cathedral-shoulder'||mesh.name==='cathedral-split-connection'){
        local.copy(point).applyMatrix4(inverse);
        assert.ok(!planes.every(plane=>plane.x*local.x+plane.y*local.y+plane.z*local.z+plane.w<-.002),'shoulder intersects the main stone '+mesh.name+' '+label);
      }
    }
  });
  const envelopes=stones.map(stone=>{
    let lo=Infinity,hi=-Infinity;const p=stone.geometry.attributes.position;
    for(let i=0;i<p.count;i++){point.fromBufferAttribute(p,i).applyMatrix4(stone.matrixWorld);const angle=Math.atan2(-point.z,point.x);lo=Math.min(lo,angle);hi=Math.max(hi,angle)}
    return {lo,hi};
  }).sort((a,b)=>a.lo-b.lo);
  for(let i=1;i<envelopes.length;i++)assert.ok(envelopes[i].lo>envelopes[i-1].hi,'stone angular envelopes overlap '+label);
  assert.equal(forks,cathedralConnection==='split'?4:0,'connection style must change the actual mesh');
  const metal=ring.children.filter(o=>['cathedral-shoulder','cathedral-shoulder-top','cathedral-stone-seat','ring-band'].includes(o.name));
  const pave=items.filter(item=>item.cathedralPave);totalPave+=pave.length;
  for(const item of items.filter(item=>item.cathedralFlush)){
    const frame=run('cathedralStoneFrame('+JSON.stringify(item)+')'),normal=new THREE.Vector3(...frame.normal);
    const ray=new THREE.Raycaster(new THREE.Vector3(...frame.surface).add(normal),normal.clone().negate()),hits=ray.intersectObjects(metal,true);
    assert.ok(hits.length,'pave seat needs a metal floor');
    assert.ok(hits[0].distance>1+.59*item.d-.04,'metal covers a shoulder stone: '+hits[0].object.name+' at '+hits[0].distance+' (required '+(1+.59*item.d-.04)+', height '+run('st.fh')+') '+label);
  }
  if(cathedralPave){
    const before=stones.filter(o=>o.userData.cathedralPave),mainBefore=main.material;
    run("st.cathedralPaveStone='blue';render()");
    const after=run('pickTargets.filter(o=>o.userData.cathedralPave)');
    assert.ok(before.every((stone,i)=>stone===after[i]),'pave color changes must retain the meshes');
    assert.equal(main.material,mainBefore,'pave colors must not change the main stone');
    for(const stone of after){assert.equal(stone.material.uniforms.ior.value,1.77);assert.equal(stone.material.uniforms.studioMap.value,env.studio)}
  }
  cases++;
}
assert.ok(totalPave>50,'the configurations must exercise actual shoulder pave');
console.log(`${cases} complete rings and ${totalPave} shoulder-pave seats: finite meshes, clear bore/main stone, open pave seats, connection styles and material reuse.`);
