const isPoint = point => point &&
    Number.isFinite(point.x) && Number.isFinite(point.y);

const isStrokeId = strokeId => typeof strokeId === "string" &&
    strokeId.length > 0 && strokeId.length <= 128;

export const parseClientEvent = (bytes) => {
    const event = JSON.parse(bytes.toString());
    if (!event || typeof event !== "object" || !event.payload ||
        typeof event.payload !== "object" || Array.isArray(event.payload)) {
        throw new Error("Invalid event envelope");
    }

    const { type, payload } = event;
    switch (type) {
        case "cursor:move":
            if (!isPoint(payload)) break;
            return { type, payload: { x: payload.x, y: payload.y } };
        case "stroke:start":
            if (!isStrokeId(payload.strokeId) || !isPoint(payload.moveTo) ||
                typeof payload.color !== "string" || !payload.color ||
                typeof payload.erase !== "boolean") break;
            return { type, payload: {
                strokeId: payload.strokeId,
                moveTo: { x: payload.moveTo.x, y: payload.moveTo.y },
                color: payload.color,
                erase: payload.erase,
            } };
        case "stroke:points":
            if (!isStrokeId(payload.strokeId) ||
                !Number.isSafeInteger(payload.sequence) || payload.sequence < 0 ||
                !Array.isArray(payload.points) || payload.points.length === 0 ||
                payload.points.length > 500 || !payload.points.every(isPoint)) break;
            return { type, payload: {
                strokeId: payload.strokeId,
                sequence: payload.sequence,
                points: payload.points.map(({ x, y }) => ({ x, y })),
            } };
        case "stroke:end":
            if (!isStrokeId(payload.strokeId) || !Number.isSafeInteger(payload.lastSequence) ||
                payload.lastSequence < -1) break;
            return { type, payload: { strokeId: payload.strokeId, lastSequence: payload.lastSequence } };
        case "stroke:request-missing":
            if (!isStrokeId(payload.strokeId) || !Number.isSafeInteger(payload.missingSequence) ||
                payload.missingSequence < 0) break;
            return { type, payload: { strokeId: payload.strokeId, missingSequence: payload.missingSequence } };
        case "stroke:request-full":
            if (!isStrokeId(payload.strokeId)) break;
            return { type, payload: { strokeId: payload.strokeId } };
        case "stroke:undo":
        case "stroke:redo":
        case "canvas:saved":
            return { type, payload: {} };
        default:
            throw new Error(`Unsupported event type: ${String(type)}`);
    }

    throw new Error(`Invalid payload for ${type}`);
};
