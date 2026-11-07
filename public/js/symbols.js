// Every picture the map draws itself, on a canvas, the first time a layer
// asks for it by id (DESIGN.md, "Symbols"): station ticks, capsules and the
// hub's ring, rail bullets, line-end signs, live vehicles, highway shields,
// the Park-n-Ride and transit-center signs, the FlexRide hatch, and the clear
// image the keep-out layers use. The Key draws its marks with the same code
// (legend.js), so the two can't drift apart. Colors come from the palette in
// use; sizes shared with the build are in sizes.js.

import { P } from './palette.js';
import { HUB_EXTRA, RAIL_WIDTH, STATION_SPACING, TICK } from './sizes.js';

// Never below 2, so symbols stay sharp when a screen is zoomed.
export const RATIO = Math.max(2, Math.ceil(devicePixelRatio || 1));

// A live bus arrow's ring, in px outside its edge (addSymbol).
const BUS_RING = 2.5;

export function canvas(width, height) {
  const c = document.createElement('canvas');
  c.width = width * RATIO;
  c.height = height * RATIO;
  const ctx = c.getContext('2d');
  ctx.scale(RATIO, RATIO);
  return ctx;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export function addSymbol(map, id, lines) {
  if (map.hasImage(id)) return;
  const add = (ctx, options = {}) =>
    map.addImage(id, ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height), { pixelRatio: RATIO, ...options });

  // Line-end signs: "sign|E R|". A white sign with the lines' bullets. (A
  // name after the last bar would be drawn beside them; the map sends none.)
  if (id.startsWith('sign|')) {
    const [, routes, ...rest] = id.split('|');
    const name = rest.join('|');
    const margin = 4;
    const h = 22;
    const bullet = 16;
    const font = '700 12px Overpass, system-ui, sans-serif';
    const measure = canvas(1, 1);
    measure.font = font;
    const text = measure.measureText(name);
    const bullets = routes.split(' ').filter(Boolean);
    const pad = 3;
    const w = pad + bullets.length * (bullet + 2) + (name ? 4 + Math.ceil(text.width) + 8 : pad - 2);
    const ctx = canvas(w + margin * 2, h + margin * 2);
    ctx.translate(margin, margin);
    ctx.shadowColor = P.sign.shadow;
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 1;
    roundRect(ctx, 0, 0, w, h, h / 2);
    ctx.fillStyle = P.sign.fill;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    let x = pad;
    for (const route of bullets) {
      const line = lines.of(route);
      ctx.beginPath();
      ctx.arc(x + bullet / 2, h / 2, bullet / 2, 0, Math.PI * 2);
      ctx.fillStyle = line?.color ?? P.ink;
      ctx.fill();
      ctx.font = '800 10.5px Overpass, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = line?.letter ?? P.white;
      const cap = ctx.measureText(route).actualBoundingBoxAscent;
      ctx.fillText(route, x + bullet / 2, h / 2 + cap / 2);
      x += bullet + 2;
    }
    x += 4;
    ctx.font = font;
    ctx.textAlign = 'left';
    ctx.fillStyle = P.sign.text;
    ctx.fillText(name, x, h / 2 + text.actualBoundingBoxAscent / 2 - 0.5);
    return add(ctx);
  }

  // Station marks are drawn at the widest zoom's line spacing and scaled down
  // with the lines (stationSize), to under half size at zoom 9. An edge drawn
  // for full size is then most of a small mark: a dark-mode tick, dark with a
  // light edge, read as a light pill. So each mark's edge is drawn for the
  // size it's mostly seen at, about a pixel on screen, and the fill is most
  // of the mark.
  const capsule = (span, d, stroke) => {
    const length = (span - 1) * STATION_SPACING + d;
    const ctx = canvas(length + 2, d + 2);
    roundRect(ctx, 1 + stroke / 2, 1 + stroke / 2, length - stroke, d - stroke, (d - stroke) / 2);
    ctx.fillStyle = P.station.fill;
    ctx.fill();
    ctx.lineWidth = stroke;
    ctx.strokeStyle = P.station.edge;
    ctx.stroke();
    return add(ctx);
  };

  // Stations from far out: "dot-3" is a small tick across three lines, "dot-1"
  // a dot; a station where lines meet is a little stronger than one that
  // serves one. Seen at about half size (zoom 9 to 11), so a 1.1 px edge is
  // about half a pixel and the fill three quarters of the mark. Its size
  // across the track is TICK (sizes.js).
  if (id.startsWith('dot-')) {
    const span = Number(id.slice('dot-'.length)) || 1;
    return capsule(span, span > 1 ? TICK.across : TICK.single, 1.1);
  }

  // Stations: "station-3" spans three lines side by side. Seen from about
  // half size at zoom 11 to full size at 16: a 1.5 px edge is 0.8 px to 1.5.
  if (id.startsWith('station-')) {
    const span = Number(id.slice('station-'.length)) || 1;
    return capsule(span, RAIL_WIDTH.at(-1) + 4, 1.5);
  }

  // The hub, "hub-3": a ring around the lines that meet there, as wide as a
  // tick across `span` lines plus HUB_EXTRA (sizes.js), so it encloses the
  // knot. Not turned: lines leave it every way. A heavier edge than a tick's,
  // about 1.2 px on screen, so it reads as a ring.
  if (id.startsWith('hub-')) {
    const span = Number(id.slice('hub-'.length)) || 1;
    const d = (span - 1) * STATION_SPACING + HUB_EXTRA;
    const stroke = 2.6;
    const ctx = canvas(d + 2, d + 2);
    ctx.beginPath();
    ctx.arc(1 + d / 2, 1 + d / 2, (d - stroke) / 2, 0, Math.PI * 2);
    ctx.fillStyle = P.station.fill;
    ctx.fill();
    ctx.lineWidth = stroke;
    ctx.strokeStyle = P.station.edge;
    ctx.stroke();
    return add(ctx);
  }

  // Rail bullets: a circle in the line's color, outlined like the line.
  // Vehicles (Live): a rounded arrow, a circle drawn out to a point, turned
  // to the vehicle's heading by the layer. "vehicle-E" is a train in its
  // line's color on a ring of land color. "vehicle-bus" is a bus in ink on
  // a wide ring of the casing color (white in light, near-black in dark): a
  // bus sits on a bus line, which in light is the same ink, so the ring is
  // what cuts it out of the line (DESIGN.md, "Symbols"). The ring is drawn
  // first and the arrow over it, so all of its width shows. The letter or
  // number is text over it, so it stays upright however the arrow turns.
  const vehicle = id.match(/^vehicle-(.+)$/);
  if (vehicle) {
    const train = vehicle[1] !== 'bus';
    const line = train ? lines.of(vehicle[1]) : null;
    const size = 24;
    const r = train ? 7.5 : 5.5;
    const c = size / 2;
    const tip = c - r * 1.55; // how far the point reaches past the circle
    const spread = Math.acos(r / (c - tip)); // where the point's sides meet the circle
    const ctx = canvas(size, size);
    ctx.beginPath();
    ctx.moveTo(c, tip);
    ctx.arc(c, c, r, -Math.PI / 2 - spread, -Math.PI / 2 + spread, true);
    ctx.closePath();
    ctx.lineJoin = 'round';
    if (train) {
      ctx.fillStyle = line?.color ?? P.ink;
      ctx.fill();
      ctx.lineWidth = 1.75;
      ctx.strokeStyle = P.land;
      ctx.stroke();
    } else {
      ctx.lineWidth = BUS_RING * 2;
      ctx.strokeStyle = P.casing;
      ctx.stroke();
      ctx.fillStyle = P.ink;
      ctx.fill();
    }
    return add(ctx);
  }

  if (id.startsWith('bullet-')) {
    const line = lines.of(id.slice('bullet-'.length));
    const ctx = canvas(20, 20);
    ctx.beginPath();
    ctx.arc(10, 10, 9, 0, Math.PI * 2);
    ctx.fillStyle = line?.color ?? P.ink;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = P.bulletRing;
    ctx.stroke();
    return add(ctx);
  }

  // A one-pixel clear image, scaled by icon-size into an invisible box. The
  // 'keep-out-*' layers (basemap.js) use it to hold every name off the lines
  // and stations: a symbol that takes up room but draws nothing.
  if (id === 'clear') {
    return add(canvas(1, 1));
  }

  // Highway shields, in quiet gray: the interstate shield and the US badge,
  // sized for the number's length ("shield-us-interstate-2").
  const shield = id.match(/^shield-(us-interstate|us-highway)-(\d)$/);
  if (shield) {
    const digits = Number(shield[2]);
    const interstate = shield[1] === 'us-interstate';
    const w = interstate ? 12 + digits * 5 : 12 + digits * 5;
    const h = 19;
    const ctx = canvas(w, h);
    ctx.beginPath();
    if (interstate) {
      ctx.moveTo(1, 2.5);
      ctx.quadraticCurveTo(w / 2, 0, w - 1, 2.5);
      ctx.bezierCurveTo(w + 0.5, 9, w - 3, 15, w / 2, h - 0.8);
      ctx.bezierCurveTo(3, 15, -0.5, 9, 1, 2.5);
    } else {
      // The US-route shield: shoulders either side of a notch at the top,
      // tapering to a point, so it can't be taken for a bus tag's rounded box.
      ctx.moveTo(1, 3);
      ctx.lineTo(w * 0.3, 1);
      ctx.lineTo(w / 2, 2.8);
      ctx.lineTo(w * 0.7, 1);
      ctx.lineTo(w - 1, 3);
      ctx.lineTo(w - 1, 11);
      ctx.lineTo(w / 2, h - 0.8);
      ctx.lineTo(1, 11);
      ctx.closePath();
    }
    ctx.fillStyle = P.shieldFill;
    ctx.fill();
    ctx.lineJoin = 'round';
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = P.shieldEdge;
    ctx.stroke();
    return add(ctx);
  }

  // The ends of an open route: a white dot ringed in ink.
  if (id === 'sel-end') {
    const ctx = canvas(18, 18);
    ctx.beginPath();
    ctx.arc(9, 9, 6, 0, Math.PI * 2);
    ctx.fillStyle = P.selEnd.fill;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = P.selEnd.ring;
    ctx.stroke();
    return add(ctx);
  }

  if (id === 'hatch') {
    const ctx = canvas(6, 6);
    ctx.strokeStyle = P.flex.hatch;
    ctx.lineWidth = 0.9;
    for (const offset of [-6, 0, 6]) {
      ctx.beginPath();
      ctx.moveTo(offset, 6);
      ctx.lineTo(offset + 6, 0);
      ctx.stroke();
    }
    return add(ctx);
  }

  // Park-n-Ride: a small slate "P" sign.
  if (id === 'parking') {
    const ctx = canvas(17, 17);
    roundRect(ctx, 0.5, 0.5, 16, 16, 3.5);
    ctx.fillStyle = P.pnr.rim;
    ctx.fill();
    roundRect(ctx, 1.5, 1.5, 14, 14, 2.75);
    ctx.fillStyle = P.pnr.plate;
    ctx.fill();
    ctx.fillStyle = P.pnr.mark;
    ctx.font = '800 11.5px Overpass, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('P', 8.5, 9.4);
    return add(ctx);
  }

  // Transit center: a rounded square with a bus, never a "T" (that's the T Line).
  if (id === 'transit-center') {
    const ctx = canvas(17, 17);
    roundRect(ctx, 0.5, 0.5, 16, 16, 3.5);
    ctx.fillStyle = P.transit.rim;
    ctx.fill();
    roundRect(ctx, 1.5, 1.5, 14, 14, 2.75);
    ctx.fillStyle = P.transit.plate;
    ctx.fill();
    ctx.fillStyle = P.transit.mark;
    roundRect(ctx, 4.5, 3.8, 8, 8.4, 1.6);
    ctx.fill();
    ctx.fillStyle = P.transit.windows;
    ctx.fillRect(5.6, 5, 5.8, 3.2);
    ctx.beginPath();
    ctx.arc(6.4, 10.4, 0.8, 0, Math.PI * 2);
    ctx.arc(10.6, 10.4, 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = P.transit.mark;
    ctx.fillRect(5.3, 12, 1.6, 1.3);
    ctx.fillRect(10.1, 12, 1.6, 1.3);
    return add(ctx);
  }
}

// Symbols are drawn the first time the map needs them, in our own font.
export function drawOnDemand(map, lines) {
  map.setMissingStyleImageResolver(async (id) => {
    await Promise.all(['700 12px Overpass', '800 12px Overpass'].map((f) => document.fonts.load(f))).catch(() => {});
    addSymbol(map, id, lines);
  });
}
