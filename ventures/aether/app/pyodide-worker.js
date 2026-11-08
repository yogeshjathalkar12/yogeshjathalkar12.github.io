/* Python analysis runs, executed in the researcher's own browser with Pyodide.
 * Messages in:  { id, code, params, file: { name, bytes } | null }
 * Messages out: { id, type: 'status' | 'stdout' | 'done', ... }
 */
const PYODIDE_VERSION = '0.26.2';
importScripts(`https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/pyodide.js`);

let pyReady = null;

function getPy() {
  if (!pyReady) {
    pyReady = loadPyodide({ indexURL: `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/` });
  }
  return pyReady;
}

const PRELUDE = `
import sys, io, json, base64
try:
    import matplotlib
    matplotlib.use("AGG")
except Exception:
    pass
`;

const COLLECT_FIGURES = `
_aether_figs = []
try:
    import matplotlib.pyplot as _plt
    for _n in _plt.get_fignums():
        _buf = io.BytesIO()
        _plt.figure(_n).savefig(_buf, format="png", dpi=110, bbox_inches="tight")
        _aether_figs.append("data:image/png;base64," + base64.b64encode(_buf.getvalue()).decode())
    _plt.close("all")
except Exception:
    pass
json.dumps(_aether_figs)
`;

self.onmessage = async (ev) => {
  const { id, code, params, file } = ev.data;
  const started = performance.now();
  let output = '';
  const post = (msg) => self.postMessage({ id, ...msg });
  try {
    post({ type: 'status', text: 'Starting Python…' });
    const py = await getPy();
    py.setStdout({ batched: (s) => { output += s + '\n'; post({ type: 'stdout', text: s }); } });
    py.setStderr({ batched: (s) => { output += s + '\n'; post({ type: 'stdout', text: s }); } });

    post({ type: 'status', text: 'Loading packages…' });
    // pull in whatever the code imports (numpy, pandas, scipy, matplotlib, …)
    await py.loadPackagesFromImports(code);

    // fresh namespace per run
    const ns = py.globals.get('dict')();
    py.runPython(PRELUDE, { globals: ns });
    ns.set('params', py.toPy(params || {}));
    ns.set('DATA_PATH', null);
    if (file) {
      py.FS.mkdirTree('/data');
      const path = '/data/' + file.name.replace(/[^\w.\-]+/g, '_');
      py.FS.writeFile(path, new Uint8Array(file.bytes));
      ns.set('DATA_PATH', path);
    }

    post({ type: 'status', text: 'Running…' });
    await py.runPythonAsync(code, { globals: ns });
    const figs = JSON.parse(py.runPython(COLLECT_FIGURES, { globals: ns }));
    const pkgs = Object.fromEntries(Object.entries(py.loadedPackages || {}).map(([k]) => [k, true]));
    ns.destroy();
    post({
      type: 'done', status: 'succeeded', output, error: '', figures: figs,
      duration_ms: Math.round(performance.now() - started),
      environment: { runtime: 'pyodide', pyodide: PYODIDE_VERSION, python: py.runPython('import sys; sys.version.split()[0]'), packages: Object.keys(pkgs) },
    });
  } catch (e) {
    post({
      type: 'done', status: 'failed', output, error: String(e && e.message ? e.message : e), figures: [],
      duration_ms: Math.round(performance.now() - started),
      environment: { runtime: 'pyodide', pyodide: PYODIDE_VERSION },
    });
  }
};
