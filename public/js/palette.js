// One palette, two themes (DESIGN.md, "Dark mode"). Every colour the map and
// the symbols it draws are made of is named here, once for each theme, and
// nothing else in the JS holds a colour. The interface's own colours are the
// custom properties at the top of css/app.css, with a dark set under
// `prefers-color-scheme: dark`; the two lists share names where they share a job.
//
// The theme follows the system setting. There is no toggle and nothing is
// stored. A rail line's colour is not here: it comes from RTD's data, and
// railStyle (main.js) adjusts it for each theme by rule.
//
// Contrast against the land is the rule for anything a rider must read or
// follow: text 4.5:1 (3:1 for large text), essential lines 3:1. The bus tiers
// keep their order in both themes: the most frequent is the strongest mark
// (darkest on light, brightest on dark), and each tier below is quieter.

const light = {
  scheme: 'light',

  // Ground
  land: '#f4f5f6',
  wash: '#e3e7ea', // outside RTD's district
  water: '#bcd5e4',
  park: '#e0eadb',
  wood: '#e6ece2',
  building: '#e7eaed',
  buildingEdge: '#dde2e6',
  runway: '#e3e7eb',
  road: '#ffffff',
  roadEdge: '#dfe4e8',
  motorwayEdge: '#cbd2d8',
  // Roads from far out, before they have casings.
  roadFar: '#dfe4e8',
  motorwayFar: '#cbd2d8',

  // Words on the basemap
  // Each at least 4.5:1 against what it sits on (land, road, water, park, shield).
  waterLabel: '#3b5e74',
  town: '#4c5a69',
  neighborhood: '#66727e',
  street: '#4f5b67',
  roadLabel: '#6c7883',
  landmark: '#66727e',
  parkLabel: '#526f4c',
  shield: '#6b7886',
  shieldFill: '#ffffff',
  shieldEdge: '#a9b3bd',

  // The network
  ink: '#17222e', // station edges, station names, the open route's ring and ends
  onColor: '#17222e', // the dark choice for a letter on a rail colour...
  white: '#ffffff', // ...and the light one
  casing: '#ffffff', // the gap around rail and under the open route
  clear: 'rgba(255, 255, 255, 0)',
  // Bus tiers (shared.js). Contrast against land: 12.3, 7.4, 3.5.
  tier: { frequent: '#1d3044', every30: '#3f5266', slow: '#78848f' },
  tagSlow: '#4c5a69', // a slow tier's number, darkened to read on its tag
  tagFill: '#ffffff',
  stop: { fill: '#ffffff', edge: '#6f7c89' },
  unserved: { fill: 'rgba(255, 255, 255, 0.7)', edge: '#9aa5b0', label: '#66717e' },
  station: { fill: '#ffffff', edge: '#17222e' },
  bulletRing: '#ffffff',
  sign: { fill: '#ffffff', text: '#17222e', shadow: 'rgba(23, 34, 46, 0.22)' },
  selEnd: { fill: '#ffffff', ring: '#17222e' },
  flex: { edge: '#7e8b98', hatch: 'rgba(94, 110, 126, 0.38)' },
  // Park-n-Ride and transit center signs: a rim, a plate, and the mark on it.
  pnr: { rim: '#ffffff', plate: '#35597d', mark: '#ffffff' },
  transit: { rim: '#ffffff', plate: '#17222e', mark: '#ffffff', windows: '#17222e' },

  // Relief
  relief: [
    [1700, 'rgba(232, 236, 230, 0)'],
    [1900, 'rgba(226, 232, 223, 0.55)'],
    [2500, 'rgba(214, 222, 211, 0.8)'],
    [3300, 'rgba(206, 213, 207, 0.85)'],
    [4000, 'rgba(226, 230, 233, 0.9)'],
  ],
  hillshade: {
    highlight: ['rgba(255, 255, 255, 0.35)', 'rgba(255, 255, 255, 0.3)', 'rgba(255, 255, 255, 0.2)', 'rgba(255, 255, 255, 0.2)'],
    shadow: ['rgba(70, 88, 104, 0.32)', 'rgba(70, 88, 104, 0.28)', 'rgba(70, 88, 104, 0.18)', 'rgba(70, 88, 104, 0.18)'],
  },
};

