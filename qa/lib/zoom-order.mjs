// Bus strokes must sit beneath every rail drawing's lines, or the closer bus drawing cuts across rail.
export function railOrderErrors(style) {
  const rail = style.layers.findIndex((l) => /^trial-rail(?:-rim|-casing)?(?:-\d+)?$/.test(l.id));
  if (rail < 0) return ['No trial rail layer'];
  return style.layers.flatMap((layer, index) => index > rail && /^(bus(?:-rim|-spine)?|marked-dash)-(?:[234]|13|15)$/.test(layer.id)
    ? [`${layer.id} paints over ${style.layers[rail].id}`] : []);
}

// A station's name, its chips, the line letters and the platform bars' room must take part in
// symbol placement and be placed before the bus route numbers (MapLibre places the topmost symbol
// layer first). Otherwise the numbers print over them: RTD-006.
const LETTERING = ['trial-station-room', 'trial-name', 'trial-attached-letter', 'trial-labels-letter'];
const NUMBERS = /^(bus-number|bus-stack|picked-number|picked-stack)-(?:[234]|13|15)$/;
export function letteringOrderErrors(style) {
  const at = new Map(style.layers.map((l, i) => [l.id, i]));
  const numbers = style.layers.map((l, i) => [l, i]).filter(([l]) => NUMBERS.test(l.id));
  return LETTERING.flatMap((id) => {
    if (!at.has(id)) return [`No ${id} layer, so bus numbers can print over what it holds`];
    const l = style.layers[at.get(id)];
    return [
      ...(l.layout?.['text-ignore-placement'] === true ? [`${id} is left out of placement, so bus numbers print over it`] : []),
      ...numbers.filter(([, j]) => j > at.get(id)).map(([n]) => `${n.id} is placed before ${id}`),
    ];
  });
}
