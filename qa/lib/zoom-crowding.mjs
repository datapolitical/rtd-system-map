// Text crowding at a hub, measured as a rider sees it: where the ink of the bus route numbers
// lands on the station's own lettering. Two pictures of the same camera are taken, each with only
// one group of layers showing, against a third with nothing showing (the
// page's own ground shows through the canvas), and their pixels are compared.
//
// STATION: the station's name, its route chips, the line letters and the station bars, widened by
// the name's 2 px halo (a halo is ground-coloured, so it is measured as this margin). BUS: the bus
// route numbers and stacks. Both are drawn without halos.
export const STATION = /^(trial-name|trial-(attached|labels)-(letter|disc)|trial-station.*)$/;
export const BUS = /^(bus-number|bus-stack|picked-number|picked-stack)-(\d+)$/;

// Pixels where both groups have ink. `page` shows /zoom/ at the camera to measure.
export async function crowding(page, { station = STATION, bus = BUS } = {}) {
  const shot = async (group, glyphsOnly) => {
    await page.evaluate(({ source, glyphsOnly }) => {
      // Symbol layers are made transparent rather than hidden, so every label still takes its room
      // and the numbers are placed exactly as on the full map; other layers are hidden.
      const map = window.zoomMap, re = new RegExp(source);
      const paint = (id, k) => { try { return map.getPaintProperty(id, k); } catch { return undefined; } };
      window.__crowdingSaved ??= map.getStyle().layers.map((l) => ({ id: l.id, type: l.type, visibility: l.layout?.visibility ?? 'visible',
        halo: l.type === 'symbol' ? paint(l.id, 'text-halo-width') : undefined,
        text: l.type === 'symbol' ? paint(l.id, 'text-opacity') : undefined, icon: l.type === 'symbol' ? paint(l.id, 'icon-opacity') : undefined }));
      for (const l of window.__crowdingSaved) {
        const shown = re.test(l.id);
        if (l.type === 'symbol') {
          map.setPaintProperty(l.id, 'text-opacity', shown ? l.text : 0);
          map.setPaintProperty(l.id, 'icon-opacity', shown ? l.icon : 0);
          if (l.halo !== undefined) map.setPaintProperty(l.id, 'text-halo-width', glyphsOnly ? 0 : l.halo);
        } else map.setLayoutProperty(l.id, 'visibility', shown && l.visibility !== 'none' ? 'visible' : 'none');
      }
    }, { source: group.source, glyphsOnly });
    await page.waitForFunction(() => window.zoomMap.loaded() && !window.zoomMap.isMoving());
    await page.waitForTimeout(450); // symbol placement and its 200 ms fade
    const png = await page.locator('canvas.maplibregl-canvas').screenshot();
    return png.toString('base64');
  };
  const empty = await shot(/^$/, false);
  const a = await shot(station, true);
  const b = await shot(bus, true);
  await page.evaluate(() => {
    const map = window.zoomMap;
    for (const l of window.__crowdingSaved ?? []) {
      if (l.type === 'symbol') {
        map.setPaintProperty(l.id, 'text-opacity', l.text);
        map.setPaintProperty(l.id, 'icon-opacity', l.icon);
        map.setPaintProperty(l.id, 'text-halo-width', l.halo);
      } else map.setLayoutProperty(l.id, 'visibility', l.visibility);
    }
    delete window.__crowdingSaved;
  });
  return page.evaluate(async ({ empty, a, b }) => {
    const pixels = async (b64) => {
      const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), g = canvas.getContext('2d');
      g.drawImage(bitmap, 0, 0);
      return { w: bitmap.width, h: bitmap.height, data: g.getImageData(0, 0, bitmap.width, bitmap.height).data };
    };
    const [E, A, B] = [await pixels(empty), await pixels(a), await pixels(b)];
    // Ink: a pixel that differs from the empty picture by more than a faint antialiased edge.
    const ink = (P, i) => Math.abs(P.data[i] - E.data[i]) + Math.abs(P.data[i + 1] - E.data[i + 1]) + Math.abs(P.data[i + 2] - E.data[i + 2]) > 96;
    const w = A.w, h = A.h, HALO = 2;
    const glyph = new Uint8Array(w * h);
    for (let p = 0; p < w * h; p++) glyph[p] = ink(A, p * 4);
    const near = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (glyph[y * w + x])
      for (let dy = -HALO; dy <= HALO; dy++) for (let dx = -HALO; dx <= HALO; dx++) {
        const X = x + dx, Y = y + dy;
        if (X >= 0 && Y >= 0 && X < w && Y < h) near[Y * w + X] = 1;
      }
    let station = 0, bus = 0, both = 0;
    const at = [];
    for (let i = 0; i < A.data.length; i += 4) {
      const s = glyph[i / 4], t = ink(B, i);
      if (near[i / 4] && t) { both++; if (at.length < 400) at.push([(i / 4) % w, Math.floor(i / 4 / w)]); }
      station += s; bus += t;
    }
    return { width: A.w, height: A.h, station, bus, both, at };
  }, { empty, a, b });
}
