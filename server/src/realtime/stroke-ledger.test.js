import assert from 'node:assert/strict';
import test from 'node:test';
import { StrokeLedger } from './stroke-ledger.js';

const setup = () => {
    const sent = [];
    const broadcast = [];
    const ledger = new StrokeLedger({
        sendOwner: (type, payload) => sent.push({ type, payload }),
        broadcast: (type, payload) => broadcast.push({ type, payload }),
    });
    return { ledger, sent, broadcast };
};
const start = { strokeId: 'a', moveTo: { x: 0, y: 0 }, color: 'red', erase: false };
const points = sequence => ({ strokeId: 'a', sequence, points: [{ x: sequence, y: 1 }] });

test('ACKs start, contiguous points, and end; duplicates do not rebroadcast', () => {
    const { ledger, sent, broadcast } = setup();
    ledger.start(start);
    ledger.start(start);
    ledger.points(points(0));
    ledger.points(points(0));
    ledger.end({ strokeId: 'a', lastSequence: 0 });
    ledger.end({ strokeId: 'a', lastSequence: 0 });
    assert.deepEqual(broadcast.map(event => event.type), [
        'stroke:start', 'stroke:points', 'stroke:end',
    ]);
    assert.deepEqual(sent.filter(event => event.type === 'stroke:ack').map(event => [
        event.payload.phase, event.payload.acknowledgedSequence, event.payload.duplicate,
    ]), [
        ['start', undefined, false], ['start', undefined, true],
        ['points', 0, false], ['points', 0, true],
        ['end', undefined, false], ['end', undefined, true],
    ]);
    ledger.dispose();
});

test('buffers a gap without acknowledging past it, then drains in order', () => {
    const { ledger, sent, broadcast } = setup();
    ledger.start(start);
    ledger.points(points(0));
    ledger.points(points(1));
    ledger.points(points(3));
    assert.equal(sent.at(-1).type, 'stroke:request-missing');
    assert.equal(sent.at(-1).payload.missingSequence, 2);
    assert.equal(sent.filter(event => event.type === 'stroke:ack' &&
        event.payload.phase === 'points').at(-1).payload.acknowledgedSequence, 1);
    ledger.end({ strokeId: 'a', lastSequence: 3 });
    assert.equal(broadcast.some(event => event.type === 'stroke:end'), false);
    ledger.points(points(2));
    assert.deepEqual(broadcast.filter(event => event.type === 'stroke:points')
        .map(event => event.payload.sequence), [0, 1, 2, 3]);
    assert.equal(sent.filter(event => event.type === 'stroke:ack' &&
        event.payload.phase === 'points').at(-1).payload.acknowledgedSequence, 3);
    assert.equal(broadcast.at(-1).type, 'stroke:end');
    ledger.dispose();
});

test('missing start requests full replay and terminal recovery abandons', async () => {
    const { ledger, sent, broadcast } = setup();
    ledger.timeoutMs = 10;
    ledger.points(points(0));
    assert.equal(sent.at(-1).type, 'stroke:request-full');
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(broadcast.at(-1).type, 'stroke:abandoned');
    ledger.dispose();
});
