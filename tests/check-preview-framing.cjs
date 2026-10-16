const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
// node tests/check-preview-framing.cjs /absolute/path/to/three-r147.cjs
if(!process.argv[2])throw new Error('Pass the local path to Three.js r147');
const THREE=require(path.resolve(process.argv[2])),html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const ring=new THREE.Group(),cam=new THREE.PerspectiveCamera(30,1.25,.1,180);ring.rotation.y=-Math.PI/4;cam.position.set(30,23,30);cam.lookAt(0,0,0);
const env={THREE,ring,cam,BUMP:{},CARBON_MAP:new THREE.Texture(),studio:new THREE.Texture(),floor:new THREE.Object3D(),contact:new THREE.Object3D(),ctl:{target:new THREE.Vector3(),update(){}},
  renderer:{shadowMap:{},capabilities:{getMaxAnisotropy:()=>1}},document:{querySelectorAll:()=>[],createElement:()=>({getContext:()=>({fillRect(){},fillText(){},save(){},restore(){},translate(){},scale(){}})})},invalidatePreview(){},updateControls(){},updateRotationButton(){}};
const run=new Function('env','const {'+Object.keys(env).join(',')+'}=env;'+html.slice(html.indexOf('const DEFAULT_CONFIG='),html.indexOf('const $='))+
  html.slice(html.indexOf('const METAL_COLOR='),html.indexOf('function updateControls()'))+
  html.slice(html.indexOf('function setView('),html.indexOf("document.querySelectorAll('[data-view]').forEach(b=>b.onclick"))+';return code=>eval(code)')(env);
run("st={...DEFAULT_CONFIG,ringType:'engagement',shoulder:'cathedral',emb:'krappen',cathedralConnection:'base',size:44,thickness:4,w:3,mainStoneSize:8,side:2,sideStoneSize:3,cathedralWidth:3,cathedralProfile:'constant',cathedralThickness:2.5,cathedralStoneSeat:'flush',cathedralSideSpacing:.6,cathedralCurvature:100,cathedralBendAngle:25};render()");
function assertFits(){
  cam.updateMatrixWorld();const bounds=new THREE.Box3().setFromObject(ring),point=new THREE.Vector3();
  for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
    point.set(x,y,z).project(cam);
    assert.ok(Math.abs(point.x)<1&&Math.abs(point.y)<1&&point.z>-1&&point.z<1,'the whole tall setting must fit in the preview: '+JSON.stringify(point));
  }
}
assertFits();
for(const view of ['setting','profile','inside']){run('setView('+JSON.stringify(view)+')');assertFits()}
cam.aspect=.55;cam.updateProjectionMatrix();run('frameRing()');assertFits();
console.log('Tall fitted settings remain visible in all three views and a narrow viewport.');
