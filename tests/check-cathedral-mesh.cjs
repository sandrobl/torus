const fs=require('node:fs'),assert=require('node:assert/strict');
// Optional integration check using the same Three.js r147 build as index.html.
// Usage: node tests/check-cathedral-mesh.cjs /absolute/path/to/three-r147.cjs
if(!process.argv[2])throw new Error('Pass the local path to the pinned Three.js r147 CommonJS build');
const THREE=require(require('node:path').resolve(process.argv[2]));
assert.equal(THREE.REVISION,'147');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const st={size:54,thickness:1.9,w:2.5,dome:40,bandProfile:'rounded',ringType:'engagement',emb:'krappen',shoulder:'cathedral',cathedralWidth:1.5,stones:true,mainStoneSize:6,sideStoneSize:2,fh:3,side:0,sc:['white','white','white','white'],stone:'white',cut:'round',prongs:4};
const ring=new THREE.Group();
const run=new Function('THREE','st','ring',html.slice(html.indexOf('function innerRadius()'),html.indexOf('function holeFor('))+html.slice(html.indexOf('function buildCathedralShoulders('),html.indexOf('function addTube('))+';return code=>eval(code)')(THREE,st,ring);
let cases=0;
for(const size of [44,64])for(const cathedralBendAngle of [25,60,100])for(const thickness of [1,1.9,4])for(const d of [1,2.2,6,8])for(const width of [.4,1.5,2.5])for(const side of [0,1,2]){
 Object.assign(st,{size,cathedralBendAngle,thickness,mainStoneSize:d,cathedralWidth:width,side,fh:Math.max(3,.43*d+.15)});ring.clear();
 run('buildCathedralShoulders(settingPlan(),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}))');
 assert.equal(ring.children.length,2);
 for(const mesh of ring.children){
   const pos=mesh.geometry.attributes.position,norm=mesh.geometry.attributes.normal;
   for(let i=0;i<pos.count;i++){
     assert.ok([pos.getX(i),pos.getY(i),pos.getZ(i),norm.getX(i),norm.getY(i),norm.getZ(i)].every(Number.isFinite));
     assert.ok(Math.hypot(pos.getX(i),pos.getZ(i))>=st.size/(2*Math.PI)+.02,`bore collision ${JSON.stringify(st)}`);
     if(i%17===0){
       assert.ok(pos.getY(i)*norm.getY(i)>0,'section normal points inward');
       const angle=Math.abs(Math.atan2(pos.getZ(i),pos.getX(i))),radius=Math.hypot(pos.getX(i),pos.getZ(i));
       assert.ok(Math.abs(radius-run(`cathedralShoulderRadius(${angle})`))<.000005,'the actual swept mesh must follow the smooth profile without spline ripples');
       assert.ok(Math.hypot(norm.getX(i)-norm.getX(i+16),norm.getY(i)-norm.getY(i+16),norm.getZ(i)-norm.getZ(i+16))<.000001,'matching shoulder seam vertices must have matching shading normals');
     }
   }
 }
 ring.updateMatrixWorld(true);
 for(const item of run('settingPlan()').filter(item=>item.slot!==2)){
   const ray=new THREE.Raycaster(new THREE.Vector3(),new THREE.Vector3(Math.cos(item.th),0,-Math.sin(item.th)));
   const hits=ray.intersectObjects(ring.children);
   assert.ok(hits.length,'stone has no shoulder below it');
   const surface=Math.max(...hits.map(hit=>hit.distance));
   const culet=run(`stoneLevel(${JSON.stringify(item)})`)-.43*item.d;
   assert.ok(culet-surface>.05,`culet clearance ${culet-surface} ${JSON.stringify(st)}`);
 }
 cases++;
}
console.log(`${cases} actual Three.js mesh combinations: finite vertices/normals, both shoulders face outward, finger bore and side-stone culets stay clear.`);

let flushCases=0;
for(const cathedralBendAngle of [25,60,100])for(const cathedralProfile of ['constant','tapered'])for(const cathedralWidth of [.4,1.5,3])for(const mainStoneSize of [1,6,8])for(const thickness of [1,4])for(const side of [1,2]){
 Object.assign(st,{cathedralBendAngle,thickness,mainStoneSize,sideStoneSize:3,cathedralWidth,cathedralProfile,cathedralStoneSeat:'flush',side,fh:Math.max(3,.43*mainStoneSize+.15)});
 ring.clear();run('buildCathedralShoulders(settingPlan(),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}))');ring.updateMatrixWorld(true);
 for(const mesh of ring.children){
   for(const attribute of ['position','normal'])assert.ok([...mesh.geometry.attributes[attribute].array].every(Number.isFinite),`non-finite ${attribute}`);
 }
 for(const item of run('settingPlan()').filter(item=>item.cathedralFlush)){
  const frame=run(`cathedralStoneFrame(${JSON.stringify(item)})`),normal=new THREE.Vector3(...frame.normal);
  const ray=new THREE.Raycaster(new THREE.Vector3(...frame.surface).add(normal),normal.clone().negate());
  const hits=ray.intersectObjects(ring.children,true);
  assert.ok(hits.length,'seat must have a metal floor');
  assert.ok(hits[0].distance>1+.59*item.d-.04,`solid shoulder covers the flush stone: ${JSON.stringify(st)}`);
 }
 flushCases++;
}
console.log(`${flushCases} flush configurations have finite meshes and open seats with metal beneath their culets.`);
