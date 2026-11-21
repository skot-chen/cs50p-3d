// Runs edited code with Pyodide (real CPython in the browser) inside a Web Worker,
// so an endless loop can be stopped by terminating the worker.
// in: {id, code, stdin}   out: {id, out, err} | {fatal}
/* global importScripts, loadPyodide */
importScripts("https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js");

const booting = loadPyodide().catch((e) => { self.postMessage({ fatal: String(e) }); throw e; });

self.onmessage = async ({ data: m }) => {
  const py = await booting;
  let out = "";
  const dec = new TextDecoder();
  const write = { write: (b) => { out += dec.decode(b, { stream: true }); return b.length; } };
  py.setStdout(write);
  py.setStderr(write);
  const lines = (m.stdin || "").split("\n");
  py.setStdin({ stdin: () => (lines.length ? lines.shift() : null) });
  // Each run starts in a fresh, empty folder so files from an earlier run never leak in.
  const dir = "/run" + m.id;
  py.FS.mkdirTree(dir);
  py.FS.chdir(dir);
  const ns = py.globals.get("dict")();
  try {
    await py.runPythonAsync(m.code, { globals: ns, filename: "<exec>" });
    self.postMessage({ id: m.id, out, err: "" });
  } catch (e) {
    let err = String(e && e.message ? e.message : e);
    // Hide Pyodide's own frames so the traceback looks like the one a terminal shows.
    const k = err.indexOf('  File "<exec>"');
    if (k > 0) err = "Traceback (most recent call last):\n" + err.slice(k);
    self.postMessage({ id: m.id, out, err });
  } finally {
    ns.destroy();
  }
};
