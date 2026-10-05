import assert from 'node:assert/strict';
import test from 'node:test';
import { parseClientEvent } from './protocol.js';

const parse = event => parseClientEvent(Buffer.from(JSON.stringify(event)));

test('validates and strips untrusted identity from cursor traffic', () => {
    assert.deepEqual(parse({
        type: 'cursor:move',
        payload: { userId: 'impersonated', x: 12, y: 34 },
    }), { type: 'cursor:move', payload: { x: 12, y: 34 } });
    assert.throws(() => parse({ type: 'cursor:move', payload: { x: '12', y: 34 } }));
});

test('keeps stroke identity and ordered batch fields', () => {
    assert.deepEqual(parse({
        type: 'stroke:points',
        payload: {
            userId: 'impersonated', strokeId: 'stroke-1', sequence: 2,
            points: [{ x: 1, y: 2 }],
        },
    }), {
        type: 'stroke:points',
        payload: { strokeId: 'stroke-1', sequence: 2, points: [{ x: 1, y: 2 }] },
    });
    assert.throws(() => parse({
        type: 'stroke:points',
        payload: { strokeId: 'stroke-1', sequence: -1, points: [{ x: 1, y: 2 }] },
    }));
});

test('rejects malformed envelopes and unknown events', () => {
    assert.throws(() => parseClientEvent(Buffer.from('{')));
    assert.throws(() => parse({ type: 'stroke:start' }));
    assert.throws(() => parse({ type: 'users:snapshot', payload: {} }));
});

test('validates terminal sequence and recovery requests without trusting sender identity', () => {
    assert.deepEqual(parse({ type: 'stroke:end', payload: {
        userId: 'forged', strokeId: 'a', lastSequence: -1,
    } }), { type: 'stroke:end', payload: { strokeId: 'a', lastSequence: -1 } });
    assert.deepEqual(parse({ type: 'stroke:request-missing', payload: {
        userId: 'forged', strokeId: 'a', missingSequence: 2,
    } }), { type: 'stroke:request-missing', payload: {
        strokeId: 'a', missingSequence: 2,
    } });
    assert.throws(() => parse({ type: 'stroke:end', payload: { strokeId: 'a' } }));
    assert.throws(() => parse({ type: 'stroke:request-missing', payload: {
        strokeId: 'a', missingSequence: -1,
    } }));
});
