import assert from 'node:assert/strict';
import test from 'node:test';
import { loadStrokePages, STROKE_PAGE_LIMIT } from './loadStrokePages.js';

const ids = Array.from({ length: 1550 }, (_, index) =>
    (index + 1).toString(16).padStart(24, '0'));

function makeFetch({ failAt = -1 } = {}) {
    const requests = [];
    let failed = false;
    const fetchImpl = async (url, { signal }) => {
        assert.notEqual(signal?.aborted, true);
        const parsed = new URL(url);
        const after = parsed.searchParams.get('after');
        const limit = Number(parsed.searchParams.get('limit'));
        assert.equal(limit, STROKE_PAGE_LIMIT);
        requests.push(after);
        if (!failed && requests.length === failAt) {
            failed = true;
            return { ok: false, status: 503 };
        }
        const start = after ? ids.indexOf(after) + 1 : 0;
        const part = ids.slice(start, start + limit);
        return {
            ok: true,
            headers: { get: () => '123' },
            json: async () => ({
                strokes: part.map(_id => ({ _id })),
                nextCursor: part.at(-1) ?? after,
                hasMore: start + part.length < ids.length,
            }),
        };
    };
    return { fetchImpl, requests };
}

test('paints each of eight chunks before requesting the next', async () => {
    const { fetchImpl, requests } = makeFetch();
    const seen = [];
    await loadStrokePages({ httpUrl: 'http://localhost:3000', fetchImpl,
        onPage: ({ strokes }) => {
            assert.equal(requests.length, Math.ceil(seen.length / STROKE_PAGE_LIMIT) + 1);
            seen.push(...strokes.map(stroke => stroke._id));
        },
    });
    assert.equal(requests.length, 8);
    assert.deepEqual(seen, ids);
});

test('failed eighth chunk resumes at the last successful cursor', async () => {
    const { fetchImpl, requests } = makeFetch({ failAt: 8 });
    const seen = [];
    let cursor = null;
    const onPage = page => {
        seen.push(...page.strokes.map(stroke => stroke._id));
        cursor = page.cursor;
    };
    await assert.rejects(loadStrokePages({ httpUrl: 'http://localhost:3000', fetchImpl, onPage }),
        /503/);
    assert.equal(seen.length, 1400);
    assert.equal(cursor, ids[1399]);
    await loadStrokePages({ httpUrl: 'http://localhost:3000', after: cursor, fetchImpl, onPage });
    assert.equal(requests.at(-1), ids[1399]);
    assert.deepEqual(seen, ids);
});

test('does not paint a response completed after cancellation', async () => {
    const controller = new AbortController();
    const fetched = makeFetch().fetchImpl;
    let paintCount = 0;
    const fetchImpl = async (...args) => {
        const response = await fetched(...args);
        controller.abort();
        return response;
    };
    await loadStrokePages({ httpUrl: 'http://localhost:3000', signal: controller.signal,
        fetchImpl, onPage: () => { paintCount += 1; } });
    assert.equal(paintCount, 0);
});
