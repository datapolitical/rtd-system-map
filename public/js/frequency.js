// How often a bus comes along a street, all routes counted together
// (DESIGN.md, "Bus routes"): the classes the map draws streets in, from the
// combined buses per hour in the busier direction over the weekday window.
// One plain module with no DOM or MapLibre in it, so the page imports it as
// './frequency.js' and the build (scripts/lib/streets.mjs), run by Node,
// imports the same file as '../../public/js/frequency.js', the way sizes.js
// is shared. Strongest first. `min` is the least buses per hour for the
// class; the label says it as a wait, the way riders think of it.
export const STREET_CLASSES = [
  { id: 'c3', label: 'Every 3 min or better', min: 20 },
  { id: 'c5', label: 'Every 4 to 5 min', min: 12 },
  { id: 'c10', label: 'Every 6 to 10 min', min: 6 },
  { id: 'c15', label: 'Every 11 to 15 min', min: 4 },
  { id: 'c30', label: 'Every 16 to 30 min', min: 2 },
  { id: 'c60', label: 'Every 31 min or more', min: 0 },
];

// The class for a street carrying `bph` buses per hour (busier direction),
// judged by the wait in whole minutes, the number its panel shows: a street
// whose wait comes out at 15 minutes and a few seconds (stop times RTD fills
// in between its timepoints) is every 15, not every 16 to 30.
export const classOf = (bph) => {
  const wait = bph > 0 ? Math.round(60 / bph) : Infinity;
  return STREET_CLASSES.find((c) => wait <= 60 / c.min)?.id ?? STREET_CLASSES.at(-1).id;
};
export const CLASS_RANK = Object.fromEntries(STREET_CLASSES.map((c, i) => [c.id, STREET_CLASSES.length - i]));
