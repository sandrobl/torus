const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
// node tests/check-material-performance.cjs /absolute/path/to/three-r147.cjs
if(!process.argv[2])throw new Error('Pass the local path to the pinned Three.js r147 CommonJS build');
const THREE=require(path.resolve(process.argv[2]));
assert.equal(THREE.REVISION,'147');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const ring=new THREE.Group(),cam=new THREE.PerspectiveCamera();cam.position.set(30,23,30);
const BUMP={matt:new THREE.Texture(),hammer:new THREE.Texture(),ice:new THREE.Texture(),weave:new THREE.Texture()};
const renderer={shadowMap:{},capabilities:{getMaxAnisotropy:()=>1}};
// Canvas pixels and WebGL drawing are unnecessary for resource-lifetime checks.
const document={createElement:()=>({getContext:()=>({fillRect(){},fillText(){},save(){},restore(){},translate(){},scale(){}})})};
const env={THREE,ring,cam,BUMP,renderer,document,CARBON_MAP:new THREE.Texture(),studio:new THREE.Texture(),
  floor:new THREE.Object3D(),contact:new THREE.Object3D(),ctl:{},invalidatePreview(){},updateControls(){}};
const run=new Function('env','const {'+Object.keys(env).join(',')+'}=env;'+
  html.slice(html.indexOf('const DEFAULT_CONFIG='),html.indexOf('const $='))+
  html.slice(html.indexOf('const METAL_COLOR='),html.indexOf('function updateControls()'))+';return code=>eval(code)')(env);
run("st.ringType='engagement';st.emb='krappen';st.side=2;st.w=2.5;st.mainStoneSize=6;st.fh=3;st.stripe='rosegold';render()");
const meshes=[];ring.traverse(o=>{if(o.isMesh)meshes.push(o)});
const geometries=meshes.map(o=>o.geometry),materials=meshes.map(o=>o.material);
let disposed=0;geometries.forEach(g=>g.addEventListener('dispose',()=>disposed++));
renderer.shadowMap.needsUpdate=false;
run("st.mat='gelbgold';st.surf='matt';st.engraving='Forever';st.stripe='platin';st.stone='blue';st.sc=['red','black','green','moissanite'];render()");
const current=[];ring.traverse(o=>{if(o.isMesh)current.push(o)});
assert.ok(current.length===meshes.length&&current.every((mesh,i)=>mesh===meshes[i]),'appearance edits should keep the existing meshes');
assert.equal(disposed,0,'appearance edits must not discard geometry');
assert.equal(renderer.shadowMap.needsUpdate,false,'appearance edits do not move shadow casters');
const band=ring.getObjectByName('ring-band'),bore=ring.getObjectByName('ring-bore');
assert.equal(band.material.color.getHex(),new THREE.Color('#e6b75b').convertSRGBToLinear().getHex());
assert.equal(band.material.roughness,.43);assert.equal(band.material.bumpMap,BUMP.matt);
assert.ok(bore.material.map?.isCanvasTexture,'engraving must update the bore texture');
assert.equal(bore.material.roughness,.115,'the bore stays polished');
assert.equal(ring.getObjectByName('material-inlay').material.color.getHex(),new THREE.Color('#bec5cb').convertSRGBToLinear().getHex());
const stones=run('pickTargets'),main=stones.find(o=>o.userData.slot===2),black=stones.find(o=>o.userData.slot===1);
assert.equal(main.material.uniforms.ior.value,1.77);assert.ok(black.material.isMeshPhysicalMaterial);
assert.equal(main.material.uniforms.studioMap.value,env.studio,'changing stone color must keep the shared studio texture');
assert.equal(band.material,materials[meshes.indexOf(band)],'compatible materials retain their GPU resource identity');
run("st.sc[1]='red';render()");
assert.ok(black.material.isShaderMaterial,'a formerly opaque stone can become refractive');
ring.updateMatrixWorld(true);black.onBeforeRender();
assert.ok(black.material.uniforms.localCamera.value.length()>0,'optics use the current material after replacement');
run("st.stone='black';render();st.stone='moissanite';render();st.engraving='';render()");
main.onBeforeRender();assert.equal(main.material.uniforms.ior.value,2.65);assert.equal(bore.material.map,null);
assert.equal(disposed,0);
run('st.size=60;render()');assert.ok(disposed>0,'dimensional changes must rebuild the ring');
const inlays=ring.children.filter(o=>o.name==='material-inlay');assert.equal(inlays.length,2);
run("st.stripe='none';render()");assert.equal(ring.children.filter(o=>o.name==='material-inlay').length,0);
console.log('Appearance edits retain geometry, update all material roles and stone optics, and dimension edits rebuild.');
