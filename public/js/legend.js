// The key (DESIGN.md, "The key"): the bus tiers, each rail line with where
// it goes and how often, and every other mark on the map, each drawn by the
// map's own code at the map's zoom, in the theme in use, with a Live section
// while Live is on. buildLegend fills the <details id="legend"> card and
// returns it with `follow`, `redraw` and `setLive` for main.js to call.

import { evaluate, drawsAt, settledFrom, strengthAt } from './evaluate.js';
import { dotStates } from './age.js';
import { STALE_S } from './realtime.js';
import { STATE } from './highlight.js';
import { loadData } from './select.js';
import { vehicleLayers } from './live.js';
import { P, PALETTES } from './palette.js';
import { PHONE_QUERY, TIERS, bullet, esc, ends, middayLabel, bundledIds } from './shared.js';
import { ZOOMS } from './sizes.js';
import { RATIO, addSymbol, canvas } from './symbols.js';
import { transitLines, transitMarks } from './network.js';

// Phones, and any short screen (a phone on its side): key closed.
const PHONE = matchMedia(PHONE_QUERY).matches;

// The key draws nothing of its own (DESIGN.md, "The key"). Each mark in it is
// the map's: an image from addSymbol, sized by its layer's icon-size at the
// map's zoom, or a line, circle or area from its layer's own paint. The layer
// definitions are the ones the map is given (transitLines, transitMarks,
// vehicleLayers), made again in the theme in use, and their expressions are
// worked out for the zoom by evaluate.js.
const keyLayers = (lines) => new Map([...transitLines(lines), ...transitMarks(lines), ...vehicleLayers(lines)].map((l) => [l.id, l]));
// Nothing chosen: the global state's defaults, as the map starts.
const KEY_STATE = Object.fromEntries(Object.entries(STATE).map(([k, v]) => [k, v.default]));
// Where a station's tick and capsule crossfade, the key shows the one at
// least half drawn (both only at the exact middle).
const KEY_SHOWN = 0.5;
// A bus tier's swatch is its line as drawn at this zoom, wide enough to see
// each tier's width and dashes.
const SWATCH_ZOOM = ZOOMS[2];

// A symbol the map draws, as the map has it: the same canvas code (addSymbol)
// with a stand-in for the map, so the key can't drift from the map.
function symbolData(id, lines) {
  let image = null;
  addSymbol({ hasImage: () => false, addImage: (_, data) => (image = data) }, id, lines);
  return image;
}

// Drawn pixels as an <img> `width` by `height` CSS px. `mark` names what drew
// it (the map's image id, or the layers) and `size` the scale it is shown at,
// so the key can be checked against the map.
function imgOf(data, width, height, alt, mark, size = 1) {
  const c = document.createElement('canvas');
  c.width = data.width;
  c.height = data.height;
  c.getContext('2d').putImageData(data, 0, 0);
  const r = (v) => Math.round(v * 1000) / 1000;
  return `<img src="${c.toDataURL()}" width="${r(width)}" height="${r(height)}" alt="${esc(alt)}" data-mark="${esc(mark)}" data-size="${r(size)}" />`;
}
const ctxImage = (ctx, alt, mark) => imgOf(ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height), ctx.canvas.width / RATIO, ctx.canvas.height / RATIO, alt, mark);

// A symbol the map draws, as a picture for the key, at `size` (its layer's
// icon-size): the map's own image, scaled as the map scales it.
function symbolImage(id, lines, alt = '', size = 1) {
  const data = symbolData(id, lines);
  return data ? imgOf(data, (data.width / RATIO) * size, (data.height / RATIO) * size, alt, id, size) : '';
}

// What each station mark is, for a screen reader.
function markName(id) {
  const span = Number(id.split('-').at(-1)) || 1;
  if (id.startsWith('dot-')) return span > 1 ? 'Small tick across the lines' : 'Small dot on the line';
  if (id.startsWith('station-')) return span > 1 ? 'Station capsule across the lines' : 'Round station mark';
  if (id.startsWith('hub-')) return 'Ring around the lines';
  return '';
}