const dark = {
  scheme: 'dark',

  land: '#161b21',
  wash: '#0d1114',
  water: '#1c3345',
  park: '#1d2b22',
  wood: '#1a261f',
  building: '#1d242b',
  buildingEdge: '#262e36',
  runway: '#252d35',
  road: '#2b343d',
  roadEdge: '#0f1317',
  motorwayEdge: '#0a0d10',
  roadFar: '#232b33',
  motorwayFar: '#2e3842',

  waterLabel: '#7fa9c4',
  town: '#b9c4cf',
  neighborhood: '#8d9aa7',
  street: '#b4bfca',
  roadLabel: '#94a1ad',
  landmark: '#9aa7b3',
  parkLabel: '#8db586',
  shield: '#9aa6b2',
  shieldFill: '#232a31',
  shieldEdge: '#5b6773',

  ink: '#e8edf1',
  onColor: '#05080b',
  white: '#ffffff',
  casing: '#0b0e12',
  clear: 'rgba(11, 14, 18, 0)',
  // Contrast against land: 13.7, 7.9, 3.8.
  tier: { frequent: '#dce6ef', every30: '#9fb1c3', slow: '#687a8e' },
  tagSlow: '#a9b7c5',
  tagFill: '#1c2229',
  stop: { fill: '#1c2229', edge: '#8a97a4' },
  unserved: { fill: 'rgba(22, 27, 33, 0.7)', edge: '#7d8995', label: '#98a4b0' },
  station: { fill: '#0f1317', edge: '#e8edf1' },
  bulletRing: '#0b0e12',
  sign: { fill: '#242c35', text: '#e8edf1', shadow: 'rgba(0, 0, 0, 0.55)' },
  selEnd: { fill: '#0f1317', ring: '#e8edf1' },
  flex: { edge: '#8896a4', hatch: 'rgba(150, 168, 186, 0.34)' },
  pnr: { rim: '#0f1317', plate: '#9cc2ea', mark: '#0f1a28' },
  transit: { rim: '#0f1317', plate: '#dbe4ec', mark: '#0f1317', windows: '#dbe4ec' },

  relief: [
    [1700, 'rgba(30, 40, 38, 0)'],
    [1900, 'rgba(30, 40, 38, 0.4)'],
    [2500, 'rgba(34, 46, 42, 0.5)'],
    [3300, 'rgba(42, 52, 52, 0.55)'],
    [4000, 'rgba(54, 62, 70, 0.6)'],
  ],
  hillshade: {
    highlight: ['rgba(255, 255, 255, 0.03)', 'rgba(255, 255, 255, 0.025)', 'rgba(255, 255, 255, 0.02)', 'rgba(255, 255, 255, 0.02)'],
    shadow: ['rgba(0, 0, 0, 0.34)', 'rgba(0, 0, 0, 0.3)', 'rgba(0, 0, 0, 0.2)', 'rgba(0, 0, 0, 0.2)'],
  },
};

export const PALETTES = { light, dark };

// Rail colours from RTD's data are lifted until they reach this contrast
// against the dark land (railStyle, main.js). Light colours are left alone.
export const DARK_RAIL_MIN = 4;

const query = matchMedia('(prefers-color-scheme: dark)');
const schemeNow = () => (query.matches ? 'dark' : 'light');

// The palette in use. An ES module binding: importers always see the current one.
export let P = PALETTES[schemeNow()];

// Calls `apply(palette)` whenever the system setting changes.
export function followScheme(apply) {
  query.addEventListener('change', () => {
    P = PALETTES[schemeNow()];
    apply(P);
  });
}
