// Builds the GL programs the map's opening view draws with, in a worker, while the page is still
// downloading the map (index.html starts it first thing). Building them is the graphics chip's
// work, and on a phone that has never opened the map it blocked the page for about 600 ms when
// MapLibre did it at its first draw. Done here, the page stays free, and when MapLibre asks for
// the same programs the phone has them already (DESIGN.md, 2026-11-26).
//
// The programs are the map's own, recorded from it when the site is built (scripts/poster.mjs,
// public/data/programs.json). If they ever differ from what MapLibre asks for, nothing breaks:
// MapLibre builds its programs itself, as it did before.
(async () => {
  const at = () => performance.timeOrigin + performance.now();
  const start = at();
  let built = 0;
  try {
    const { programs } = await (await fetch('/data/programs.json')).json();
    const gl = new OffscreenCanvas(1, 1).getContext('webgl2');
    if (gl) {
      const made = programs.map(({ vertex, fragment }) => {
        const p = gl.createProgram();
        for (const [type, text] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
          const s = gl.createShader(type);
          gl.shaderSource(s, text);
          gl.compileShader(s);
          gl.attachShader(p, s);
        }
        gl.linkProgram(p);
        return p;
      });
      // Asking for each result waits until it is built.
      built = made.filter((p) => gl.getProgramParameter(p, gl.LINK_STATUS)).length;
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {}
  postMessage({ built, start, end: at() });
})();
