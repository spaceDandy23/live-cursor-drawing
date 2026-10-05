const order = { 'stroke:start': 0, 'stroke:points': 1, 'stroke:end': 2 };

export class StrokeOutbox {
    constructor() {
        this.pending = new Map();
        // Retain the affected stroke until end is ACKed, for full recovery only.
        this.archive = new Map();
    }

    queue(type, payload) {
        if (!(type in order)) return null;
        const eventId = `${payload.strokeId}:${type}:${payload.sequence ?? ''}`;
        const item = { eventId, type, strokeId: payload.strokeId,
            sequence: payload.sequence, payload };
        this.pending.set(eventId, item);
        if (!this.archive.has(payload.strokeId)) this.archive.set(payload.strokeId, new Map());
        this.archive.get(payload.strokeId).set(eventId, item);
        return item;
    }

    ordered(items = this.pending.values()) {
        const strokeOrder = [...this.archive.keys()];
        return [...items].sort((a, b) =>
            strokeOrder.indexOf(a.strokeId) - strokeOrder.indexOf(b.strokeId) ||
            order[a.type] - order[b.type] ||
            (a.sequence ?? -1) - (b.sequence ?? -1));
    }

    pendingOrdered() { return this.ordered(); }

    fullStroke(strokeId) {
        return this.ordered(this.archive.get(strokeId)?.values() ?? []);
    }

    missing(strokeId, sequence) {
        return this.archive.get(strokeId)?.get(`${strokeId}:stroke:points:${sequence}`);
    }

    ack({ strokeId, phase, acknowledgedSequence }) {
        let count = 0;
        for (const item of this.pending.values()) {
            if (item.strokeId !== strokeId) continue;
            if (phase === 'end' ||
                (phase === 'start' && item.type === 'stroke:start') ||
                (phase === 'points' && item.type === 'stroke:points' &&
                    item.sequence <= acknowledgedSequence) ||
                (phase === 'end' && item.type === 'stroke:end')) {
                this.pending.delete(item.eventId);
                count += 1;
            }
        }
        if (phase === 'end') this.archive.delete(strokeId);
        return count;
    }

    abandon(strokeId) {
        for (const item of this.pending.values()) {
            if (item.strokeId === strokeId) this.pending.delete(item.eventId);
        }
        this.archive.delete(strokeId);
    }
}
