import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_STROKE_PAGE_LIMIT, MAX_STROKE_PAGE_LIMIT,
    getStrokePage, parseStrokePageQuery, PaginationInputError } from "./page.js";

const ids = Array.from({ length: 450 }, (_, index) =>
    (index + 1).toString(16).padStart(24, "0"));

function fakeModel() {
    return {
        find(filter) {
            const after = filter._id?.$gt.toString();
            let size;
            return {
                sort(order) { assert.deepEqual(order, { _id: 1 }); return this; },
                limit(value) { size = value; return this; },
                select() { return this; },
                async lean() {
                    return ids.filter(id => !after || id > after).slice(0, size)
                        .map(_id => ({ _id, points: [] }));
                },
            };
        },
    };
}

test("validates and bounds page input", () => {
    assert.deepEqual(parseStrokePageQuery({}), {
        limit: DEFAULT_STROKE_PAGE_LIMIT, after: undefined,
    });
    assert.deepEqual(parseStrokePageQuery({ limit: String(MAX_STROKE_PAGE_LIMIT), after: ids[0] }), {
        limit: MAX_STROKE_PAGE_LIMIT, after: ids[0],
    });
    for (const query of [{ limit: "0" }, { limit: "501" }, { limit: "2.5" },
        { limit: ["200"] }, { after: "invalid" }, { after: "" }, { after: [ids[0]] }]) {
        assert.throws(() => parseStrokePageQuery(query), PaginationInputError);
    }
});

test("paginates 450 strokes in ascending _id order without repeats or gaps", async () => {
    const model = fakeModel();
    const seen = [];
    let after;
    for (let pageNumber = 0; pageNumber < 3; pageNumber += 1) {
        const page = await getStrokePage(model, { limit: 200, after });
        seen.push(...page.strokes.map(stroke => stroke._id));
        after = page.nextCursor;
        assert.equal(page.hasMore, pageNumber < 2);
        assert.equal(page.strokes.length, pageNumber < 2 ? 200 : 50);
    }
    assert.deepEqual(seen, ids);
    const empty = await getStrokePage(model, { limit: 200, after });
    assert.deepEqual(empty, { strokes: [], nextCursor: after, hasMore: false });
});
