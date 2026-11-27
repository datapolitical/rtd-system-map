// The route panel's words (public/js/panel/route.js; DESIGN.md, "Route panel wording"), and the
// build's rush-hour and evening measures behind its rows (scripts/lib/gtfs.mjs; #22).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { routePanel, routePanelHtml, routePanelSaid, time, span } from '../public/js/panel/route.js';
import { headwayIn, windowSummary, WINDOWS } from '../scripts/lib/gtfs.mjs';

const windows = { midday: ['09:00', '15:00'], am: ['06:00', '09:00'], pm: ['15:00', '18:00'], eve: ['19:00', '22:00'] };
const bus = { route: '15L', name: 'East Colfax Limited', mode: 'bus', tier: 'frequent', wk: 10, sa: 15, su: 15, wk_trips: 202, sa_trips: 121, su_trips: 104,
  wk_first: '04:22', wk_last: '24:15', wk_am: 10, wk_pm: 8, wk_eve: 15, url: 'https://example.org/15L',
  goes: [{ name: 'Union Station' }, { name: 'Aurora Metro Center Station' }] };

test('times and windows read as riders say them', () => {
  assert.equal(time('04:22'), '4:22am');
  assert.equal(time('15:00'), '3pm');
  assert.equal(time('12:05'), '12:05pm');
  assert.equal(time('24:15'), '12:15am'); // after midnight, as GTFS writes it
  assert.equal(time('00:00'), '12am');
  assert.equal(time(null), '');
  assert.equal(span(['09:00', '15:00']), '9am to 3pm');
  assert.equal(span(['06:00', '09:00']), '6 to 9am');
  assert.equal(span(['19:00', '22:00']), '7 to 10pm');
  assert.equal(span(undefined), '');
});

test('the headline is the midday figure with its hours beside it; first and last trips stand apart', () => {
  const p = routePanel(bus, windows);
  assert.equal(p.title, 'East Colfax Limited');
  assert.equal(p.goes, 'Union Station – Aurora Metro Center');
  assert.deepEqual(p.headline, { figure: 'Every 10 min', when: 'weekdays, 9am to 3pm' });
  assert.equal(p.trips, 'First trip 4:22am, last 12:15am on weekdays');
  assert.doesNotMatch(`${p.headline.figure} ${p.headline.when}`, /4:22|12:15/);
});

test('rush hours, evening, Saturday and Sunday each get a row that says when', () => {
  const p = routePanel(bus, windows);
  assert.deepEqual(p.rows, [
    { label: 'Weekdays, 6 to 9am', value: 'Every 10 min' }, { label: 'Weekdays, 3 to 6pm', value: 'Every 8 min' }, { label: 'Weekdays, 7 to 10pm', value: 'Every 15 min' },
    { label: 'Saturday, 9am to 3pm', value: 'Every 15 min' }, { label: 'Sunday, 9am to 3pm', value: 'Every 15 min' },
  ]);
});

test('a window with one trip or none says so, and one-way rush service is not given as both ways', () => {
  const express = { ...bus, tier: 'peak', wk: null, sa: null, su: null, sa_trips: 0, su_trips: 0, wk_am: 30, wk_pm: 30, wk_eve: undefined, wk_eve_trips: 0, wk_one: 'am pm' };
  const p = routePanel(express, windows);
  assert.deepEqual(p.headline, { figure: 'Rush hours only', when: '' });
  assert.deepEqual(p.rows, [{ label: 'Weekdays, 6 to 9am', value: 'Every 30 min, one direction' }, { label: 'Weekdays, 3 to 6pm', value: 'Every 30 min, one direction' }, { label: 'Weekdays, 7 to 10pm', value: 'No trips' },
    { label: 'Saturday', value: 'No service' }, { label: 'Sunday', value: 'No service' }]);
  assert.equal(routePanel({ ...bus, wk_eve: undefined, wk_eve_trips: 1 }, windows).rows[2].value, '1 trip');
  assert.deepEqual(routePanel({ ...bus, sa: null, sa_trips: 4 }, windows).rows[3], { label: 'Saturday', value: 'A few trips' });
});

test('data built before the rows existed leaves them out, never guessed', () => {
  const { wk_am, wk_pm, wk_eve, ...old } = bus;
  const p = routePanel(old, {});
  assert.deepEqual(p.rows, [{ label: 'Saturday', value: 'Every 15 min' }, { label: 'Sunday', value: 'Every 15 min' }]);
  assert.deepEqual(p.headline, { figure: 'Every 10 min', when: 'weekdays' });
});

