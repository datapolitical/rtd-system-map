// Step test, only with ?steptest in the address (index.html): taps + as soon as the map is
// drawn (or ?steptest=MS later), then shows how long the step waited, when the next sheet was
// finished, and how many frames drew no part of the sheet in view (bare ground). With
// ?hold=off the page steps at once, as it did before it waited for the next sheet (main.js).
(() => {
  const q = new URLSearchParams(location.search);
  const after = Number(q.get('steptest')) || 0;
  const hold = q.get('hold') !== 'off' && q.get('warm') !== 'off';
  const warmOn = q.get('warm') !== 'off';
  const now = () => performance.now();
  const start = () => {
    const map = window.sheetsMap;
    const info = window.sheetsZooms;
    if (!window.sheetsReady || !map || !info) return setTimeout(start, 20);
    setTimeout(() => run(map, info), after);
  };
  start();
  function run(map, { zooms, rests, ids }) {
    const from = map.getZoom();
    const target = rests.findIndex((r) => r > from + 0.01);
    if (target < 0) return;
    // The sheet drawn at zoom z: each sheet's band reaches halfway to the next (style.js, edge).
    const band = (z) => zooms.findLastIndex((zz, i) => !i || (zooms[i - 1] + zz) / 2 <= z);
    let frames = 0;
    let bare = 0;
    let moved = null;
    let done = null;
    const t0 = now();
    const onRender = () => {
      const z = map.getZoom();
      if (moved === null && Math.abs(z - from) > 0.01) moved = now();
      if (moved === null) return;
      frames++;
      const tm = map.style?.tileManagers?.[`sheet-${ids[band(z)]}`];
      if (!tm?.getRenderableIds().length) bare++;
    };
    const onIdle = () => {
      if (Math.abs(map.getZoom() - rests[target]) > 0.01) return;
      done = now();
      map.off('render', onRender);
      map.off('idle', onIdle);
      report();
    };
    map.on('render', onRender);
    map.on('idle', onIdle);
    document.querySelector('#in').click();
    setTimeout(() => { if (done === null) { map.off('render', onRender); map.off('idle', onIdle); report(); } }, 15000);
    function report() {
      const ms = (t) => (t === null ? 'not by 15 s' : `${((t - t0) / 1000).toFixed(2)} s`);
      const ok = bare === 0;
      const box = document.createElement('div');
      box.innerHTML = `<b>Step test: hold ${hold ? 'ON (test copy)' : 'OFF (like the live map)'}</b>
        <div>Tapped + ${after ? `${(after / 1000).toFixed(1)} s` : 'as soon as'} the map appeared</div>
        <div>Zoom started after: <b>${ms(moved)}</b></div>
        <div>Next sheet finished: <b>${ms(done)}</b></div>
        <div style="color:${ok ? '#6fdc8c' : '#ff8a80'}">Blank frames: <b>${bare}</b> of ${frames}${ok ? ' (no flash)' : ' (flash)'}</div>
        <div style="opacity:.7;font-size:12px">Again: open the link in a new private tab (this tab now has the tiles saved).</div>
        <div style="opacity:.7;font-size:11px">${innerWidth}×${innerHeight} · ${new Date().toLocaleTimeString()}</div>`;
      Object.assign(box.style, {
        position: 'fixed', left: '12px', right: '12px', top: 'calc(env(safe-area-inset-top) + 56px)', zIndex: 9999,
        padding: '12px 14px', font: '14px/1.45 system-ui, sans-serif', background: 'rgba(0,0,0,.85)', color: '#fff', borderRadius: '12px',
      });
      document.body.append(box);
      window.stepTest = { warm: warmOn, hold, after, started: moved && moved - t0, finished: done && done - t0, bare, frames };
    }
  }
})();
