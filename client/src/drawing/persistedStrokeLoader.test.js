import assert from 'node:assert/strict';
import test from 'node:test';
import { createPersistedStrokeLoader } from './persistedStrokeLoader.js';

const id = number => number.toString(16).padStart(24, '0');

function store(initialCount) {
    const rows = Array.from({ length: initialCount }, (_, index) => ({ _id: id(index + 1) }));
    const requests = [];
    let failAfter = null;
    const fetchImpl = async url => {
        const params = new URL(url).searchParams;
        const after = params.get('after');
        const limit = Number(params.get('limit'));
        requests.push(after);
        if (failAfter !== null && failAfter === after) {
            failAfter = null;
            return { ok: false, status: 503 };
        }
        const start = after ? rows.findIndex(row => row._id === after) + 1 : 0;
        const strokes = rows.slice(start, start + limit);
        return { ok: true, headers: { get: () => null }, json: async () => ({
            strokes, nextCursor: strokes.at(-1)?._id ?? after,
            hasMore: start + strokes.length < rows.length,
        }) };
    };
    return {
        rows, requests, fetchImpl,
        append(count) {
            const start = rows.length;
            rows.push(...Array.from({ length: count }, (_, index) => ({ _id: id(start + index + 1) })));
        },
        failOnceAfter(cursor) { failAfter = cursor; },
    };
}

function loaderFor(database, painted) {
    return createPersistedStrokeLoader({ httpUrl: 'http://localhost:3000',
        fetchImpl: database.fetchImpl,
        onPage: ({ strokes }) => painted.push(...strokes.map(stroke => stroke._id)),
    });
}

test('reconnect fetches only records after the last painted cursor', async () => {
    const database = store(200);
    const painted = [];
    const loader = loaderFor(database, painted);
    await loader.request('initial');
    database.append(10);
    await loader.request('catchup');
    assert.deepEqual(database.requests, [null, id(200)]);
    assert.equal(painted.length, 210);
    assert.equal(loader.getCursor(), id(210));
});

test('catch-up follows multiple pages without duplicates or skips', async () => {
    const database = store(200);
    const painted = [];
    const loader = loaderFor(database, painted);
    await loader.request('initial');
    database.append(450);
    await loader.request('catchup');
    assert.deepEqual(database.requests, [null, id(200), id(400), id(600)]);
    assert.deepEqual(painted, database.rows.map(row => row._id));
});

test('empty catch-up leaves the painted canvas untouched', async () => {
    const database = store(200);
    const painted = [];
    const loader = loaderFor(database, painted);
    await loader.request('initial');
    await loader.request('catchup');
    assert.deepEqual(database.requests, [null, id(200)]);
    assert.equal(painted.length, 200);
    assert.equal(loader.getCursor(), id(200));
});

test('failed second page retains first page and retry resumes there', async () => {
    const database = store(200);
    const painted = [];
    const loader = loaderFor(database, painted);
    await loader.request('initial');
    database.append(450);
    database.failOnceAfter(id(400));
    await assert.rejects(loader.request('catchup'), /503/);
    assert.equal(loader.getCursor(), id(400));
    assert.equal(painted.length, 400);
    await loader.request('catchup');
    assert.deepEqual(database.requests, [null, id(200), id(400), id(400), id(600)]);
    assert.deepEqual(painted, database.rows.map(row => row._id));
});

test('reconnect during initial restoration queues one nonconcurrent tail pass', async () => {
    const database = store(400);
    const painted = [];
    const requests = [];
    let releaseFirst;
    let active = 0;
    let maxActive = 0;
    const fetchImpl = async (...args) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        requests.push(new URL(args[0]).searchParams.get('after'));
        if (requests.length === 1) await new Promise(resolve => { releaseFirst = resolve; });
        const response = await database.fetchImpl(...args);
        active -= 1;
        return response;
    };
    const loader = createPersistedStrokeLoader({ httpUrl: 'http://localhost:3000', fetchImpl,
        onPage: ({ strokes }) => painted.push(...strokes.map(stroke => stroke._id)) });
    const initial = loader.request('initial');
    loader.request('catchup');
    database.append(10);
    releaseFirst();
    await initial;
    assert.equal(maxActive, 1);
    assert.deepEqual(requests, [null, id(200), id(400), id(410)]);
    assert.deepEqual(painted, database.rows.map(row => row._id));
});
