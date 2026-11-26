// Station-name checks for the zoom trial: read from the trial's drawings, not from the page.

// The order of each name's route chips in every drawing, read top to bottom, then left to right.
// A station may split its chips between two names on a closer drawing (Union Station names each
// platform from about 15, as sheet 4 does), so what must hold is the order of every pair of routes
// shown together: a station whose chips put one route before another in one drawing and after it
// in another is reported.
export function chipOrders(bundle) {
  const orders = new Map();
  for (const frame of bundle.frames) {
    const names = new Map(frame.labels.features.filter((f) => f.properties.kind === 'name').map((f) => [f.properties.key, f.properties.name]));
    const chips = new Map();
    for (const f of frame.labels.features) {
      if (f.properties.kind !== 'letter' || !f.properties.small || !f.labelOffset) continue;
      const key = f.properties.key.slice(0, f.properties.key.lastIndexOf(':'));
      if (!chips.has(key)) chips.set(key, []);
      chips.get(key).push(f);
    }
    for (const [key, list] of chips) {
      const routes = list.sort((a, b) => Math.round(a.labelOffset[1] * 10) - Math.round(b.labelOffset[1] * 10) || a.labelOffset[0] - b.labelOffset[0])
        .map((f) => f.properties.route);
      const name = names.get(key) ?? key;
      if (!orders.has(name)) orders.set(name, { seen: new Map(), before: new Set() });
      const station = orders.get(name);
      const order = routes.join(' ');
      if (!station.seen.has(order)) station.seen.set(order, []);
      station.seen.get(order).push(frame.zoom);
      for (let i = 0; i < routes.length; i++) for (let j = i + 1; j < routes.length; j++) station.before.add(`${routes[i]}\u0000${routes[j]}`);
    }
  }
  return [...orders].map(([name, { seen, before }]) => ({
    name,
    orders: Object.fromEntries(seen),
    ok: ![...before].some((pair) => before.has(pair.split('\u0000').reverse().join('\u0000'))),
  }));
}
