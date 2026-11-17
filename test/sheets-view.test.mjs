import test from 'node:test';
import assert from 'node:assert/strict';
import { clearPoint, nameChoices } from '../public/js/sheets/view.js';

test('a tapped place stays where it is when no card covers it', () => {
  assert.deepEqual(clearPoint([100, 100], { width: 393, height: 760 }, [{ left: 12, right: 381, top: 550, bottom: 670 }]), [100, 100]);
});

test('a phone card moves a covered place just above itself', () => {
  const p = clearPoint([190, 590], { width: 393, height: 760 }, [{ left: 12, right: 381, top: 550, bottom: 670 }]);
  assert.ok(p[1] < 532 && p[0] === 190);
});

test('a landscape card can use the free map beside it', () => {
  const p = clearPoint([425, 250], { width: 852, height: 393 }, [{ left: 12, right: 460, top: 183, bottom: 309 }]);
  assert.ok(p[0] > 478 && p[1] === 250);
});

test('no shift is proposed when every part of the map is covered', () => {
  assert.equal(clearPoint([100, 100], { width: 200, height: 200 }, [{ left: 0, right: 200, top: 0, bottom: 200 }]), null);
});

test('a name cut by the left edge moves whole to its other built place', () => {
  const properties = { nid: '1.0', hub: false, end: false };
  const features = [
    { properties: { ...properties, bx: '-90,-8,0,8' }, at: [10, 100] },
    { properties: { ...properties, edge: '1.0:1', bx: '10,-8,100,8' }, at: [10, 100] },
  ];
  assert.deepEqual(nameChoices(features, { width: 393, height: 760 }, []), { clipped: ['1.0'], edges: ['1.0:1'] });
});

test('an alternative does not cover another station name or a page control', () => {
  const features = [
    { properties: { nid: '1', bx: '-90,-8,0,8' }, at: [10, 100] },
    { properties: { nid: '1', edge: '1:1', bx: '10,-8,100,8' }, at: [10, 100] },
    { properties: { nid: '1', edge: '1:2', bx: '10,20,100,36' }, at: [10, 100] },
    { properties: { nid: '2', bx: '0,-8,80,8' }, at: [35, 100] },
  ];
  const view = { width: 393, height: 760 };
  assert.deepEqual(nameChoices(features, view, []), { clipped: ['1'], edges: ['1:2'] });
  assert.deepEqual(nameChoices(features, view, [{ left: 10, top: 115, right: 120, bottom: 140 }]), { clipped: ['1'], edges: [] });
});
