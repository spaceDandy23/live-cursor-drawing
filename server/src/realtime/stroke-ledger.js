// Two short recovery windows allow a missed batch and then a full-stroke replay.
// Keep this centralized until real network measurements justify tuning it.
export const RECOVERY_TIMEOUT_MS = 1500;

export class StrokeLedger {
    constructor({ sendOwner, broadcast, timeoutMs = RECOVERY_TIMEOUT_MS }) {
        this.strokes = new Map();
        this.sendOwner = sendOwner;
        this.broadcast = broadcast;
        this.timeoutMs = timeoutMs;
    }

    get(strokeId) {
        if (!this.strokes.has(strokeId)) {
            this.strokes.set(strokeId, {
                start: null, batches: new Map(), pending: new Map(),
                expected: 0, end: null, pendingEnd: null, timer: null, stage: 0,
            });
        }
        return this.strokes.get(strokeId);
    }

    ack(strokeId, phase, state, duplicate = false) {
        this.sendOwner('stroke:ack', {
            strokeId, phase, duplicate,
            ...(phase === 'points' ? { acknowledgedSequence: state.expected - 1 } : {}),
        });
    }

    clearRecovery(state) {
        clearTimeout(state.timer);
        state.timer = null;
        state.stage = 0;
    }

    recover(strokeId, state) {
        if (state.timer || state.end) return;
        const request = () => {
            if (!state.start || state.stage >= 1) {
                this.sendOwner('stroke:request-full', { strokeId });
            } else {
                this.sendOwner('stroke:request-missing', {
                    strokeId, missingSequence: state.expected,
                });
            }
            state.timer = setTimeout(() => {
                state.timer = null;
                if (state.start && state.stage === 0) {
                    state.stage = 1;
                    request();
                } else {
                    this.broadcast('stroke:abandoned', { strokeId });
                    this.sendOwner('stroke:abandoned', { strokeId });
                    this.strokes.delete(strokeId);
                }
            }, this.timeoutMs);
            state.timer.unref?.();
        };
        request();
    }

    start(payload) {
        const state = this.get(payload.strokeId);
        if (state.start) {
            this.ack(payload.strokeId, 'start', state, true);
            return;
        }
        state.start = payload;
        this.broadcast('stroke:start', payload);
        this.ack(payload.strokeId, 'start', state);
        this.drain(payload.strokeId, state);
    }

    points(payload) {
        const state = this.get(payload.strokeId);
        if (state.end || payload.sequence < state.expected || state.pending.has(payload.sequence)) {
            this.ack(payload.strokeId, 'points', state, true);
            return;
        }
        // Bound out-of-order memory from a malformed or very stale peer.
        if (payload.sequence - state.expected > 256 || state.pending.size >= 256) return;
        state.pending.set(payload.sequence, payload);
        this.drain(payload.strokeId, state);
    }

    end(payload) {
        const state = this.get(payload.strokeId);
        if (state.end) {
            this.ack(payload.strokeId, 'end', state, true);
            return;
        }
        state.pendingEnd = payload;
        this.drain(payload.strokeId, state);
    }

    drain(strokeId, state) {
        if (!state.start) {
            this.recover(strokeId, state);
            return;
        }
        let advanced = false;
        while (state.pending.has(state.expected)) {
            const batch = state.pending.get(state.expected);
            state.pending.delete(state.expected);
            state.batches.set(state.expected, batch);
            this.broadcast('stroke:points', batch);
            state.expected += 1;
            advanced = true;
        }
        if (advanced) this.ack(strokeId, 'points', state);
        if (state.pendingEnd && state.pendingEnd.lastSequence === state.expected - 1) {
            state.end = state.pendingEnd;
            state.pendingEnd = null;
            this.broadcast('stroke:end', state.end);
            this.ack(strokeId, 'end', state);
            this.clearRecovery(state);
        } else if (state.pending.size || state.pendingEnd) {
            // Restart recovery when progress changes the missing sequence.
            if (advanced) this.clearRecovery(state);
            this.recover(strokeId, state);
        } else {
            this.clearRecovery(state);
        }
    }

    replayTo(strokeId, send, missingSequence = null) {
        const state = this.strokes.get(strokeId);
        if (!state?.start) return false;
        if (missingSequence !== null) {
            const batch = state.batches.get(missingSequence);
            if (!batch) return false;
            send('stroke:points', batch);
            return true;
        }
        send('stroke:start', state.start);
        for (let sequence = 0; sequence < state.expected; sequence += 1) {
            send('stroke:points', state.batches.get(sequence));
        }
        if (state.end) send('stroke:end', state.end);
        return true;
    }

    dispose() {
        for (const state of this.strokes.values()) clearTimeout(state.timer);
        this.strokes.clear();
    }
}
