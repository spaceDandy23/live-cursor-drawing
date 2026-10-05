import mongoose from "mongoose";

export const DEFAULT_STROKE_PAGE_LIMIT = 200;
export const MAX_STROKE_PAGE_LIMIT = 500;
const OBJECT_ID = /^[a-f\d]{24}$/i;

export class PaginationInputError extends Error {}

export function parseStrokePageQuery(query) {
    const rawLimit = query.limit;
    const limit = rawLimit === undefined ? DEFAULT_STROKE_PAGE_LIMIT : Number(rawLimit);
    if (typeof rawLimit !== "undefined" &&
        (typeof rawLimit !== "string" || !/^\d+$/.test(rawLimit))) {
        throw new PaginationInputError("limit must be a positive integer");
    }
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_STROKE_PAGE_LIMIT) {
        throw new PaginationInputError(`limit must be between 1 and ${MAX_STROKE_PAGE_LIMIT}`);
    }

    const after = query.after;
    if (after !== undefined && (typeof after !== "string" || !OBJECT_ID.test(after))) {
        throw new PaginationInputError("after must be a 24-character ObjectId");
    }
    return { limit, after: after?.toLowerCase() };
}

export async function getStrokePage(StrokeModel, { limit, after }) {
    // _id is indexed and stable for the current append-only collection. Imports
    // with older IDs or out-of-order concurrent commits need a different model.
    const filter = after ? { _id: { $gt: new mongoose.Types.ObjectId(after) } } : {};
    const rows = await StrokeModel.find(filter)
        .sort({ _id: 1 })
        .limit(limit + 1)
        .select({ __v: 0, "points._id": 0 })
        .lean();
    const hasMore = rows.length > limit;
    const strokes = hasMore ? rows.slice(0, limit) : rows;
    return {
        strokes,
        nextCursor: strokes.at(-1)?._id.toString() ?? after ?? null,
        hasMore,
    };
}