// A circle layer's mark (closed stations, bus stops), from its paint at
// `at`. MapLibre draws a circle's stroke outside its radius.
function circleImage(layer, at, alt) {
  const p = layer.paint;
  const r = evaluate(p['circle-radius'], at);
  const sw = evaluate(p['circle-stroke-width'] ?? 0, at);
  const d = Math.ceil(2 * (r + sw)) + 2;
  const ctx = canvas(d, d);
  ctx.beginPath();
  ctx.arc(d / 2, d / 2, r, 0, Math.PI * 2);
  ctx.fillStyle = evaluate(p['circle-color'], at);
  ctx.fill();
  if (sw) {
    ctx.beginPath();
    ctx.arc(d / 2, d / 2, r + sw / 2, 0, Math.PI * 2);
    ctx.lineWidth = sw;
    ctx.strokeStyle = evaluate(p['circle-stroke-color'], at);
    ctx.stroke();
  }
  return ctxImage(ctx, alt, layer.id);
}

// An area as the map fills it, on the land: a fill layer's pattern or color
// at its opacity, and an edge layer's dashed line. `soft` fades the fill in
// across the swatch, as the district's wash fades in at its edge.
function areaImage({ fill, edge, soft = false }, lines, at, alt) {
  const [w, h] = [30, 16];
  const ctx = canvas(w, h);
  ctx.fillStyle = P.land;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = evaluate(fill.paint['fill-opacity'] ?? 1, at);
  const pattern = fill.paint['fill-pattern'] && symbolData(evaluate(fill.paint['fill-pattern'], at), lines);
  if (pattern) {
    const tile = document.createElement('canvas');
    tile.width = pattern.width;
    tile.height = pattern.height;
    tile.getContext('2d').putImageData(pattern, 0, 0);
    const paint = ctx.createPattern(tile, 'repeat');
    paint.setTransform(new DOMMatrix().scale(1 / RATIO));
    ctx.fillStyle = paint;
  } else if (soft) {
    const color = evaluate(fill.paint['fill-color'], at);
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0.3, `${color}00`);
    g.addColorStop(0.7, color);
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = evaluate(fill.paint['fill-color'], at);
  }
  ctx.fillRect(0, 0, w, h);
  if (edge) {
    const lw = evaluate(edge.paint['line-width'], at);
    ctx.globalAlpha = evaluate(edge.paint['line-opacity'] ?? 1, at);
    ctx.setLineDash((evaluate(edge.paint['line-dasharray'], at) ?? []).map((d) => d * lw));
    ctx.lineWidth = lw;
    ctx.strokeStyle = evaluate(edge.paint['line-color'], at);
    ctx.strokeRect(lw / 2, lw / 2, w - lw, h - lw);
  }
  return ctxImage(ctx, alt, [fill.id, edge?.id].filter(Boolean).join('+'));
}

// A layer's paint opacity, whichever kind it has.
const opacityOf = (layer) => Object.entries(layer.paint ?? {}).find(([k]) => k.endsWith('-opacity'))?.[1];

// How often a line comes at midday on weekdays, short enough to sit beside its name.
function howOften(r) {
  if (r.wk) return `${r.wk} min`;
  if (r.tier === 'peak') return 'Rush hours';
  if (r.tier === 'limited') return 'A few trips';
  return 'No weekday trains';
}

const row = (icon, text) => `<li><span class="sym">${icon}</span><span>${text}</span></li>`;

