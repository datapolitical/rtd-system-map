import test from 'node:test';
import assert from 'node:assert/strict';
import { clearPoint } from '../public/js/sheets/view.js';

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
