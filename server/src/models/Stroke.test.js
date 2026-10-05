import assert from 'node:assert/strict';
import test from 'node:test';
import Stroke from './Stroke.js';

test('saved stroke keeps optional realtime identity without requiring it for old records', () => {
    const values = { color: '#000000', move_to: { x: 0, y: 0 },
        points: [{ x: 1, y: 1 }], erase: false };
    const current = new Stroke({ ...values, clientStrokeId: 'stroke-123' });
    const legacy = new Stroke(values);
    assert.equal(current.validateSync(), undefined);
    assert.equal(legacy.validateSync(), undefined);
    assert.equal(current.toObject().clientStrokeId, 'stroke-123');
    assert.equal(legacy.toObject().clientStrokeId, undefined);
});