export function buildLegend(meta, lines) {
  const legend = document.getElementById('legend');
  legend.open = !PHONE;
  document.getElementById('legend-time').textContent = middayLabel();
  // The key button's icon: the first line's outline color (light theme) or its
  // lifted fill (dark theme); app.css picks the pair.
  const first = [...lines.byRoute.values()][0];
  if (first) {
    legend.style.setProperty('--key-rail', first.light.edge);
    legend.style.setProperty('--key-rail-dark', first.dark.color);
  }
  // Its bus line: the frequent tier, as the map draws it in each theme.
  legend.style.setProperty('--key-bus', PALETTES.light.tier.frequent);
  legend.style.setProperty('--key-bus-dark', PALETTES.dark.tier.frequent);

  // Each line with where it goes and how often it comes at midday, in plain
  // sight (a tooltip is no use on a phone).
  document.getElementById('legend-rail').innerHTML = meta.rail
    .map(
      (r) =>
        `<li>${bullet(r, lines)}<span class="name">${esc(Array.isArray(r.ends) && r.ends.length ? r.ends.join(' – ') : ends(r.name))}</span><span class="often">${esc(howOften(r))}</span></li>`,
    )
    .join('');

  const counts = meta.counts ?? {};
  const unserved = meta.stations?.unserved ?? [];
  let map = null; // the map whose zoom the key shows (follow)
  let live = false; // whether Live is on (setLive)
  let stations = []; // every station's properties, once loaded

  // Only the tiers on the map today; the two slowest share one look, so one
  // row. Each swatch is the line itself: the bus layer that draws the tier,
  // its width, color, dashes and caps at SWATCH_ZOOM.
  const present = meta.tiers ?? {};
  const drawTiers = (layers) => {
    const bus = [...bundledIds(['bus']), 'bus-part-time', 'bus-limited'].map((id) => layers.get(id));
    const seen = new Set();
    document.getElementById('legend-tiers').innerHTML = TIERS.filter((t) => present[t.id] && !seen.has(t.label) && seen.add(t.label))
      .map((t) => {
        const props = { mode: 'bus', tier: t.id };
        const layer = bus.find((l) => drawsAt(l, SWATCH_ZOOM, props, KEY_STATE));
        if (!layer) return '';
        const at = { zoom: SWATCH_ZOOM, props, state: KEY_STATE };
        const w = evaluate(layer.paint['line-width'], at);
        const cap = layer.layout?.['line-cap'] ?? 'butt';
        const dashes = evaluate(layer.paint['line-dasharray'], at);
        const dash = dashes ? ` stroke-dasharray="${dashes.map((d) => d * w).join(' ')}"` : '';
        const inset = dashes && cap === 'round' ? 3 : 1;
        const line = `<svg class="swatch" viewBox="0 0 36 8" width="36" height="8" aria-hidden="true" data-mark="${layer.id}"><path d="M${inset} 4H${36 - inset + (inset > 1 ? 1 : 0)}" stroke="${evaluate(layer.paint['line-color'], at)}" stroke-width="${w}" stroke-linecap="${cap}"${dash} /></svg>`;
        return `<li>${line}<span>${t.label}</span></li>`;
      })
      .join('');
  };

  // Everything else the map draws, only while it's on the map, each as the
  // map draws it at its zoom now.
  const drawSymbols = (layers) => {
    const zoom = map.getZoom();
    const at = (z, props = {}) => ({ zoom: z, props, state: KEY_STATE });
    const icon = (layer, z, props, alt) => {
      const image = evaluate(layer.layout['icon-image'], at(z, props));
      return symbolImage(image, lines, alt ?? markName(image), evaluate(layer.layout['icon-size'] ?? 1, at(z, props)));
    };
    // A mark that only arrives closer in is shown as it first looks once
    // it has faded in: the row says what it is, not whether it's on screen.
    const settled = (layer) => Math.max(zoom, settledFrom(opacityOf(layer), layer.minzoom ?? 0));

    // Stations: the mark the map draws now, for a one-line station and for
    // one across the most lines (from the data), and the hub's ring while it
    // has one. Below the first station marks there is nothing to show.
    const served = stations.filter((p) => p.served && !p.meet);
    const earliest = (a, b) => (a.tickFrom ?? 0) - (b.tickFrom ?? 0);
    const one = served.filter((p) => p.span === 1).sort(earliest)[0];
    const many = served.filter((p) => p.span > 1 && (p.tick ?? p.span) === p.span).sort((a, b) => earliest(a, b) || b.span - a.span)[0];
    const marks = (p) => {
      const drawn = ['stations-dot', 'stations'].map((id) => ({ layer: layers.get(id), s: strengthAt(layers.get(id), zoom, p, KEY_STATE) })).filter((m) => m.s > 0);
      const strong = drawn.filter((m) => m.s >= KEY_SHOWN);
      return (strong.length ? strong : drawn.sort((a, b) => b.s - a.s).slice(0, 1)).map((m) => icon(m.layer, zoom, p)).join('');
    };
    const station = [one, many].filter(Boolean).map(marks).filter(Boolean);
    const hub = stations.find((p) => p.served && p.meet);
    const hubLayer = layers.get('stations-hub');
    const rows = [
      stations.length
        ? station.length
          ? [`<span class="stack">${station.join('')}</span>`, 'Rail station']
          : ['', 'Rail stations: zoom in to see them']
        : null,
      hub && strengthAt(hubLayer, zoom, hub, KEY_STATE) >= KEY_SHOWN ? [icon(hubLayer, zoom, hub), `${esc(hub.label ?? hub.name)}, where the most lines meet`] : null,
      unserved.length ? [circleImage(layers.get('stations-unserved'), at(settled(layers.get('stations-unserved')), { served: false }), 'Gray ring'), 'Closed: no trains this week'] : null,
      counts.facilities ? [icon(layers.get('facilities'), settled(layers.get('facilities')), { spaces: 1 }, 'P sign'), 'Park-n-Ride'] : null,
      counts.facilities ? [symbolImage('transit-center', lines, 'Bus sign', evaluate(layers.get('facilities').layout['icon-size'], at(settled(layers.get('facilities'))))), 'Transit center'] : null,
      counts.stops ? [circleImage(layers.get('stops'), at(settled(layers.get('stops'))), 'Small dot'), 'Bus stop, when zoomed in close'] : null,
      counts.flexride
        ? (() => {
            const fill = layers.get('flexride-fill');
            const edge = layers.get('flexride-line');
            const z = Math.max(settled(fill), settled(edge));
            return [areaImage({ fill, edge }, lines, at(z), 'Hatched area with a dashed edge'), 'FlexRide: book a ride in this area'];
          })()
        : null,
      counts.boundary ? [areaImage({ fill: layers.get('district-wash'), soft: true }, lines, at(zoom), 'Gray wash'), "Outside RTD's district"] : null,
    ];
    document.getElementById('legend-symbols').innerHTML = rows.filter(Boolean).map(([i, t]) => row(i, t)).join('');

    // Live: a train and a bus as the map draws them now, and what the dot
    // on the Live pill says. Only while Live is on.
    const head = document.getElementById('legend-live-head');
    const list = document.getElementById('legend-live');
    head.hidden = list.hidden = !live;
    if (!live) return (list.innerHTML = '');
    const route = meta.rail[0]?.route;
    const vehicle = (id, props, alt, text, none) => {
      const layer = layers.get(id);
      return drawsAt(layer, zoom, props, KEY_STATE) ? row(icon(layer, zoom, props, alt), text) : row('', none);
    };
    list.innerHTML = [
      route ? vehicle('vehicles-rail', { mode: 'rail', route }, 'Train arrow', "Train, in its line's color, pointing the way it's going", 'Trains: zoom in to see them') : '',
      vehicle('vehicles-bus', { mode: 'bus' }, 'Bus arrow', "Bus, pointing the way it's going", 'Buses: zoom in to see them'),
      ...dotStates(STALE_S).map((d) => `<li class="words" data-state="${d.state}">${esc(d.text)}</li>`),
    ].join('');
  };

  const draw = () => {
    const layers = keyLayers(lines);
    drawTiers(layers);
    if (map) drawSymbols(layers);
    moreBelow(legend);
  };
  draw();
  // The P is text, so draw it again once the font is here.
  document.fonts.load('800 12px Overpass').then(draw).catch(() => {});
  loadData('stations').then(
    (data) => {
      stations = data.features.map((f) => f.properties);
      draw();
    },
    () => {},
  );

  const built = new Date(meta.built).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  document.getElementById('legend-note').textContent =
    `Not affiliated with RTD. Data from RTD's public map and GTFS feeds, updated ${built}.`;

  // A long key scrolls inside its box, and says so while there's more below.
  // Opened, it is drawn again for the zoom the map is at.
  legend.addEventListener('scroll', () => moreBelow(legend));
  legend.addEventListener('toggle', () => (legend.open ? draw() : moreBelow(legend)));
  addEventListener('resize', () => moreBelow(legend));
  moreBelow(legend);
  // The marks are made for one theme, one zoom and Live on or off; drawn
  // again when any of them changes.
  legend.redraw = draw;
  legend.follow = (m) => {
    map = m;
    map.on('zoomend', () => legend.open && draw());
    draw();
  };
  legend.setLive = (on) => {
    live = on;
    draw();
  };
  return legend;
}

function moreBelow(legend) {
  const scrolls = legend.open && legend.scrollHeight > legend.clientHeight + 4;
  legend.classList.toggle('scrolls', scrolls);
  legend.classList.toggle('at-end', !scrolls || legend.scrollTop + legend.clientHeight >= legend.scrollHeight - 6);
}
