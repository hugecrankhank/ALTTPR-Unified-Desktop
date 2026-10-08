// Run the generator under Pyodide (the same WebAssembly Python a browser uses).
// node pyo.mjs <srcdir> <label> <seed> [args...]   (several runs: separated by ' -- ')
import { loadPyodide } from 'pyodide';
import fs from 'node:fs';

const [src, ...rest] = process.argv.slice(2);
const runs = [];
let cur = [];
for (const a of rest) { if (a === '--next') { runs.push(cur); cur = []; } else cur.push(a); }
if (cur.length) runs.push(cur);

let t = Date.now();
const py = await loadPyodide({ env: { PYTHONHASHSEED: '0', HOME: '/home/pyodide' } });
console.log('STAGE load', (Date.now() - t) / 1000);
t = Date.now();
await py.loadPackage(['pyyaml', 'micropip']);
const micropip = py.pyimport('micropip');
for (const p of ['fast-enum', 'python-bps-continued']) {
  try { await micropip.install(p); console.log('PKG ok', p); }
  catch (e) { console.log('PKG fail', p, String(e).split('\n').slice(-2).join(' ')); }
}
console.log('STAGE packages', (Date.now() - t) / 1000);
py.FS.mkdirTree('/gw');
py.FS.mount(py.FS.filesystems.NODEFS, { root: src }, '/gw');
py.runPython(`
import os, sys, types
os.chdir('/gw'); sys.path.insert(0, '/gw')
try:
    import bps.apply, bps.io
except Exception as e:
    print('STUB bps', e)
    m = types.ModuleType('bps'); m.apply = types.ModuleType('bps.apply'); m.io = types.ModuleType('bps.io')
    sys.modules.update({'bps': m, 'bps.apply': m.apply, 'bps.io': m.io})
`);
const gen = fs.readFileSync(new URL('./gen.py', import.meta.url), 'utf8');
for (const r of runs) {
  py.globals.set('GEN_ARGS', py.toPy(r));
  t = Date.now();
  try { py.runPython(gen); }
  catch (e) { console.log('FAIL', r.slice(0, 2).join(' '), String(e).split('\n').slice(-6).join(' | ')); }
  console.log('WALL', r[0], r[1], (Date.now() - t) / 1000);
}
