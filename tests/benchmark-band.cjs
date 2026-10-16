const fs=require('node:fs'),path=require('node:path');
// node tests/benchmark-band.cjs /path/to/three-r147.cjs [path/to/index.html]
if(!process.argv[2])throw new Error('Pass the local path to the pinned Three.js r147 CommonJS build');
const THREE=require(path.resolve(process.argv[2]));
if(THREE.REVISION!=='147')throw new Error('Expected Three.js r147');
const html=fs.readFileSync(process.argv[3]||path.join(__dirname,'../index.html'),'utf8');
const run=new Function('THREE',html.slice(html.indexOf('const DEFAULT_CONFIG='),html.indexOf('const $='))+
  html.slice(html.indexOf('function innerRadius()'),html.indexOf('function socket('))+';let holes;return code=>eval(code)')(THREE);
// CPU geometry construction only; no WebGL draw, DOM updates or shader timing.
// Warm each configuration once, then report the median of five runs.
for(const [name,config] of Object.entries({plain:{},waves:{pattern:'waves'},facets:{pattern:'facets'},pave:{emb:'pave'},channel:{emb:'kanal',side:2}})){
  run('st={...DEFAULT_CONFIG,...'+JSON.stringify(config)+'};holes=settingPlan().map(holeFor)');
  const times=[];let bytes,vertices,triangles;
  for(let i=0;i<6;i++){
    const start=performance.now(),geometry=run('bandSkin(holes)');
    if(i)times.push(performance.now()-start);
    bytes=Object.values(geometry.attributes).reduce((sum,a)=>sum+a.array.byteLength,0)+(geometry.index?.array.byteLength||0);
    vertices=geometry.attributes.position.count;triangles=(geometry.index?.count||vertices)/3;geometry.dispose();
  }
  console.log(JSON.stringify({name,medianMs:Number(times.sort((a,b)=>a-b)[2].toFixed(2)),vertices,triangles,bufferBytes:bytes}));
}
