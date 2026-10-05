// Run against a local server: node scripts/realtime-smoke.js [ws://localhost:3000]
import WebSocket from 'ws';

const endpoint = process.argv[2] ?? 'ws://localhost:3000';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const suffix = Date.now();

const connect = username => {
    const socket = new WebSocket(`${endpoint}/?username=${username}`);
    const inbox = [];
    socket.on('message', bytes => inbox.push(JSON.parse(bytes.toString())));
    return { socket, inbox };
};

const take = async (client, type) => {
    for (let attempt = 0; attempt < 300; attempt += 1) {
        const index = client.inbox.findIndex(event => event.type === type);
        if (index >= 0) return client.inbox.splice(index, 1)[0];
        await wait(10);
    }
    throw new Error(`Timed out waiting for ${type}`);
};

const send = (client, type, payload) => {
    client.socket.send(JSON.stringify({ type, payload }));
};

const first = connect(`phase2_smoke_a_${suffix}`);
let second;
try {
    await take(first, 'presence:sync');
    second = connect(`phase2_smoke_b_${suffix}`);
    const sync = await take(second, 'presence:sync');
    if (sync.payload.users.length !== 1) throw new Error('Incorrect presence sync');
    await take(first, 'presence:join');

    first.socket.send('{bad json');
    send(first, 'cursor:move', { userId: 'forged', x: 10, y: 20 });
    const cursor = await take(second, 'cursor:move');
    if (cursor.payload.userId === 'forged' || cursor.payload.x !== 10) {
        throw new Error('Cursor identity was not bound to the connection');
    }
    if (first.inbox.some(event => event.type === 'cursor:move')) {
        throw new Error('Cursor movement echoed to its sender');
    }

    send(first, 'stroke:start', {
        strokeId: 'smoke-stroke', moveTo: { x: 1, y: 2 }, color: 'red', erase: false,
    });
    await take(second, 'stroke:start');
    const startAck = await take(first, 'stroke:ack');
    if (startAck.payload.phase !== 'start') throw new Error('Missing start ACK');
    send(first, 'stroke:points', {
        strokeId: 'smoke-stroke', sequence: 1, points: [{ x: 4, y: 5 }],
    });
    const missing = await take(first, 'stroke:request-missing');
    if (missing.payload.missingSequence !== 0) throw new Error('Incorrect recovery request');
    if (second.inbox.some(event => event.type === 'stroke:points')) {
        throw new Error('Out-of-order batch was accepted');
    }
    send(first, 'stroke:points', {
        strokeId: 'smoke-stroke', sequence: 0, points: [{ x: 3, y: 4 }],
    });
    const points = await take(second, 'stroke:points');
    const buffered = await take(second, 'stroke:points');
    if (points.payload.sequence !== 0 || buffered.payload.sequence !== 1) {
        throw new Error('Incorrect batch sequence');
    }
    const pointAck = (await take(first, 'stroke:ack'));
    if (pointAck.payload.phase !== 'points' || pointAck.payload.acknowledgedSequence !== 1) {
        throw new Error('Incorrect cumulative ACK');
    }

    for (const [type, payload] of [
        ['stroke:end', { strokeId: 'smoke-stroke', lastSequence: 1 }],
        ['stroke:undo', {}],
        ['stroke:redo', {}],
        ['canvas:saved', {}],
    ]) {
        send(first, type, payload);
        await take(second, type);
    }
    const endAck = await take(first, 'stroke:ack');
    if (endAck.payload.phase !== 'end') throw new Error('Missing end ACK');
    first.socket.close();
    await take(second, 'presence:leave');
    if (second.inbox.some(event => !event.type || event.type === 'users:snapshot')) {
        throw new Error('Unexpected broad state snapshot');
    }
    console.log('Realtime smoke passed: presence, cursor, ordered stroke, undo/redo, save, disconnect');
} finally {
    first.socket.close();
    second?.socket.close();
}
