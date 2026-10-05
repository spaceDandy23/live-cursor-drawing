import assert from 'node:assert/strict';
import test from 'node:test';
import { StrokeOutbox } from './outbox.js';

test('reconnect replays only unacknowledged items in logical order', () => {
    const outbox = new StrokeOutbox();
    assert.equal(outbox.queue('cursor:move', { x: 1, y: 2 }), null);
    outbox.queue('stroke:start', { strokeId: 'a' });
    outbox.queue('stroke:points', { strokeId: 'a', sequence: 0 });
    outbox.queue('stroke:points', { strokeId: 'a', sequence: 1 });
    outbox.queue('stroke:points', { strokeId: 'a', sequence: 2 });
    outbox.queue('stroke:end', { strokeId: 'a', lastSequence: 2 });
    outbox.ack({ strokeId: 'a', phase: 'start' });
    outbox.ack({ strokeId: 'a', phase: 'points', acknowledgedSequence: 0 });
    assert.deepEqual(outbox.pendingOrdered().map(item =>
        [item.type, item.sequence]), [
        ['stroke:points', 1], ['stroke:points', 2], ['stroke:end', undefined],
    ]);
    assert.equal(outbox.fullStroke('a').length, 5);
    outbox.ack({ strokeId: 'a', phase: 'end' });
    assert.equal(outbox.fullStroke('a').length, 0);
    assert.equal(outbox.pendingOrdered().length, 0);
});
