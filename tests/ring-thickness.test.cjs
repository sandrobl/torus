const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');
const html = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
const profileCode = html.slice(html.indexOf('function innerRadius()'), html.indexOf('function settingPlan()'));
function profile(thickness, dome = 0, emb = 'flush', y = 0, angle = 0) {
  const context = vm.createContext({
    st: { thickness, w: 6, dome, emb, size:54,profile:'comfort',stones:true,pattern:'none',mainStoneSize:1.5,sideStoneSize:1,side:0 },
    THREE: { MathUtils: {
      clamp: (x, lo, hi) => Math.max(lo, Math.min(hi, x)),
      smoothstep: (x, lo, hi) => { const t = Math.max(0, Math.min(1, (x-lo)/(hi-lo))); return t*t*(3-2*t); }
    }}
  });
  vm.runInContext(profileCode, context);
  return vm.runInContext(`ringProfile(${y}, ${angle})`, context);
}
test('thickness changes the outer radius while keeping the bore fixed', () => {
  for (const [thickness, outer] of [[1, 9.594366926962348], [1.9, 10.494366926962349], [4, 12.594366926962348]]) {
    const p = profile(thickness);
    assert.ok(Math.abs(p.outer-outer) < 1e-10, `outer radius for ${thickness} mm: ${p.outer}`);
    assert.ok(Math.abs(p.inner-8.594366926962348)<1e-10);
  }
});
test('thickness preserves curvature and groove depth', () => {
  for (const dome of [0, 40, 100, 200]) for (const emb of ['flush', 'groove', 'kanal']) {
    for (const y of [-2.84, -1, 0, 1, 2.84]) {
      const thin = profile(1, dome, emb, y);
      const thick = profile(4, dome, emb, y);
      assert.ok(Math.abs(thick.outer-thin.outer-3) < 1e-10);
      assert.equal(thin.inner, thick.inner);
      assert.ok(thin.outer > thin.inner, `${emb}, dome ${dome}, y ${y}: band must remain solid`);
    }
  }
});