test('a rail line is named as a line; a route with no weekday service says so', () => {
  assert.equal(routePanel({ ...bus, mode: 'rail', route: 'A', name: 'Union Station to Denver Airport Station' }, windows).title, 'A Line');
  const weekend = routePanel({ ...bus, tier: 'none', wk: null, wk_trips: 0, wk_first: null, wk_last: null }, windows);
  assert.equal(weekend.headline.figure, 'No weekday service');
  assert.equal(weekend.trips, '');
  assert.deepEqual(weekend.rows.map((row) => row.label), ['Saturday, 9am to 3pm', 'Sunday, 9am to 3pm'], 'no weekday rows for a route that does not run on weekdays');
});

test('the HTML escapes RTD\'s text and links only to a web address', () => {
  const html = routePanelHtml(routePanel({ ...bus, goes: [{ name: '<b>' }] }, windows));
  assert.match(html, /<strong>Every 10 min<\/strong> <span>weekdays, 9am to 3pm<\/span>/);
  assert.match(html, /<a class="link" href="https:\/\/example.org\/15L" target="_blank" rel="noopener">Timetable on RTD’s site/);
  assert.match(html, /opens in a new tab/);
  assert.equal(routePanel({ ...bus, url: 'javascript:alert(1)' }, windows).link, null);
  assert.doesNotMatch(routePanelHtml(routePanel({ ...bus, wk_first: '<x>' }, windows)), /<x>/);
});

test('what a screen reader hears: the rows as sentences', () => {
  assert.equal(routePanelSaid(routePanel(bus, windows)),
    'Every 10 min weekdays, 9am to 3pm. Weekdays, 6 to 9am: Every 10 min. Weekdays, 3 to 6pm: Every 8 min. Weekdays, 7 to 10pm: Every 15 min. Saturday, 9am to 3pm: Every 15 min. Sunday, 9am to 3pm: Every 15 min. First trip 4:22am, last 12:15am on weekdays');
});

// --- The build's measures ---------------------------------------------------------------
const every = (from, minutes, n) => Array.from({ length: n }, (_, i) => from * 3600 + i * minutes * 60);

test('a window is measured as midday is: the typical gap, or the average where buses bunch', () => {
  assert.deepEqual(headwayIn(every(6, 15, 12), WINDOWS.am), { departures: 12, headway: 15 });
  assert.deepEqual(headwayIn(every(6, 15, 12), WINDOWS.eve), { departures: 0, headway: null });
  assert.deepEqual(headwayIn([16 * 3600], WINDOWS.pm), { departures: 1, headway: null });
  // Pairs two minutes apart every hour: a rider waits most of an hour, not two minutes.
  const pairs = [15, 16, 17].flatMap((h) => [h * 3600, h * 3600 + 120]);
  assert.equal(headwayIn(pairs, WINDOWS.pm).headway, 24); // the average gap (BUNCHED), not the two-minute median
  // A departure on the hour the window ends is the next window's.
  assert.equal(headwayIn([6 * 3600, 7 * 3600, 9 * 3600], WINDOWS.am).departures, 2);
});

test('the less frequent direction sets a window\'s frequency; one-way service is marked', () => {
  assert.deepEqual(windowSummary([{ departures: 12, headway: 15 }, { departures: 6, headway: 30 }]), { headway: 30, oneWay: false, departures: 12 });
  assert.deepEqual(windowSummary([{ departures: 6, headway: 30 }, { departures: 0, headway: null }]), { headway: 30, oneWay: true, departures: 6 });
  assert.deepEqual(windowSummary([{ departures: 1, headway: null }, { departures: 0, headway: null }]), { headway: null, oneWay: false, departures: 1 });
  assert.deepEqual(windowSummary([{ departures: 6, headway: 30 }]), { headway: 30, oneWay: false, departures: 6 }, 'a loop has one direction');
});

// Chris, 2026-11-27: the panel is its own module that never reads sheet state, so the zoomable
// map uses it unchanged.
test('the route panel reads nothing of the sheets', () => {
  const code = readFileSync(new URL('../public/js/panel/route.js', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.doesNotMatch(code, /sheet|step/i);
  assert.doesNotMatch(code, /maplibre|document\.|window\.|\.getLayer/);
  assert.doesNotMatch(code, /\bimport\b/, 'it imports nothing');
});
