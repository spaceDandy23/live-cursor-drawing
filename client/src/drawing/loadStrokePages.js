export const STROKE_PAGE_LIMIT = 200;
const OBJECT_ID = /^[a-f\d]{24}$/i;

// Calls onPage before requesting the next page, so the first page can paint at once.
export async function loadStrokePages({ httpUrl, after = null, signal, onPage, fetchImpl = fetch }) {
    let cursor = after;
    let hasMore;
    let chunks = 0;
    let restored = 0;
    let responseBytes = 0;
    do {
        const params = new URLSearchParams({ limit: String(STROKE_PAGE_LIMIT) });
        if (cursor) params.set('after', cursor);
        const response = await fetchImpl(`${httpUrl.replace(/\/$/, '')}/api/strokes?${params}`, { signal });
        if (!response.ok) throw new Error(`Saved drawing request failed (${response.status}).`);
        const page = await response.json();
        if (signal?.aborted) return;
        if (!page || !Array.isArray(page.strokes) || typeof page.hasMore !== 'boolean' ||
            (page.nextCursor !== null &&
                (typeof page.nextCursor !== 'string' || !OBJECT_ID.test(page.nextCursor)))) {
            throw new Error('Invalid saved drawing response.');
        }
        let previousId = cursor;
        for (const stroke of page.strokes) {
            if (typeof stroke?._id !== 'string' || !OBJECT_ID.test(stroke._id) ||
                (previousId && stroke._id.toLowerCase() <= previousId.toLowerCase())) {
                throw new Error('Saved drawing pages are out of order.');
            }
            previousId = stroke._id;
        }
        if (page.hasMore && page.strokes.length === 0) {
            throw new Error('Saved drawing page did not advance.');
        }
        if (page.strokes.length && page.nextCursor?.toLowerCase() !== previousId.toLowerCase()) {
            throw new Error('Saved drawing cursor does not match its page.');
        }
        const bytes = Number(response.headers?.get?.('content-length')) || 0;
        onPage({ strokes: page.strokes, cursor: page.nextCursor ?? cursor, bytes });
        cursor = page.nextCursor ?? cursor;
        chunks += 1;
        restored += page.strokes.length;
        responseBytes += bytes;
        hasMore = page.hasMore;
    } while (hasMore && !signal?.aborted);
    return { cursor, chunks, restored, responseBytes };
}
