// The #154 preview has two bus drawings. Every base bus stroke must precede rail.
export function railOrderErrors(style) {
  const rail = style.layers.findIndex((l) => l.id === 'trial-rail');
  if (rail < 0) return ['No trial rail layer'];
  return style.layers.flatMap((layer, index) => index > rail && /^(bus(?:-rim|-spine)?|marked-dash)-[23]$/.test(layer.id)
    ? [`${layer.id} paints over trial-rail`] : []);
}
